import { closePostgresPool, getPostgresPool } from './db/postgres';

type Row = Record<string, unknown>;

async function main() {
  const client = await getPostgresPool().connect();

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const q = async (sql: string) => (await client.query(sql)).rows as Row[];

    const [
      customerSummary,
      customers,
      siteSummary,
      sites,
      userRoleStatus,
      userAssignmentSummary,
      usersMissingAssignment,
      duplicateEmails,
      suspiciousUsers,
      mustChangePassword,
      capacitySanity,
      targetRoundIssues,
      checkpointSummary,
      checkpointsBySite,
      checkpointCoordinateIssues,
      checkpointTokenIssues,
      operationalCounts,
      suspiciousOperational,
      assignmentCustomerSiteMismatch,
    ] = await Promise.all([
      q(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status='ACTIVE')::int AS active,
          count(*) FILTER (WHERE status='INACTIVE')::int AS inactive
        FROM customers
      `),
      q(`
        SELECT id, code, name, status
        FROM customers
        ORDER BY code
      `),
      q(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status='ACTIVE')::int AS active,
          count(*) FILTER (WHERE status='INACTIVE')::int AS inactive
        FROM sites
      `),
      q(`
        SELECT
          s.id, s.code, s.name, s.status, s.customer_id,
          c.code AS customer_code,
          s.personnel_capacity, s.target_rounds_per_shift, s.timezone,
          count(DISTINCT CASE WHEN u.status='ACTIVE' AND a.is_current THEN u.id END)::int AS active_assigned_users,
          count(DISTINCT cp.id)::int AS checkpoint_count
        FROM sites s
        JOIN customers c ON c.id=s.customer_id
        LEFT JOIN user_assignments a ON a.site_id=s.id AND a.is_current
        LEFT JOIN users u ON u.id=a.user_id
        LEFT JOIN checkpoints cp ON cp.site_id=s.id
        GROUP BY s.id, c.code
        ORDER BY s.code
      `),
      q(`
        SELECT role, status, count(*)::int AS count
        FROM users
        GROUP BY role, status
        ORDER BY role, status
      `),
      q(`
        SELECT
          u.role,
          count(*)::int AS total_users,
          count(*) FILTER (WHERE a.id IS NOT NULL)::int AS with_current_assignment,
          count(*) FILTER (WHERE a.id IS NULL)::int AS without_current_assignment
        FROM users u
        LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current
        GROUP BY u.role
        ORDER BY u.role
      `),
      q(`
        SELECT u.id, u.role, u.status
        FROM users u
        LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current
        WHERE a.id IS NULL
        ORDER BY u.role, u.id
      `),
      q(`
        SELECT
          count(*)::int AS count,
          array_agg(id ORDER BY id) AS user_ids
        FROM users
        GROUP BY lower(email)
        HAVING count(*) > 1
        ORDER BY count(*) DESC
      `),
      q(`
        SELECT
          id, role, status,
          CASE
            WHEN lower(id) ~ '(demo|test|uat|seed)' THEN 'ID_PATTERN'
            WHEN lower(name) ~ '(demo|test|uat|seed)' THEN 'NAME_PATTERN'
            WHEN lower(email) ~ '(demo|test|uat|seed|@ops-sigap\\.local$)' THEN 'EMAIL_PATTERN'
            ELSE 'UNKNOWN'
          END AS reason
        FROM users
        WHERE lower(id) ~ '(demo|test|uat|seed)'
           OR lower(name) ~ '(demo|test|uat|seed)'
           OR lower(email) ~ '(demo|test|uat|seed|@ops-sigap\\.local$)'
        ORDER BY id
      `),
      q(`
        SELECT must_change_password, count(*)::int AS count
        FROM users
        GROUP BY must_change_password
        ORDER BY must_change_password
      `),
      q(`
        SELECT
          s.id, s.code, s.name, s.personnel_capacity,
          count(DISTINCT CASE WHEN u.status='ACTIVE' AND a.is_current THEN u.id END)::int AS active_assigned_users,
          CASE
            WHEN count(DISTINCT CASE WHEN u.status='ACTIVE' AND a.is_current THEN u.id END) > s.personnel_capacity THEN 'OVER_CAPACITY'
            WHEN s.personnel_capacity < 1 THEN 'INVALID_CAPACITY'
            WHEN s.personnel_capacity <= 2 THEN 'REVIEW_LOW_CAPACITY'
            ELSE 'OK'
          END AS flag
        FROM sites s
        LEFT JOIN user_assignments a ON a.site_id=s.id AND a.is_current
        LEFT JOIN users u ON u.id=a.user_id
        GROUP BY s.id
        ORDER BY s.code
      `),
      q(`
        SELECT id, code, name, target_rounds_per_shift
        FROM sites
        WHERE target_rounds_per_shift IS NULL
           OR target_rounds_per_shift < 1
           OR target_rounds_per_shift > 20
        ORDER BY code
      `),
      q(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status='ACTIVE')::int AS active,
          count(*) FILTER (WHERE status='INACTIVE')::int AS inactive,
          count(*) FILTER (WHERE qr_status='ACTIVE')::int AS qr_active,
          count(*) FILTER (WHERE qr_status='INACTIVE')::int AS qr_inactive
        FROM checkpoints
      `),
      q(`
        SELECT
          c.site_id,
          s.code AS site_code,
          count(*)::int AS total,
          count(*) FILTER (WHERE c.status='ACTIVE')::int AS active,
          count(*) FILTER (WHERE c.qr_status='ACTIVE')::int AS qr_active,
          min(c.radius_meter)::int AS min_radius_meter,
          max(c.radius_meter)::int AS max_radius_meter
        FROM checkpoints c
        JOIN sites s ON s.id=c.site_id
        GROUP BY c.site_id, s.code
        ORDER BY s.code
      `),
      q(`
        SELECT id, site_id, code, radius_meter
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
        SELECT
          c.id, c.site_id, c.code, c.status, c.qr_status,
          count(t.id) FILTER (WHERE t.status='ACTIVE')::int AS active_token_count,
          CASE
            WHEN c.qr_status='ACTIVE' AND count(t.id) FILTER (WHERE t.status='ACTIVE') = 0 THEN 'ACTIVE_QR_WITHOUT_ACTIVE_TOKEN'
            WHEN count(t.id) FILTER (WHERE t.status='ACTIVE') > 1 THEN 'MULTIPLE_ACTIVE_TOKENS'
            ELSE 'OK'
          END AS flag
        FROM checkpoints c
        LEFT JOIN checkpoint_tokens t ON t.checkpoint_id=c.id
        GROUP BY c.id
        HAVING
          (c.qr_status='ACTIVE' AND count(t.id) FILTER (WHERE t.status='ACTIVE') = 0)
          OR count(t.id) FILTER (WHERE t.status='ACTIVE') > 1
        ORDER BY c.site_id, c.code
      `),
      q(`
        SELECT 'shift_sessions' AS entity, count(*)::int AS count FROM shift_sessions
        UNION ALL SELECT 'active_shift_sessions', count(*)::int FROM shift_sessions WHERE status='ACTIVE'
        UNION ALL SELECT 'patrol_logs', count(*)::int FROM patrol_logs
        UNION ALL SELECT 'incident_reports', count(*)::int FROM incident_reports
        UNION ALL SELECT 'handovers', count(*)::int FROM handovers
        UNION ALL SELECT 'media', count(*)::int FROM media
        UNION ALL SELECT 'validation_alerts', count(*)::int FROM validation_alerts
        UNION ALL SELECT 'audit_logs', count(*)::int FROM audit_logs
        UNION ALL SELECT 'radius_calibrations', count(*)::int FROM radius_calibrations
        UNION ALL SELECT 'auth_sessions', count(*)::int FROM auth_sessions
      `),
      q(`
        SELECT 'shift_sessions' AS entity, id
        FROM shift_sessions
        WHERE lower(id) ~ '(demo|test|uat|seed)'
        UNION ALL
        SELECT 'patrol_logs', id FROM patrol_logs WHERE lower(id) ~ '(demo|test|uat|seed)'
        UNION ALL
        SELECT 'incident_reports', id FROM incident_reports WHERE lower(id) ~ '(demo|test|uat|seed)'
        UNION ALL
        SELECT 'handovers', id FROM handovers WHERE lower(id) ~ '(demo|test|uat|seed)'
        UNION ALL
        SELECT 'media', id FROM media WHERE lower(id) ~ '(demo|test|uat|seed)'
        ORDER BY entity, id
      `),
      q(`
        SELECT
          a.id AS assignment_id,
          a.user_id,
          a.customer_id AS assignment_customer_id,
          a.site_id,
          s.customer_id AS site_customer_id
        FROM user_assignments a
        JOIN sites s ON s.id=a.site_id
        WHERE a.is_current
          AND a.customer_id IS DISTINCT FROM s.customer_id
        ORDER BY a.user_id
      `),
    ]);

    const report = {
      audit: 'OPS_SIGAP_ROUND6B_MASTER_DATA',
      mode: 'READ_ONLY',
      source: 'PRODUCTION_POSTGRESQL',
      generatedAt: new Date().toISOString(),
      safeguards: {
        transaction: 'REPEATABLE_READ_READ_ONLY',
        excludesPasswordHashes: true,
        excludesAuthTokenHashes: true,
        excludesMediaContent: true,
      },
      customers: {
        summary: customerSummary[0] || {},
        rows: customers,
      },
      sites: {
        summary: siteSummary[0] || {},
        rows: sites,
        capacitySanity,
        targetRoundIssues,
      },
      users: {
        roleStatus: userRoleStatus,
        assignmentSummary: userAssignmentSummary,
        missingCurrentAssignment: usersMissingAssignment,
        duplicateEmailCandidates: duplicateEmails,
        suspiciousDemoTestRecords: suspiciousUsers,
        mustChangePassword,
        assignmentCustomerSiteMismatch,
      },
      checkpoints: {
        summary: checkpointSummary[0] || {},
        bySite: checkpointsBySite,
        coordinateIssues: checkpointCoordinateIssues,
        tokenIssues: checkpointTokenIssues,
      },
      operationalData: {
        counts: operationalCounts,
        suspiciousDemoTestIds: suspiciousOperational,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    await client.query('ROLLBACK');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure; original error is more useful.
    }
    throw error;
  } finally {
    client.release();
    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error('[MASTER DATA AUDIT] FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
