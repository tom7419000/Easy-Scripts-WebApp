import express from 'express';
import { renderIndexScript, curlCommand } from '../bash.js';
import { renderFavicon } from '../favicon.js';

const CLI_UA = /\b(curl|wget|libwww|httpie|fetch)\b/i;

export function isCliRequest(req) {
  const ua = req.headers['user-agent'] || '';
  if (CLI_UA.test(ua)) return true;
  const accept = req.headers.accept || '';
  return accept.includes('text/plain') && !accept.includes('text/html');
}

export function baseUrlFor(req, db, config) {
  const configured = db.data.settings.publicUrl || config.publicUrl;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

export function createPublicRouter({ db, config, scriptService, events }) {
  const router = express.Router();

  const activeScripts = () => db.data.scripts
    .filter((s) => s.active)
    .sort((a, b) => a.order - b.order);

  const sendIndexScript = (req, res) => {
    const { branding } = db.data.settings;
    const body = renderIndexScript({
      baseUrl: baseUrlFor(req, db, config),
      title: branding.title,
      description: branding.description,
      scripts: activeScripts(),
    });
    res.type('text/x-shellscript; charset=utf-8').send(body);
  };

  // curl https://domain/ | bash  → interactive script list.
  // Browsers fall through to the React app (static handler in app.js).
  router.get('/', (req, res, next) => {
    if (isCliRequest(req)) return sendIndexScript(req, res);
    next();
  });

  // Always shell output, regardless of user agent (see task spec: /dashboard).
  router.get(['/dashboard', '/install'], (req, res) => sendIndexScript(req, res));

  // The actual install script: curl -fsSL https://domain/install/<slug> | bash
  // Supports version pinning via /install/<slug>@<version>.
  router.get('/install/:slug', (req, res) => {
    const resolved = scriptService.resolveForServe(req.params.slug);
    if (!resolved) {
      return res.status(404).type('text/x-shellscript; charset=utf-8')
        .send(`#!/usr/bin/env bash\necho "Script '${String(req.params.slug).replace(/[^\w@.-]/g, '')}' wurde nicht gefunden oder ist deaktiviert." >&2\nexit 1\n`);
    }
    const { script, version, content } = resolved;
    scriptService.countDownload(script.id);
    res.set('Cache-Control', 'no-cache');
    res.set('X-Script-Version', version.version);
    res.set('X-Script-SHA256', version.sha256);
    res.set('Content-Disposition', `inline; filename="${script.slug}.sh"`);
    res.type('text/x-shellscript; charset=utf-8').send(content);
  });

  // JSON API for the public React page
  router.get('/api/public/config', (req, res) => {
    const { branding, layout, header, footer } = db.data.settings;
    res.json({
      branding, layout, header, footer,
      baseUrl: baseUrlFor(req, db, config),
    });
  });

  router.get('/api/public/scripts', (req, res) => {
    const baseUrl = baseUrlFor(req, db, config);
    res.json(activeScripts().map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      version: s.version,
      icon: s.icon,
      tags: s.tags,
      downloads: s.downloads,
      updatedAt: s.updatedAt,
      sha256: s.versions.find((v) => v.id === s.currentVersionId)?.sha256 || null,
      curl: curlCommand(baseUrl, s.slug),
    })));
  });

  router.get('/api/public/events', (req, res) => {
    events.subscribe(req, res, 'public');
  });

  router.get('/healthz', (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // Favicon, generated from the branding logo (updates automatically when
  // the admin changes the logo; short cache so changes show up quickly).
  router.get(['/favicon.svg', '/favicon.ico'], (req, res) => {
    const { type, body } = renderFavicon(db.data.settings.branding);
    res.set('Cache-Control', 'public, max-age=300');
    res.type(type).send(body);
  });

  return router;
}
