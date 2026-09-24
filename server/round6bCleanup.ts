import { closePostgresPool, getPostgresPool } from './db/postgres';
import { deleteMediaObject, readMediaObject } from './mediaStorage';
import { RepositoryError } from './repositories/contracts';

const DEMO_USER_ID = 'USR-SUPER-999';
const TARGET_SESSION_IDS = ['SES-1790263271718-51a1z', 'SES-1790266261519-ghmue'];
const TARGET_HANDOVER_IDS = ['HND-NAIK-1790263283634', 'HND-NAIK-1790266269553'];
const TARGET_MEDIA = [
  {
    id: 'MED-HND-NAIK-1790263283634',
    key: 'ops-sigap/2026/09/BB92/SERTIGAS_NAIK_JAGA/MED-HND-NAIK-1790263283634.jpg',
  },
  {
    id: 'MED-HND-NAIK-1790266269553',
    key: 'ops-sigap/2026/09/BB92/SERTIGAS_NAIK_JAGA/MED-HND-NAIK-1790266269553.jpg',
  },
];
const TARGET_PATROL_LOG_ID = 'LOG-1790266418972-vk8mo';
const TARGET_ALERT_ID = 'ALT-LOG-1790266418972-vk8mo';
const TARGET_CALIBRATIONS = ['CAL-BB92-001', 'CAL-BB92-002', 'CAL-BB92-003'];
const ORIGINAL_UAT_AUDIT_IDS = [
  'AUD-1790178959049-yaw3h',
  'AUD-1790263271723-nccqh',
  'AUD-1790263283826-90mva',
  'AUD-1790263355025-g411b',
  'AUD-1790266261536-3sga4',
  'AUD-1790266269719-lqtog',
];
const CLEANUP_AUDIT_ID = 'AUD-R6B-CLEANUP-20260925';

async function main() {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const activeTarget = await client.query(
      `SELECT id FROM shift_sessions WHERE id = ANY($1::text[]) AND status='ACTIVE'`,
      [TARGET_SESSION_IDS],
    );
    if (activeTarget.rowCount) {
      throw new Error('Round 6B cleanup dihentikan karena masih ada target UAT session berstatus ACTIVE.');
    }

    await client.query('DELETE FROM validation_alerts WHERE id=$1', [TARGET_ALERT_ID]);

    await client.query(
      `DELETE FROM incident_media
       WHERE incident_id IN (
         SELECT id FROM incident_reports WHERE session_id = ANY($1::text[])
       )`,
      [TARGET_SESSION_IDS],
    );

    await client.query('DELETE FROM handover_media WHERE handover_id = ANY($1::text[])', [TARGET_HANDOVER_IDS]);
    await client.query('DELETE FROM shift_documentation WHERE session_id = ANY($1::text[])', [TARGET_SESSION_IDS]);
    await client.query('DELETE FROM media WHERE id = ANY($1::text[])', [TARGET_MEDIA.map((item) => item.id)]);
    await client.query('DELETE FROM patrol_logs WHERE id=$1', [TARGET_PATROL_LOG_ID]);
    await client.query('DELETE FROM patrol_rounds WHERE session_id = ANY($1::text[])', [TARGET_SESSION_IDS]);
    await client.query('DELETE FROM incident_reports WHERE session_id = ANY($1::text[])', [TARGET_SESSION_IDS]);
    await client.query('DELETE FROM handovers WHERE id = ANY($1::text[])', [TARGET_HANDOVER_IDS]);
    await client.query('DELETE FROM shift_sessions WHERE id = ANY($1::text[])', [TARGET_SESSION_IDS]);
    await client.query('DELETE FROM radius_calibrations WHERE id = ANY($1::text[])', [TARGET_CALIBRATIONS]);

    await client.query('DELETE FROM audit_logs WHERE id = ANY($1::text[])', [ORIGINAL_UAT_AUDIT_IDS]);
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [DEMO_USER_ID]);
    await client.query(
      'DELETE FROM admin_filter_state WHERE user_id=$1 OR member_user_id=$1',
      [DEMO_USER_ID],
    );

    await client.query('DELETE FROM users WHERE id=$1', [DEMO_USER_ID]);

    await client.query(
      `INSERT INTO audit_logs (
         id, actor_user_id, actor_role, action, entity_type, entity_id,
         before_data, after_data, metadata, ip_address, user_agent, created_at
       ) VALUES (
         $1, 'USR-SUPER-001', 'SUPER_ADMIN', 'ROUND6B_UAT_CLEANUP',
         'round6b_cleanup', 'ROUND6B-20260925',
         NULL, NULL, $2::jsonb, NULL, 'round6b-cleanup-script', now()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        CLEANUP_AUDIT_ID,
        JSON.stringify({
          demoUserRemoved: DEMO_USER_ID,
          targetSessionsRemoved: TARGET_SESSION_IDS.length,
          targetPatrolLogsRemoved: 1,
          targetHandoversRemoved: TARGET_HANDOVER_IDS.length,
          targetMediaRowsRemoved: TARGET_MEDIA.length,
          targetValidationAlertsRemoved: 1,
          targetRadiusCalibrationsRemoved: TARGET_CALIBRATIONS.length,
          siteAISRetained: true,
        }),
      ],
    );

    await client.query('COMMIT');

    const storage = [];
    for (const item of TARGET_MEDIA) {
      await deleteMediaObject(item.key);
      let deleted = false;
      try {
        await readMediaObject({
          id: item.id,
          storageProvider: 'railway_s3',
          storageKey: item.key,
          mimeType: 'image/jpeg',
          fileName: item.id + '.jpg',
        });
      } catch (error) {
        if (error instanceof RepositoryError && error.code === 'MEDIA_OBJECT_NOT_FOUND') {
          deleted = true;
        } else {
          throw error;
        }
      }
      storage.push({ id: item.id, deleted });
    }

    const [master, operational, sites] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*)::int FROM customers) AS customers,
        (SELECT count(*)::int FROM sites) AS sites,
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM checkpoints) AS checkpoints,
        (SELECT count(*)::int FROM users WHERE id=$1) AS demo_users`, [DEMO_USER_ID]),
      pool.query(`SELECT
        (SELECT count(*)::int FROM shift_sessions) AS shift_sessions,
        (SELECT count(*)::int FROM shift_sessions WHERE status='ACTIVE') AS active_shift_sessions,
        (SELECT count(*)::int FROM patrol_logs) AS patrol_logs,
        (SELECT count(*)::int FROM incident_reports) AS incidents,
        (SELECT count(*)::int FROM handovers) AS handovers,
        (SELECT count(*)::int FROM media) AS media,
        (SELECT count(*)::int FROM validation_alerts) AS validation_alerts,
        (SELECT count(*)::int FROM radius_calibrations) AS radius_calibrations`),
      pool.query(`SELECT id, code, name, status, personnel_capacity, target_rounds_per_shift
        FROM sites ORDER BY code`),
    ]);

    console.log('[ROUND6B_CLEANUP_RESULT]', JSON.stringify({
      success: true,
      master: master.rows[0],
      operational: operational.rows[0],
      sites: sites.rows,
      storage,
    }));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[ROUND6B_CLEANUP_FAILED]', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    client.release();
    await closePostgresPool();
  }
}

main();
