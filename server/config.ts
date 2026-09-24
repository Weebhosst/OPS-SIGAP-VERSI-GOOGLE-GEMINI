import 'dotenv/config';

export type DatabaseProvider = 'json' | 'postgres';

function databaseProvider(value: string | undefined): DatabaseProvider {
  if (!value || value === 'json') return 'json';
  if (value === 'postgres') return 'postgres';
  throw new Error('DATABASE_PROVIDER harus json atau postgres.');
}

export const config = Object.freeze({
  databaseProvider: databaseProvider(process.env.DATABASE_PROVIDER),
  databaseUrl: process.env.DATABASE_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  sessionSecret: process.env.SESSION_SECRET || '',
  timezone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
  mediaProvider: process.env.MEDIA_PROVIDER || 'local',
  jsonDataFile: process.env.OPS_SIGAP_DATA_FILE || 'data/ops-sigap.json',
});

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) throw new Error('DATABASE_URL wajib diisi untuk DATABASE_PROVIDER=postgres.');
  return config.databaseUrl;
}
