/**
 * OPS SIGAP — Full-Stack Server Entry Point
 * Express server with Vite middleware integration on Port 3000
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { apiRouter } from './server/routes';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON and urlencoded payloads (sufficient for base64 photo capture evidence)
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OPS SIGAP] Server listening on http://0.0.0.0:${PORT} (Port 3000)`);
  });
}

startServer().catch((err) => {
  console.error('[OPS SIGAP] Fatal error during startup:', err);
  process.exit(1);
});
