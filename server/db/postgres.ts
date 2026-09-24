import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config, requireDatabaseUrl } from '../config';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'ops-sigap',
      ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: true } : undefined,
    });
    pool.on('error', (error) => console.error('[database] PostgreSQL pool error:', error.message));
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  return getPostgresPool().query<T>(text, values);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function postgresHealth(): Promise<'connected' | 'disconnected'> {
  try { await query('SELECT 1'); return 'connected'; }
  catch (error) { console.error('[database] PostgreSQL health check failed:', error instanceof Error ? error.message : 'unknown'); return 'disconnected'; }
}

export async function closePostgresPool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
