import express from 'express';
import { hashPassword, verifyPassword, encryptSecret } from '../crypto.js';
import { requireAuth, csrfProtect } from '../sessions.js';
import { UserError } from '../gitlab.js';
import { curlCommand } from '../bash.js';
import { baseUrlFor } from './public.js';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FONTS = ['system', 'inter', 'serif', 'mono'];
const THEMES = ['dark', 'light'];

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireString(body, field, { max = 500, min = 1 } = {}) {
  const value = body?.[field];
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw new UserError(`Feld "${field}" fehlt oder ist ungültig.`);
  }
  return value.trim();
}

function sanitizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.slice(0, 10).map((l) => ({
    label: String(l?.label || '').slice(0, 60),
    url: String(l?.url || '').slice(0, 500),
  })).filter((l) => l.label && /^(https?:\/\/|\/|mailto:)/.test(l.url));
}

export function createAdminRouter({ db, config, scriptService, nginxManager, sessions, events, limiter }) {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  const publicScriptView = (req, script) => ({
    ...script,
    source: { ...script.source, tokenEnc: undefined, hasToken: Boolean(script.source.tokenEnc) },
    curl: curlCommand(baseUrlFor(req, db, config), script.slug),
  });

  // ---------- Auth (no session required) ----------

  router.get('/setup-status', (req, res) => {
    res.json({ needsSetup: db.data.users.length === 0 });
  });

  router.post('/setup', asyncHandler(async (req, res) => {
    if (db.data.users.length > 0) {
      throw new UserError('Setup wurde bereits abgeschlossen.', 403);
    }
    if (!limiter.allow(`setup:${req.ip}`, 5, 15 * 60 * 1000)) {
      throw new UserError('Zu viele Versuche. Bitte später erneut versuchen.', 429);
    }
    const username = requireString(req.body, 'username', { max: 40, min: 3 });
    const password = requireString(req.body, 'password', { max: 200, min: 10 });
    if (!USERNAME_RE.test(username)) {
      throw new UserError('Benutzername: 3–40 Zeichen, nur Buchstaben, Zahlen, ., _ und -.');
    }
    const user = {
      id: db.newId(),
      username,
      passwordHash: hashPassword(password),
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    db.data.users.push(user);
    db.save();
    const { sid, session } = sessions.create(user.id);
    res.setSessionCookie(sid);
    res.json({ ok: true, username: user.username, csrf: session.csrf });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const username = requireString(req.body, 'username', { max: 40 });
    const password = requireString(req.body, 'password', { max: 200 });
    if (!limiter.allow(`login:ip:${req.ip}`, 20, 15 * 60 * 1000)
      || !limiter.allow(`login:user:${username.toLowerCase()}`, 8, 15 * 60 * 1000)) {
      throw new UserError('Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.', 429);
    }
    const user = db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    // Always verify against some hash to keep timing consistent.
    const ok = verifyPassword(password, user?.passwordHash || 'scrypt$16384$8$1$AAAA$AAAA');
    if (!user || !ok) {
      throw new UserError('Benutzername oder Passwort falsch.', 401);
    }
    limiter.reset(`login:user:${username.toLowerCase()}`);
    const { sid, session } = sessions.create(user.id);
    res.setSessionCookie(sid);
    res.json({ ok: true, username: user.username, csrf: session.csrf });
  }));

  // ---------- Everything below requires a session ----------
  router.use(requireAuth, csrfProtect);

  router.get('/me', (req, res) => {
    const user = db.data.users.find((u) => u.id === req.session.userId);
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet.' });
    res.json({ username: user.username, csrf: req.session.csrf });
  });

  router.post('/logout', (req, res) => {
    sessions.destroy(req.sid);
    res.clearSessionCookie();
    res.json({ ok: true });
  });

  router.post('/change-password', asyncHandler(async (req, res) => {
    const current = requireString(req.body, 'currentPassword', { max: 200 });
    const next = requireString(req.body, 'newPassword', { max: 200, min: 10 });
    const user = db.data.users.find((u) => u.id === req.session.userId);
    if (!user || !verifyPassword(current, user.passwordHash)) {
      throw new UserError('Aktuelles Passwort ist falsch.', 403);
    }
    user.passwordHash = hashPassword(next);
    db.save();
    sessions.destroyAllForUser(user.id);
    const { sid, session } = sessions.create(user.id);
    res.setSessionCookie(sid);
    res.json({ ok: true, csrf: session.csrf });
  }));

  // ---------- Scripts ----------

  router.get('/scripts', (req, res) => {
    const list = [...db.data.scripts]
      .sort((a, b) => a.order - b.order)
      .map((s) => publicScriptView(req, s));
    res.json(list);
  });

  router.post('/scripts/import-preview', asyncHandler(async (req, res) => {
    const url = requireString(req.body, 'url', { max: 1000 });
    const token = typeof req.body.token === 'string' ? req.body.token.trim().slice(0, 200) : '';
    const preview = await scriptService.importPreview({ url, token: token || null });
    res.json(preview);
  }));

  router.post('/scripts/preview-file', asyncHandler(async (req, res) => {
    const url = requireString(req.body, 'url', { max: 1000 });
    const path = requireString(req.body, 'path', { max: 500 });
    const token = typeof req.body.token === 'string' ? req.body.token.trim().slice(0, 200) : '';
    const ref = typeof req.body.ref === 'string' ? req.body.ref.slice(0, 200) : null;
    res.json(await scriptService.previewFile({ url, path, ref, token: token || null }));
  }));

  router.post('/scripts', asyncHandler(async (req, res) => {
    const url = requireString(req.body, 'url', { max: 1000 });
    const path = requireString(req.body, 'path', { max: 500 });
    const token = typeof req.body.token === 'string' ? req.body.token.trim().slice(0, 200) : '';
    const ref = typeof req.body.ref === 'string' ? req.body.ref.slice(0, 200) : null;
    const metadata = typeof req.body.metadata === 'object' && req.body.metadata ? req.body.metadata : {};
    const script = await scriptService.createFromGitLab({ url, path, ref, token: token || null, metadata });
    res.status(201).json(publicScriptView(req, script));
  }));

  router.patch('/scripts/:id', (req, res) => {
    const script = scriptService.update(req.params.id, req.body || {});
    res.json(publicScriptView(req, script));
  });

  router.delete('/scripts/:id', (req, res) => {
    scriptService.remove(req.params.id);
    res.json({ ok: true });
  });

  router.post('/scripts/reorder', (req, res) => {
    if (!Array.isArray(req.body?.ids)) throw new UserError('Feld "ids" (Array) fehlt.');
    scriptService.reorder(req.body.ids.map(String));
    res.json({ ok: true });
  });

  router.post('/scripts/:id/refresh', asyncHandler(async (req, res) => {
    const setVersion = typeof req.body?.version === 'string' ? req.body.version.slice(0, 40) : undefined;
    const { script, changed } = await scriptService.refresh(req.params.id, { setVersion });
    res.json({ changed, script: publicScriptView(req, script) });
  }));

  router.get('/scripts/:id/versions/:versionId/content', (req, res) => {
    const { version, content } = scriptService.getVersionContent(req.params.id, req.params.versionId);
    res.json({ version, content });
  });

  router.post('/scripts/:id/versions/:versionId/restore', (req, res) => {
    const script = scriptService.restoreVersion(req.params.id, req.params.versionId);
    res.json(publicScriptView(req, script));
  });

  // ---------- Settings ----------

  const settingsView = () => {
    const s = db.data.settings;
    return {
      branding: s.branding,
      layout: s.layout,
      header: s.header,
      footer: s.footer,
      publicUrl: s.publicUrl,
      nginx: s.nginx,
      gitlab: { hasDefaultToken: Boolean(s.gitlab.defaultTokenEnc) },
    };
  };

  router.get('/settings', (req, res) => res.json(settingsView()));

  router.put('/settings', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const s = db.data.settings;

    if (body.branding) {
      const b = body.branding;
      if (b.title !== undefined) s.branding.title = String(b.title).slice(0, 80) || s.branding.title;
      if (b.description !== undefined) s.branding.description = String(b.description).slice(0, 300);
      if (b.logo !== undefined) {
        const logo = String(b.logo);
        if (logo && !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(logo) && logo.length > 8) {
          throw new UserError('Logo muss ein Bild-Upload (data-URL) oder ein Emoji sein.');
        }
        if (logo.length > 400 * 1024) throw new UserError('Logo ist zu groß (max. 300 KB).');
        s.branding.logo = logo;
      }
      for (const key of ['primaryColor', 'accentColor']) {
        if (b[key] !== undefined) {
          if (!HEX_COLOR_RE.test(b[key])) throw new UserError(`Farbe "${key}" muss ein Hex-Wert sein (#rrggbb).`);
          s.branding[key] = b[key];
        }
      }
      if (b.font !== undefined) {
        if (!FONTS.includes(b.font)) throw new UserError('Unbekannte Schriftart.');
        s.branding.font = b.font;
      }
      if (b.defaultTheme !== undefined) {
        if (!THEMES.includes(b.defaultTheme)) throw new UserError('Unbekanntes Theme.');
        s.branding.defaultTheme = b.defaultTheme;
      }
    }

    if (body.layout) {
      const l = body.layout;
      if (l.columns !== undefined) {
        if (!['auto', '1', '2', '3', '4', 1, 2, 3, 4].includes(l.columns)) throw new UserError('Ungültige Spaltenanzahl.');
        s.layout.columns = String(l.columns);
      }
      if (l.cardStyle !== undefined) {
        if (!['comfortable', 'compact'].includes(l.cardStyle)) throw new UserError('Ungültiger Kachel-Stil.');
        s.layout.cardStyle = l.cardStyle;
      }
      for (const key of ['showDownloads', 'showVersion', 'showHero']) {
        if (l[key] !== undefined) s.layout[key] = Boolean(l[key]);
      }
    }

    if (body.header) {
      s.header.links = sanitizeLinks(body.header.links);
    }
    if (body.footer) {
      if (body.footer.text !== undefined) s.footer.text = String(body.footer.text).slice(0, 500);
      if (body.footer.links !== undefined) s.footer.links = sanitizeLinks(body.footer.links);
    }

    if (body.publicUrl !== undefined) {
      const url = String(body.publicUrl).trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\/[\w.:-]+$/.test(url)) {
        throw new UserError('Öffentliche URL muss mit http(s):// beginnen (ohne Pfad).');
      }
      s.publicUrl = url;
    }

    if (body.gitlab) {
      if (typeof body.gitlab.defaultToken === 'string') {
        const token = body.gitlab.defaultToken.trim();
        s.gitlab.defaultTokenEnc = token ? encryptSecret(token, config.sessionSecret) : '';
      }
    }

    if (body.nginx) {
      const n = body.nginx;
      if (n.domain !== undefined) s.nginx.domain = String(n.domain).trim().toLowerCase().slice(0, 253);
      if (n.ssl !== undefined) s.nginx.ssl = Boolean(n.ssl);
      if (n.redirectHttp !== undefined) s.nginx.redirectHttp = Boolean(n.redirectHttp);
      if (n.sslCertPath !== undefined) s.nginx.sslCertPath = String(n.sslCertPath).trim().slice(0, 300);
      if (n.sslKeyPath !== undefined) s.nginx.sslKeyPath = String(n.sslKeyPath).trim().slice(0, 300);
    }

    db.save();
    events.publish('settings:changed', {}, 'all');
    res.json(settingsView());
  }));

  // ---------- NGINX ----------

  router.get('/nginx/preview', (req, res) => {
    res.json({ config: nginxManager.preview(), status: nginxManager.status() });
  });

  router.get('/nginx/status', (req, res) => res.json(nginxManager.status()));

  router.post('/nginx/apply', asyncHandler(async (req, res) => {
    const result = await nginxManager.apply();
    res.json(result);
  }));

  // ---------- Dashboard / realtime ----------

  router.get('/stats', (req, res) => {
    const scripts = db.data.scripts;
    res.json({
      totalScripts: scripts.length,
      activeScripts: scripts.filter((s) => s.active).length,
      totalDownloads: scripts.reduce((sum, s) => sum + (s.downloads || 0), 0),
      lastUpdatedAt: scripts.reduce((max, s) => (s.updatedAt > max ? s.updatedAt : max), ''),
      errors: scripts.filter((s) => s.lastError).map((s) => ({ id: s.id, name: s.name, error: s.lastError })),
    });
  });

  router.get('/events', (req, res) => {
    events.subscribe(req, res, 'admin');
  });

  return router;
}
