import 'dotenv/config';

export type DatabaseProvider = 'json' | 'postgres';

function databaseProvider(value: string | undefined): DatabaseProvider {
  if (!value || value === 'json') return 'json';
  if (value === 'postgres') return 'postgres';
  throw new Error('DATABASE_PROVIDER harus json atau postgres.');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const appUrl = process.env.APP_URL || '';
const allowedOrigins = [
  ...String(process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
  ...(appUrl && !appUrl.startsWith('MY_') ? [appUrl] : []),
];

export const config = Object.freeze({
  databaseProvider: databaseProvider(process.env.DATABASE_PROVIDER),
  databaseUrl: process.env.DATABASE_URL || '',
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 3000,
  appUrl,
  allowedOrigins: [...new Set(allowedOrigins)],
  sessionTtlHours: Math.min(24, Math.max(1, Number(process.env.SESSION_TTL_HOURS) || 12)),
  loginMaxAttempts: Math.min(20, Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS) || 5)),
  loginLockMinutes: Math.min(60, Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES) || 15)),
  sessionSecret: process.env.SESSION_SECRET || '',
  checkpointTokenSecret: process.env.CHECKPOINT_TOKEN_SECRET || process.env.SESSION_SECRET || '',
  timezone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
  mediaProvider: process.env.MEDIA_PROVIDER || 'local',
  mediaBucket: process.env.MEDIA_BUCKET || '',
  mediaAccessKeyId: process.env.MEDIA_ACCESS_KEY_ID || '',
  mediaSecretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY || '',
  mediaRegion: process.env.MEDIA_REGION || 'auto',
  mediaEndpoint: process.env.MEDIA_ENDPOINT || '',
  mediaUrlStyle: process.env.MEDIA_URL_STYLE === 'path' ? 'path' : 'virtual',
  jsonDataFile: process.env.OPS_SIGAP_DATA_FILE || 'data/ops-sigap.json',
});

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) throw new Error('DATABASE_URL wajib diisi untuk DATABASE_PROVIDER=postgres.');
  return config.databaseUrl;
}


export function validateRuntimeConfig(): void {
  if (!config.isProduction) return;

  const problems: string[] = [];
  if (config.databaseProvider !== 'postgres') problems.push('DATABASE_PROVIDER=postgres wajib untuk production.');
  if (!config.databaseUrl) problems.push('DATABASE_URL wajib untuk production.');
  if (config.sessionSecret.length < 32) problems.push('SESSION_SECRET minimal 32 karakter.');
  if (config.checkpointTokenSecret.length < 32) problems.push('CHECKPOINT_TOKEN_SECRET minimal 32 karakter.');
  if (!config.appUrl || !/^https:\/\//i.test(config.appUrl)) problems.push('APP_URL HTTPS wajib untuk production.');
  if (config.mediaProvider !== 'railway_s3') problems.push('MEDIA_PROVIDER=railway_s3 wajib untuk production.');
  for (const [name, value] of [
    ['MEDIA_BUCKET', config.mediaBucket],
    ['MEDIA_ACCESS_KEY_ID', config.mediaAccessKeyId],
    ['MEDIA_SECRET_ACCESS_KEY', config.mediaSecretAccessKey],
    ['MEDIA_ENDPOINT', config.mediaEndpoint],
  ] as const) {
    if (!value) problems.push(`${name} wajib untuk production.`);
  }
  if (problems.length) {
    throw new Error(`Konfigurasi production OPS SIGAP tidak aman:\n- ${problems.join('\n- ')}`);
  }
}
