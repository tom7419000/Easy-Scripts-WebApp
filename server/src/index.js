import { loadConfig } from './config.js';
import { Db } from './db.js';
import { SessionStore } from './sessions.js';
import { EventBus } from './events.js';
import { RateLimiter } from './ratelimit.js';
import { ScriptService } from './scripts.js';
import { NginxManager } from './nginx.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = new Db(config.dataDir);
const events = new EventBus();
const sessions = new SessionStore({
  dataDir: config.dataDir,
  secret: config.sessionSecret,
  ttlMs: config.sessionTtlMs,
});
const limiter = new RateLimiter();
const scriptService = new ScriptService({ db, config, events });
const nginxManager = new NginxManager({ config, db, events });

const app = createApp({ db, config, scriptService, nginxManager, sessions, events, limiter });

const server = app.listen(config.port, config.host, () => {
  console.log(`Easy Scripts WebApp läuft auf http://${config.host}:${config.port}`);
  if (db.data.users.length === 0) {
    console.log('Noch kein Admin-Konto vorhanden – Setup unter /admin öffnen.');
  }
});

// Periodic auto-update of scripts marked with autoUpdate
if (config.refreshIntervalMinutes > 0) {
  const timer = setInterval(async () => {
    try {
      const results = await scriptService.refreshAll();
      const changed = results.filter((r) => r.changed).length;
      if (changed > 0) console.log(`Auto-Update: ${changed} Script(s) aktualisiert.`);
    } catch (err) {
      console.error('Auto-Update fehlgeschlagen:', err.message);
    }
  }, config.refreshIntervalMinutes * 60 * 1000);
  timer.unref();
}

function shutdown(signal) {
  console.log(`${signal} empfangen, fahre herunter …`);
  server.close(() => {
    try { db.flush(); } catch { /* best effort */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
