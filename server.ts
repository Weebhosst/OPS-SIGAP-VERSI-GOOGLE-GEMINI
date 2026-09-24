/**
 * OPS SIGAP — Full-Stack Server Entry Point
 * Express server with Vite middleware integration on Port 3000
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { apiRouter } from './server/routes';
import { config, validateRuntimeConfig } from './server/config';
import { closePostgresPool } from './server/db/postgres';

async function startServer() {
  validateRuntimeConfig();

  const app = express();
  const PORT = config.port;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'",
      );
    }
    next();
  });

  app.use((req, res, next) => {
    if (!config.isProduction || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (fetchSite === 'cross-site') {
      return res.status(403).json({ success: false, code: 'CROSS_SITE_REQUEST_BLOCKED', error: 'Permintaan lintas situs ditolak.' });
    }

    const origin = String(req.headers.origin || '').trim();
    if (origin && config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
      return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin tidak diizinkan.' });
    }
    next();
  });

  // Base64 capture is transient only. Object storage enforces 8 MB per image.
  app.use(express.json({ limit: '32mb' }));
  app.use(express.urlencoded({ extended: true, limit: '32mb' }));
  app.use(cookieParser());

  // Mount API routes
  app.use('/api', apiRouter);

  // Serve app
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OPS SIGAP] Server listening on http://0.0.0.0:${PORT}`);
  });

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.warn(`[OPS SIGAP] Received ${signal}; shutting down gracefully...`);

    httpServer.close(async () => {
      try {
        await closePostgresPool();
        console.log('[OPS SIGAP] HTTP server and PostgreSQL pool closed cleanly.');
      } catch (error) {
        console.error('[OPS SIGAP] Error while closing resources:', error instanceof Error ? error.message : 'unknown');
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[OPS SIGAP] Graceful shutdown timed out; forcing exit.');
      process.exit(1);
    }, 15000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    console.error('[OPS SIGAP] Uncaught exception:', error.message);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[OPS SIGAP] Unhandled rejection:', error.message);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('[OPS SIGAP] Fatal error during startup:', err instanceof Error ? err.message : 'unknown');
  process.exit(1);
});
