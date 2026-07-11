import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { securityHeaders } from './middleware/security.js';
import { sessionMiddleware } from './sessions.js';
import { createPublicRouter } from './routes/public.js';
import { createAdminRouter } from './routes/admin.js';

/**
 * Builds the Express app from its dependencies. Kept as a factory so tests
 * can boot the full stack against a temporary data directory.
 */
export function createApp({ db, config, scriptService, nginxManager, sessions, events, limiter }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', true);

  app.use(securityHeaders);
  app.use(sessionMiddleware(sessions));

  app.use(createPublicRouter({ db, config, scriptService, events }));
  app.use('/api/admin', createAdminRouter({ db, config, scriptService, nginxManager, sessions, events, limiter }));

  // Static assets of the built React app
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  }

  // SPA fallback for browser navigation (public page + /admin routes)
  app.get(/^\/(?!api\/|install\/|healthz).*/, (req, res, next) => {
    if (!fs.existsSync(indexHtml)) {
      return res.status(503).type('text/plain').send(
        'Frontend wurde noch nicht gebaut. Bitte "npm run build" ausführen.\n'
      );
    }
    res.sendFile(indexHtml);
  });

  // Central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Ungültiger Request-Body.' });
    }
    if (err?.expose) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  });

  return app;
}
