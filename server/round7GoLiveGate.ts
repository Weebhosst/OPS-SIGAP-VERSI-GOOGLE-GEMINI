import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { closePostgresPool, getPostgresPool } from './db/postgres';
import { config, validateRuntimeConfig } from './config';

type Row = Record<string, any>;

async function main() {
  if (config.databaseProvider !== 'postgres') {
    throw new Error('ROUND7_GATE_REQUIRES_POSTGRES');
  }
  if (config.isProduction) validateRuntimeConfig();

  const client = await getPostgresPool().connect();
  const blockers: string[] = [];
  const reviews: string[] = [];

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const q = async (sql: string, params: unknown[] = []) =>
      (await client.query(sql, params)).rows as Row[];

    const [
      master,
      userCounts,
      duplicateNpk,
      duplicateEmail,
      suspiciousUsers,
      missingAssignments,
      assignmentMismatch,
      sites,
      siteIssues,
      checkpointSummary,
      checkpointGeometryIssues,
      checkpointTokenIssues,
      operational,
      suspiciousOperational,
      orphanAuth,
      fkSummary,
      migrations,
      passwordRows,
    ] = await Promise.all([
      q(`
        SELECT
          (SELECT count(*)::int FROM customers) customers_total,
          (SELECT count(*)::int FROM customers WHERE status='ACTIVE') customers_active,
          (SELECT count(*)::int FROM sites) sites_total,
          (SELECT count(*)::int FROM sites WHERE status='ACTIVE') sites_active,
          (SELECT count(*)::int FROM users) users_total,
          (SELECT count(*)::int FROM users WHERE status='ACTIVE') users_active,
          (SELECT count(*)::int FROM checkpoints) checkpoints_total,
          (SELECT count(*)::int FROM checkpoints WHERE status='ACTIVE') checkpoints_active
      `),
      q(`
        SELECT role, status, count(*)::int count
        FROM users
        GROUP BY role, status
        ORDER BY role, status
      `),
      q(`
        SELECT count(*)::int groups
        FROM (
          SELECT lower(npk)
          FROM users
          GROUP BY lower(npk)
          HAVING count(*) > 1
        ) d
      `),
      q(`
        SELECT count(*)::int groups
        FROM (
          SELECT lower(email)
          FROM users
          GROUP BY lower(email)
          HAVING count(*) > 1
        ) d
      `),
      q(`
        SELECT id
        FROM users
        WHERE lower(id) ~ '(demo|test|uat|seed)'
           OR lower(name) ~ '(demo|test|uat|seed)'
           OR lower(coalesce(email,'')) ~ '(demo|test|uat|seed)'
        ORDER BY id
      `),
      q(`
        SELECT u.id, u.role
        FROM users u
        LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current
        WHERE u.status='ACTIVE'
          AND u.role <> 'SUPER_ADMIN'
          AND a.id IS NULL
        ORDER BY u.id
      `),
      q(`
        SELECT a.id, a.user_id
        FROM user_assignments a
        JOIN sites s ON s.id=a.site_id
        WHERE a.is_current
          AND a.customer_id IS DISTINCT FROM s.customer_id
        ORDER BY a.user_id
      `),
      q(`
        SELECT
          s.id, s.code, s.name, s.status, s.customer_id,
          s.personnel_capacity, s.target_rounds_per_shift, s.timezone,
          count(DISTINCT cp.id)::int checkpoint_count,
          count(DISTINCT CASE WHEN u.status='ACTIVE' AND a.is_current THEN u.id END)::int active_assigned_users
        FROM sites s
        LEFT JOIN checkpoints cp ON cp.site_id=s.id
        LEFT JOIN user_assignments a ON a.site_id=s.id AND a.is_current
        LEFT JOIN users u ON u.id=a.user_id
        GROUP BY s.id
        ORDER BY s.code
      `),
      q(`
        SELECT id, code
        FROM sites
        WHERE customer_id IS NULL
           OR personnel_capacity IS NULL
           OR personnel_capacity < 1
           OR target_rounds_per_shift IS NULL
           OR target_rounds_per_shift < 1
           OR target_rounds_per_shift > 20
           OR timezone IS NULL
           OR btrim(timezone) = ''
        ORDER BY code
      `),
      q(`
        SELECT
          count(*)::int total,
          count(*) FILTER (WHERE status='ACTIVE')::int active,
          count(*) FILTER (WHERE qr_status='ACTIVE')::int qr_active
        FROM checkpoints
      `),
      q(`
        SELECT id, site_id, code
        FROM checkpoints
        WHERE latitude IS NULL
           OR longitude IS NULL
           OR latitude NOT BETWEEN -90 AND 90
           OR longitude NOT BETWEEN -180 AND 180
           OR radius_meter IS NULL
           OR radius_meter < 1
        ORDER BY site_id, code
      `),
      q(`
        SELECT c.id, c.site_id, c.code
        FROM checkpoints c
        LEFT JOIN checkpoint_tokens t ON t.checkpoint_id=c.id
        GROUP BY c.id
        HAVING
          (c.qr_status='ACTIVE' AND count(t.id) FILTER (WHERE t.status='ACTIVE') = 0)
          OR count(t.id) FILTER (WHERE t.status='ACTIVE') > 1
        ORDER BY c.site_id, c.code
      `),
      q(`
        SELECT
          (SELECT count(*)::int FROM shift_sessions) shift_sessions,
          (SELECT count(*)::int FROM shift_sessions WHERE status='ACTIVE') active_shift_sessions,
          (SELECT count(*)::int FROM patrol_logs) patrol_logs,
          (SELECT count(*)::int FROM incident_reports) incidents,
          (SELECT count(*)::int FROM handovers) handovers,
          (SELECT count(*)::int FROM media) media,
          (SELECT count(*)::int FROM validation_alerts) validation_alerts,
          (SELECT count(*)::int FROM validation_alerts WHERE status='OPEN') open_validation_alerts,
          (SELECT count(*)::int FROM radius_calibrations) radius_calibrations,
          (SELECT count(*)::int FROM auth_sessions) auth_sessions
      `),
      q(`
        SELECT entity, id FROM (
          SELECT 'shift_sessions' entity, id FROM shift_sessions WHERE lower(id) ~ '(demo|test|uat|seed)'
          UNION ALL SELECT 'patrol_logs', id FROM patrol_logs WHERE lower(id) ~ '(demo|test|uat|seed)'
          UNION ALL SELECT 'incident_reports', id FROM incident_reports WHERE lower(id) ~ '(demo|test|uat|seed)'
          UNION ALL SELECT 'handovers', id FROM handovers WHERE lower(id) ~ '(demo|test|uat|seed)'
          UNION ALL SELECT 'media', id FROM media WHERE lower(id) ~ '(demo|test|uat|seed)'
          UNION ALL SELECT 'validation_alerts', id FROM validation_alerts WHERE lower(id) ~ '(demo|test|uat|seed)'
          UNION ALL SELECT 'radius_calibrations', id FROM radius_calibrations WHERE lower(id) ~ '(demo|test|uat|seed)'
        ) x
        ORDER BY entity, id
      `),
      q(`
        SELECT count(*)::int count
        FROM auth_sessions a
        LEFT JOIN users u ON u.id=a.user_id
        WHERE u.id IS NULL
      `),
      q(`
        SELECT
          count(*)::int total,
          count(*) FILTER (WHERE convalidated)::int validated,
          count(*) FILTER (WHERE NOT convalidated)::int unvalidated
        FROM pg_constraint
        WHERE contype='f'
          AND connamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      `),
      q(`SELECT version, checksum FROM app_migrations ORDER BY version`),
      q(`
        SELECT id, npk, password_hash, must_change_password
        FROM users
        WHERE status='ACTIVE'
        ORDER BY id
      `),
    ]);

    const m = master[0] || {};
    const op = operational[0] || {};
    const fk = fkSummary[0] || {};

    if ((m.customers_active || 0) < 1) blockers.push('Tidak ada customer ACTIVE.');
    if ((m.sites_active || 0) < 1) blockers.push('Tidak ada site ACTIVE.');
    if ((m.users_active || 0) < 1) blockers.push('Tidak ada user ACTIVE.');
    if ((m.checkpoints_active || 0) < 1) blockers.push('Tidak ada checkpoint ACTIVE.');

    const activeSuperAdmins = userCounts
      .filter((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE')
      .reduce((sum, r) => sum + Number(r.count || 0), 0);
    if (activeSuperAdmins < 1) blockers.push('Tidak ada SUPER_ADMIN ACTIVE.');

    if (Number(duplicateNpk[0]?.groups || 0) > 0) blockers.push('Terdapat duplicate NPK.');
    if (Number(duplicateEmail[0]?.groups || 0) > 0) blockers.push('Terdapat duplicate email.');
    if (suspiciousUsers.length > 0) blockers.push(`Masih ada user DEMO/TEST/UAT/SEED: ${suspiciousUsers.map((r) => r.id).join(', ')}`);
    if (missingAssignments.length > 0) blockers.push(`User operasional tanpa current assignment: ${missingAssignments.map((r) => r.id).join(', ')}`);
    if (assignmentMismatch.length > 0) blockers.push('Assignment customer/site tidak konsisten.');
    if (siteIssues.length > 0) blockers.push(`Site master invalid: ${siteIssues.map((r) => r.code).join(', ')}`);
    if (checkpointGeometryIssues.length > 0) blockers.push('Terdapat checkpoint dengan koordinat/radius invalid.');
    if (checkpointTokenIssues.length > 0) blockers.push('Terdapat checkpoint dengan integritas QR/token invalid.');
    if (Number(op.active_shift_sessions || 0) > 0) blockers.push('Masih ada shift session ACTIVE sebelum go-live gate.');
    if (Number(op.open_validation_alerts || 0) > 0) blockers.push('Masih ada validation alert OPEN sebelum go-live gate.');
    if (suspiciousOperational.length > 0) blockers.push('Masih ada operational record ber-ID DEMO/TEST/UAT/SEED.');
    if (Number(orphanAuth[0]?.count || 0) > 0) blockers.push('Terdapat orphan auth session.');
    if (Number(fk.unvalidated || 0) > 0) blockers.push('Terdapat foreign key yang belum validated.');

    const weakCredentialIds: string[] = [];
    const weakWithoutRotationIds: string[] = [];
    for (const row of passwordRows) {
      const weak = await bcrypt.compare(String(row.npk), String(row.password_hash));
      if (weak) {
        weakCredentialIds.push(String(row.id));
        if (!row.must_change_password) weakWithoutRotationIds.push(String(row.id));
      }
    }
    if (weakWithoutRotationIds.length > 0) {
      blockers.push(`Password masih sama dengan NPK tanpa forced rotation: ${weakWithoutRotationIds.join(', ')}`);
    }
    if (weakCredentialIds.length > 0) {
      reviews.push(`Akun dengan temporary password=NPK namun dilindungi forced rotation: ${weakCredentialIds.join(', ')}`);
    }

    const migrationDir = path.resolve(process.cwd(), 'server/db/migrations');
    const expected = fs.readdirSync(migrationDir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    const appliedByVersion = new Map(migrations.map((r) => [String(r.version), String(r.checksum)]));
    for (const file of expected) {
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (!appliedByVersion.has(file)) blockers.push(`Migration belum diterapkan: ${file}`);
      else if (appliedByVersion.get(file) !== checksum) blockers.push(`Checksum migration berbeda: ${file}`);
    }

    const zeroCheckpointSites = sites.filter((s) => s.status === 'ACTIVE' && Number(s.checkpoint_count || 0) === 0);
    if (zeroCheckpointSites.length > 0) {
      reviews.push(`Site ACTIVE tanpa checkpoint: ${zeroCheckpointSites.map((s) => s.code).join(', ')}. Diperbolehkan hanya bila site belum masuk scope patroli QR.`);
    }

    const report = {
      gate: 'OPS_SIGAP_ROUND7_GO_LIVE',
      mode: 'READ_ONLY',
      source: 'PRODUCTION_POSTGRESQL',
      generatedAt: new Date().toISOString(),
      success: blockers.length === 0,
      blockers,
      reviews,
      master: m,
      users: {
        roleStatus: userCounts,
        duplicateNpkGroups: Number(duplicateNpk[0]?.groups || 0),
        duplicateEmailGroups: Number(duplicateEmail[0]?.groups || 0),
        suspiciousUserCount: suspiciousUsers.length,
        missingOperationalAssignmentCount: missingAssignments.length,
        assignmentMismatchCount: assignmentMismatch.length,
        weakCredentialCount: weakCredentialIds.length,
        weakWithoutForcedRotationCount: weakWithoutRotationIds.length,
      },
      sites,
      checkpoints: {
        summary: checkpointSummary[0] || {},
        geometryIssueCount: checkpointGeometryIssues.length,
        tokenIssueCount: checkpointTokenIssues.length,
      },
      operational: op,
      integrity: {
        orphanAuthSessions: Number(orphanAuth[0]?.count || 0),
        foreignKeys: fk,
        migrationsExpected: expected.length,
        migrationsApplied: migrations.length,
      },
    };

    console.log('[ROUND7_GO_LIVE_GATE] ' + JSON.stringify(report));
    await client.query('ROLLBACK');

    if (blockers.length > 0) process.exitCode = 1;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error('[ROUND7_GO_LIVE_GATE_FAILED]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
