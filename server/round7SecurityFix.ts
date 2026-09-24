import bcrypt from 'bcryptjs';
import { closePostgresPool, getPostgresPool } from './db/postgres';
import { config, validateRuntimeConfig } from './config';

type UserRow = {
  id: string;
  npk: string;
  password_hash: string;
  must_change_password: boolean;
  status: string;
};

async function main() {
  if (config.databaseProvider !== 'postgres') {
    throw new Error('ROUND7_SECURITY_FIX_REQUIRES_POSTGRES');
  }
  if (config.isProduction) validateRuntimeConfig();

  const client = await getPostgresPool().connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<UserRow>(`
      SELECT id, npk, password_hash, must_change_password, status
      FROM users
      WHERE status='ACTIVE'
      ORDER BY id
      FOR UPDATE
    `);

    const targets = rows.filter(
      (row) => !row.must_change_password && bcrypt.compareSync(String(row.npk), String(row.password_hash)),
    );

    const updatedIds: string[] = [];

    for (const row of targets) {
      await client.query(
        `
          UPDATE users
          SET must_change_password=true,
              updated_at=now()
          WHERE id=$1
            AND must_change_password=false
        `,
        [row.id],
      );

      await client.query(
        `
          INSERT INTO audit_logs(
            id, actor_user_id, actor_role, action, entity_type, entity_id,
            before_data, after_data, metadata, created_at
          )
          VALUES(
            $1, NULL, 'SYSTEM', 'ROUND7_FORCE_PASSWORD_ROTATION',
            'USER', $2,
            '{"mustChangePassword":false}'::jsonb,
            '{"mustChangePassword":true}'::jsonb,
            '{"reason":"password_equals_npk_detected_by_round7_gate"}'::jsonb,
            now()
          )
        `,
        [`AUD-R7-PWD-${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, row.id],
      );

      updatedIds.push(row.id);
    }

    await client.query('COMMIT');

    console.log('[ROUND7_SECURITY_FIX_RESULT] ' + JSON.stringify({
      success: true,
      activeUsersScanned: rows.length,
      forcedRotationEnabled: updatedIds.length,
      userIds: updatedIds,
    }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error('[ROUND7_SECURITY_FIX_FAILED]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
