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
  r2AccountId: process.env.R2_ACCOUNT_ID || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  r2Bucket: process.env.R2_BUCKET || '',
  r2Region: process.env.R2_REGION || 'auto',
  r2Endpoint: process.env.R2_ENDPOINT || '',
  r2PresignExpiresSeconds: Math.min(3600, Math.max(60, Number(process.env.R2_PRESIGN_EXPIRES_SECONDS) || 300)),
  jsonDataFile: process.env.OPS_SIGAP_DATA_FILE || 'data/ops-sigap.json',
});

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) throw new Error('DATABASE_URL wajib diisi untuk DATABASE_PROVIDER=postgres.');
  return config.databaseUrl;
}

export function requireR2Config() {
  if (config.mediaProvider !== 'r2') throw new Error('MEDIA_PROVIDER harus r2 untuk menggunakan Cloudflare R2.');
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey || !config.r2Bucket) {
    throw new Error('Konfigurasi R2 belum lengkap. R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET wajib diisi.');
  }
  return {
    accountId: config.r2AccountId,
    accessKeyId: config.r2AccessKeyId,
    secretAccessKey: config.r2SecretAccessKey,
    bucket: config.r2Bucket,
    region: config.r2Region,
    endpoint: config.r2Endpoint || `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    expiresSeconds: config.r2PresignExpiresSeconds,
  };
}
