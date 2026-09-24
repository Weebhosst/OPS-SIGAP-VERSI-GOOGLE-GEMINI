import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getPostgresPool, closePostgresPool } from './postgres';

const migrationsDir = path.resolve(process.cwd(), 'server/db/migrations');

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const pool = getPostgresPool(); const client = await pool.connect();
  const applied: string[] = []; const skipped: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [7481924]);
    await client.query('CREATE TABLE IF NOT EXISTS app_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = fs.readdirSync(migrationsDir).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8'); const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>('SELECT checksum FROM app_migrations WHERE version=$1', [file]);
      if (existing.rows[0]) { if (existing.rows[0].checksum !== checksum) throw new Error(`Migration ${file} telah berubah setelah diterapkan.`); skipped.push(file); continue; }
      await client.query('BEGIN');
      try { await client.query(sql); await client.query('INSERT INTO app_migrations(version,checksum) VALUES($1,$2)', [file, checksum]); await client.query('COMMIT'); applied.push(file); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [7481924]); } finally { client.release(); }
  }
  return { applied, skipped };
}

if (process.argv[1]?.toLowerCase().includes('migrate')) {
  runMigrations().then((result) => console.log(`Migrations applied=${result.applied.length}, skipped=${result.skipped.length}`)).catch((error) => { console.error(`Migration failed: ${error instanceof Error ? error.message : 'unknown'}`); process.exitCode = 1; }).finally(closePostgresPool);
}
