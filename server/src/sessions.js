import fs from 'node:fs';
import path from 'node:path';
import { randomToken, hmac } from './crypto.js';

const COOKIE_NAME = 'esw_session';

/**
 * Server-side session store with signed session-id cookies.
 * Sessions are persisted to disk so admin logins survive restarts.
 * Each session carries its own CSRF token (checked on mutating requests).
 */
export class SessionStore {
  constructor({ dataDir, secret, ttlMs }) {
    this.file = path.join(dataDir, 'sessions.json');
    this.secret = secret;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this._load();
    const timer = setInterval(() => this._cleanup(), 15 * 60 * 1000);
    timer.unref?.();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const now = Date.now();
      for (const [sid, sess] of Object.entries(raw)) {
        if (sess.expiresAt > now) this.sessions.set(sid, sess);
      }
    } catch { /* first start */ }
  }

  _persist() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.sessions)), { mode: 0o600 });
    } catch (err) {
      console.error('session persist failed:', err.message);
    }
  }

  _cleanup() {
    const now = Date.now();
    let changed = false;
    for (const [sid, sess] of this.sessions) {
      if (sess.expiresAt <= now) { this.sessions.delete(sid); changed = true; }
    }
    if (changed) this._persist();
  }

  create(userId) {
    const sid = randomToken(32);
    const session = {
      userId,
      csrf: randomToken(24),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(sid, session);
    this._persist();
    return { sid, session };
  }

  get(sid) {
    const session = this.sessions.get(sid);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sid);
      return null;
    }
    // rolling expiry, persisted lazily via cleanup
    session.expiresAt = Date.now() + this.ttlMs;
    return session;
  }

  destroy(sid) {
    this.sessions.delete(sid);
    this._persist();
  }

  destroyAllForUser(userId) {
    for (const [sid, sess] of this.sessions) {
      if (sess.userId === userId) this.sessions.delete(sid);
    }
    this._persist();
  }

  cookieValue(sid) {
    return `${sid}.${hmac(sid, this.secret)}`;
  }

  sidFromCookie(value) {
    if (!value) return null;
    const idx = value.lastIndexOf('.');
    if (idx <= 0) return null;
    const sid = value.slice(0, idx);
    const sig = value.slice(idx + 1);
    if (hmac(sid, this.secret) !== sig) return null;
    return sid;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionMiddleware(store) {
  return (req, res, next) => {
    req.session = null;
    req.sid = null;
    const cookies = parseCookies(req.headers.cookie);
    const sid = store.sidFromCookie(cookies[COOKIE_NAME]);
    if (sid) {
      const session = store.get(sid);
      if (session) {
        req.session = session;
        req.sid = sid;
      }
    }
    res.setSessionCookie = (sid) => {
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.setHeader('Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(store.cookieValue(sid))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(store.ttlMs / 1000)}${secure ? '; Secure' : ''}`);
    };
    res.clearSessionCookie = () => {
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    };
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.session) {
    return res.status(401).json({ error: 'Nicht angemeldet.' });
  }
  next();
}

/** CSRF double check: mutating requests must echo the session's CSRF token. */
export function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session) return res.status(401).json({ error: 'Nicht angemeldet.' });
  const token = req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrf) {
    return res.status(403).json({ error: 'Ungültiges CSRF-Token.' });
  }
  next();
}
