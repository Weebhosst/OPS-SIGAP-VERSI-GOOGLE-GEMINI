import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

export function requireLegacyJsonProvider(_req: Request, res: Response, next: NextFunction) {
  if (config.databaseProvider !== 'json') {
    return res.status(503).json({
      success: false,
      code: 'POSTGRES_ROUTE_NOT_MIGRATED',
      error: 'Endpoint ini belum dimigrasikan ke repository PostgreSQL. Akses JSON diblokir untuk mencegah split-brain data.',
    });
  }
  next();
}
