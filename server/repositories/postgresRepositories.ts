import { createHash } from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { postgresHealth, query, transaction } from '../db/postgres';
import { normalizeDocumentType } from '../mediaTypes';
import {
  RepositoryBundle,
  RepositoryError,
  normalizePage,
  toPage,
  type MediaFilters,
  type PageRequest,
  type SessionFilter,
} from './contracts';
import type {
  AuditLog,
  Checkpoint,
  Customer,
  MediaGalleryItem,
  PatrolLog,
  PatrolSession,
  Site,
  User,
  ValidationAlert,
  ValidationAlertStatus,
} from '../../src/types/ops';

const iso = (value: unknown): string | undefined => value ? new Date(value as string | number | Date).toISOString() : undefined;
const dateOnly = (value: unknown): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date(value as string | number | Date).toISOString().slice(0, 10);
};

const pageQuery = async <T extends QueryResultRow>(
  sql: string,
  countSql: string,
  values: unknown[],
  request: PageRequest,
) => {
  const page = normalizePage(request);
  const [rows, count] = await Promise.all([
    query<T>(`${sql} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, page.limit, page.offset]),
    query<{ count: string }>(countSql, values),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0]?.count || 0), page };
};

const mapCustomer = (row: any): Customer => ({
  id: row.id,
  code: row.code,
  name: row.name,
  status: row.status,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapSite = (row: any): Site => ({
  id: row.id,
  customerId: row.customer_id,
  code: row.code,
  name: row.name,
  personnelCapacity: Number(row.personnel_capacity),
  targetRoundsPerShift: Number(row.target_rounds_per_shift),
  timezone: row.timezone,
  status: row.status,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapUser = (row: any): User => ({
  id: row.id,
  npk: row.npk,
  name: row.name,
  email: row.email,
  passwordHash: row.password_hash,
  role: row.role,
  position: row.position,
  status: row.status,
  customerId: row.customer_id || null,
  siteId: row.site_id || null,
  mustChangePassword: row.must_change_password,
  passwordChangedAt: iso(row.password_changed_at),
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapCheckpoint = (row: any): Checkpoint => ({
  id: row.id,
  siteId: row.site_id,
  code: row.code,
  name: row.name,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  radiusMeters: Number(row.radius_meter),
  coordinateMethod: row.coordinate_method,
  gpsAccuracyM: row.gps_accuracy == null ? null : Number(row.gps_accuracy),
  gpsCapturedAt: iso(row.gps_captured_at),
  qrToken: '',
  qrStatus: row.qr_status,
  status: row.status,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapSession = (row: any): PatrolSession => ({
  id: row.id,
  userId: row.user_id,
  npk: row.npk || undefined,
  customerId: row.customer_id,
  siteId: row.site_id,
  shiftCode: row.shift_code,
  shiftDate: dateOnly(row.operational_date),
  startedAt: iso(row.started_at)!,
  endedAt: iso(row.ended_at),
  status: row.status,
  totalRequired: Number(row.checkpoint_target),
  totalValid: Number(row.checkpoint_completed),
  completionPct: Number(row.checkpoint_target)
    ? Math.round(Number(row.checkpoint_completed) / Number(row.checkpoint_target) * 100)
    : 0,
  startDocumentationCompleted: row.start_documentation_completed,
  startDocumentationAt: iso(row.start_documentation_at),
  endDocumentationCompleted: row.end_documentation_completed,
  endDocumentationAt: iso(row.end_documentation_at),
  forceClosed: row.force_closed,
  forceCloseBy: row.force_closed_by,
  forceCloseRole: row.force_close_role,
  forceCloseReason: row.force_close_reason,
  forceCloseAt: iso(row.force_closed_at),
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapLog = (row: any): PatrolLog => ({
  id: row.id,
  sessionId: row.session_id,
  checkpointId: row.checkpoint_id || 'UNKNOWN',
  userId: row.user_id,
  siteId: row.site_id,
  roundNumber: Number(row.round_number || 1),
  validationStatus: row.validation_status,
  rejectionReason: row.rejection_reason,
  rejectionMessage: row.rejection_message,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  gpsAccuracyM: row.gps_accuracy == null ? null : Number(row.gps_accuracy),
  calculatedDistanceM: Number(row.distance_meter),
  observationStatus: row.observation_status || 'AMAN',
  notes: row.notes,
  clientCapturedAt: iso(row.scanned_at)!,
  serverReceivedAt: iso(row.created_at)!,
  syncSource: row.sync_source,
  isLowGpsAccuracy: row.is_low_gps_accuracy,
  createdAt: iso(row.created_at)!,
});

const mapAlert = (row: any): ValidationAlert => ({
  id: row.id,
  patrolLogId: row.patrol_log_id,
  sessionId: row.session_id,
  userId: row.user_id,
  siteId: row.site_id,
  checkpointId: row.checkpoint_id,
  alertType: row.alert_type,
  status: row.status,
  message: row.message,
  reviewedBy: row.reviewed_by,
  reviewedAt: iso(row.reviewed_at),
  closedBy: row.closed_by,
  closedAt: iso(row.closed_at),
  closeNote: row.close_note,
  reopenedBy: row.reopened_by,
  reopenedAt: iso(row.reopened_at),
  createdAt: iso(row.created_at)!,
});

const mapMedia = (row: any): MediaGalleryItem => {
  const reference = String(row.reference_type || '').toUpperCase();
  const sourceModule: MediaGalleryItem['sourceModule'] =
    reference === 'PATROL' || reference === 'PATROL_LOG'
      ? 'PATROL'
      : reference === 'HANDOVER'
        ? 'HANDOVER'
        : 'INCIDENT';
  const documentType = row.document_type || 'LAINNYA';
  return {
    id: row.id,
    sourceModule,
    sourceTable: reference,
    sourceId: row.reference_id,
    siteId: row.site_id,
    userId: row.user_id,
    shiftDate: row.operational_date ? dateOnly(row.operational_date) : dateOnly(row.captured_at),
    shiftCode: row.shift_code || 'SHIFT_1',
    category: documentType,
    documentType,
    photoUrl: row.storage_key,
    caption: row.file_name || documentType,
    eventAt: iso(row.captured_at)!,
    status: 'ACTIVE',
    createdAt: iso(row.created_at)!,
    createdBy: row.user_id,
  };
};

async function findSession(id: string, client?: PoolClient): Promise<PatrolSession | undefined> {
  const sql = 'SELECT s.*,u.npk FROM shift_sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=$1';
  const result = client ? await client.query(sql, [id]) : await query(sql, [id]);
  return result.rows[0] ? mapSession(result.rows[0]) : undefined;
}

function buildSessionWhere(filter: SessionFilter) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filter.userId) add('s.user_id=?', filter.userId);
  if (filter.siteId) add('s.site_id=?', filter.siteId);
  if (filter.shiftCode) add('s.shift_code=?', filter.shiftCode);
  if (filter.status) add('s.status=?', filter.status);
  if (filter.operationalDate) add('s.operational_date=?', filter.operationalDate);
  return { where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}

function buildMediaWhere(filters: MediaFilters) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (expression: string, value: unknown) => {
    values.push(value);
    clauses.push(`${expression}$${values.length}`);
  };
  if (filters.customerId) add('m.customer_id=', filters.customerId);
  if (filters.siteId) add('m.site_id=', filters.siteId);
  if (filters.userId) add('m.user_id=', filters.userId);
  if (filters.sessionId) add('m.session_id=', filters.sessionId);
  if (filters.shiftCode) add('s.shift_code=', filters.shiftCode);
  if (filters.operationalDate) add('COALESCE(s.operational_date,(m.captured_at AT TIME ZONE \'Asia/Jakarta\')::date)=', filters.operationalDate);
  if (filters.from) add('COALESCE(s.operational_date,(m.captured_at AT TIME ZONE \'Asia/Jakarta\')::date)>=', filters.from);
  if (filters.to) add('COALESCE(s.operational_date,(m.captured_at AT TIME ZONE \'Asia/Jakarta\')::date)<', filters.to);
  if (filters.documentType) {
    if (filters.documentType === 'SERTIGAS') {
      clauses.push(`m.document_type IN ('SERTIGAS_NAIK_JAGA','SERTIGAS_TURUN_JAGA')`);
    } else {
      add('m.document_type=', filters.documentType);
    }
  }
  return { where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}

export const postgresRepositories: RepositoryBundle = {
  provider: 'postgres',
  health: async () => ({ provider: 'postgres', database: await postgresHealth() }),

  users: {
    findById: async (id) => {
      const result = await query('SELECT u.*,a.customer_id,a.site_id FROM users u LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current WHERE u.id=$1', [id]);
      return result.rows[0] ? mapUser(result.rows[0]) : undefined;
    },
    findByNpk: async (npk) => {
      const result = await query('SELECT u.*,a.customer_id,a.site_id FROM users u LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current WHERE u.npk=$1', [npk]);
      return result.rows[0] ? mapUser(result.rows[0]) : undefined;
    },
    list: async (request) => {
      const { rows, total, page } = await pageQuery(
        'SELECT u.*,a.customer_id,a.site_id FROM users u LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current ORDER BY u.name',
        'SELECT count(*) FROM users',
        [],
        request,
      );
      return toPage(rows.map(mapUser), total, page);
    },
  },

  customers: {
    findById: async (id) => {
      const result = await query('SELECT * FROM customers WHERE id=$1', [id]);
      return result.rows[0] ? mapCustomer(result.rows[0]) : undefined;
    },
    list: async (request) => {
      const { rows, total, page } = await pageQuery('SELECT * FROM customers ORDER BY name', 'SELECT count(*) FROM customers', [], request);
      return toPage(rows.map(mapCustomer), total, page);
    },
  },

  sites: {
    findById: async (id) => {
      const result = await query('SELECT * FROM sites WHERE id=$1', [id]);
      return result.rows[0] ? mapSite(result.rows[0]) : undefined;
    },
    list: async (request) => {
      const { rows, total, page } = await pageQuery('SELECT * FROM sites ORDER BY name', 'SELECT count(*) FROM sites', [], request);
      return toPage(rows.map(mapSite), total, page);
    },
  },

  checkpoints: {
    findById: async (id) => {
      const result = await query('SELECT * FROM checkpoints WHERE id=$1', [id]);
      return result.rows[0] ? mapCheckpoint(result.rows[0]) : undefined;
    },
    findByToken: async (token) => {
      const hash = createHash('sha256').update(token).digest('hex');
      const result = await query(
        "SELECT c.* FROM checkpoints c JOIN checkpoint_tokens t ON t.checkpoint_id=c.id AND t.status='ACTIVE' WHERE t.token_hash=$1",
        [hash],
      );
      if (!result.rows[0]) return undefined;
      return { ...mapCheckpoint(result.rows[0]), qrToken: token };
    },
    listBySite: async (siteId) => (await query('SELECT * FROM checkpoints WHERE site_id=$1 ORDER BY code', [siteId])).rows.map(mapCheckpoint),
  },

  sessions: {
    findById: async (id) => findSession(id),
    getActiveByUser: async (userId) => {
      const result = await query('SELECT s.*,u.npk FROM shift_sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.user_id=$1 AND s.status=\'ACTIVE\'', [userId]);
      return result.rows[0] ? mapSession(result.rows[0]) : undefined;
    },
    startAtomic: async ({ session }) => transaction(async (client) => {
      const siteResult = await client.query("SELECT personnel_capacity FROM sites WHERE id=$1 AND status='ACTIVE' FOR UPDATE", [session.siteId]);
      if (!siteResult.rows[0]) throw new RepositoryError('SITE_UNAVAILABLE', 'Site penugasan tidak aktif atau tidak ditemukan.', 400);

      const userActive = await client.query("SELECT 1 FROM shift_sessions WHERE user_id=$1 AND status='ACTIVE' FOR UPDATE", [session.userId]);
      if (userActive.rowCount) throw new RepositoryError('USER_ALREADY_HAS_ACTIVE_SESSION', 'Petugas masih memiliki sesi aktif.');

      const count = await client.query<{ count: string }>("SELECT count(*) FROM shift_sessions WHERE site_id=$1 AND status='ACTIVE'", [session.siteId]);
      if (Number(count.rows[0].count) >= Number(siteResult.rows[0].personnel_capacity)) {
        throw new RepositoryError('SITE_CAPACITY_FULL', 'Kapasitas petugas aktif pada site telah penuh.');
      }

      const result = await client.query(
        "INSERT INTO shift_sessions(id,user_id,customer_id,site_id,shift_code,operational_date,started_at,status,checkpoint_target,checkpoint_completed,start_documentation_completed,end_documentation_completed,force_closed,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,0,false,false,false,$9,$9) RETURNING *",
        [session.id, session.userId, session.customerId, session.siteId, session.shiftCode, session.shiftDate, session.startedAt, session.totalRequired, session.createdAt],
      );
      return mapSession({ ...result.rows[0], npk: session.npk });
    }),
    update: async (id, updates, client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      const columns: Record<string, string> = {
        status: 'status',
        endedAt: 'ended_at',
        totalValid: 'checkpoint_completed',
        startDocumentationCompleted: 'start_documentation_completed',
        startDocumentationAt: 'start_documentation_at',
        endDocumentationCompleted: 'end_documentation_completed',
        endDocumentationAt: 'end_documentation_at',
        forceClosed: 'force_closed',
        forceCloseBy: 'force_closed_by',
        forceCloseRole: 'force_close_role',
        forceCloseReason: 'force_close_reason',
        forceCloseAt: 'force_closed_at',
      };
      for (const [key, column] of Object.entries(columns)) {
        if ((updates as any)[key] !== undefined) {
          values.push((updates as any)[key]);
          fields.push(`${column}=$${values.length}`);
        }
      }
      if (!fields.length) return findSession(id, client);
      values.push(id);
      const updateSql = `UPDATE shift_sessions SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING *`;
      const result = client ? await client.query(updateSql, values) : await query(updateSql, values);
      return result.rows[0] ? mapSession(result.rows[0]) : undefined;
    },
    list: async (request) => {
      const { rows, total, page } = await pageQuery(
        'SELECT s.*,u.npk FROM shift_sessions s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC',
        'SELECT count(*) FROM shift_sessions',
        [],
        request,
      );
      return toPage(rows.map(mapSession), total, page);
    },
    listFiltered: async (filter, request) => {
      const { where, values } = buildSessionWhere(filter);
      const { rows, total, page } = await pageQuery(
        `SELECT s.*,u.npk FROM shift_sessions s LEFT JOIN users u ON u.id=s.user_id${where} ORDER BY s.created_at DESC`,
        `SELECT count(*) FROM shift_sessions s${where}`,
        values,
        request,
      );
      return toPage(rows.map(mapSession), total, page);
    },
  },

  patrol: {
    findById: async (id) => {
      const result = await query(
        'SELECT l.*,r.round_number FROM patrol_logs l LEFT JOIN patrol_rounds r ON r.id=l.round_id WHERE l.id=$1',
        [id],
      );
      return result.rows[0] ? mapLog(result.rows[0]) : undefined;
    },
    addLogAtomic: async (log) => transaction(async (client) => {
      const existing = await client.query(
        'SELECT l.*,r.round_number FROM patrol_logs l LEFT JOIN patrol_rounds r ON r.id=l.round_id WHERE l.id=$1',
        [log.id],
      );
      if (existing.rows[0]) return mapLog(existing.rows[0]);

      const roundNumber = log.roundNumber || 1;
      const roundId = `RND-${log.sessionId}-${roundNumber}`;
      await client.query(
        "INSERT INTO patrol_rounds(id,session_id,round_number,status,started_at) VALUES($1,$2,$3,'ACTIVE',$4) ON CONFLICT(session_id,round_number) DO NOTHING",
        [roundId, log.sessionId, roundNumber, log.createdAt],
      );

      try {
        const result = await client.query(
          "INSERT INTO patrol_logs(id,session_id,round_id,user_id,site_id,checkpoint_id,latitude,longitude,gps_accuracy,distance_meter,validation_status,rejection_reason,rejection_message,observation_status,notes,scanned_at,sync_source,is_low_gps_accuracy,created_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,'UNKNOWN'),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *",
          [
            log.id,
            log.sessionId,
            roundId,
            log.userId,
            log.siteId,
            log.checkpointId,
            log.latitude,
            log.longitude,
            log.gpsAccuracyM,
            log.calculatedDistanceM,
            log.validationStatus,
            log.rejectionReason,
            log.rejectionMessage,
            log.observationStatus,
            log.notes,
            log.clientCapturedAt,
            log.syncSource,
            !!log.isLowGpsAccuracy,
            log.createdAt,
          ],
        );

        if (log.validationStatus !== 'VALID') {
          await client.query(
            "INSERT INTO validation_alerts(id,patrol_log_id,session_id,user_id,site_id,checkpoint_id,alert_type,status,message,created_at,updated_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,'UNKNOWN'),$7,'OPEN',$8,$9,$9) ON CONFLICT(patrol_log_id) DO NOTHING",
            [
              `ALT-${log.id}`,
              log.id,
              log.sessionId,
              log.userId,
              log.siteId,
              log.checkpointId,
              log.rejectionReason || log.validationStatus,
              log.rejectionMessage || log.rejectionReason || 'Validasi memerlukan perhatian.',
              log.createdAt,
            ],
          );
        }
        return mapLog({ ...result.rows[0], round_number: roundNumber });
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new RepositoryError('DUPLICATE_CHECKPOINT', 'Checkpoint sudah valid pada ronde ini.');
        }
        throw error;
      }
    }),
    listBySession: async (sessionId, request) => {
      const { rows, total, page } = await pageQuery(
        'SELECT l.*,r.round_number FROM patrol_logs l LEFT JOIN patrol_rounds r ON r.id=l.round_id WHERE l.session_id=$1 ORDER BY l.created_at DESC',
        'SELECT count(*) FROM patrol_logs WHERE session_id=$1',
        [sessionId],
        request,
      );
      return toPage(rows.map(mapLog), total, page);
    },
    listAllBySession: async (sessionId) => (
      await query(
        'SELECT l.*,r.round_number FROM patrol_logs l LEFT JOIN patrol_rounds r ON r.id=l.round_id WHERE l.session_id=$1 ORDER BY l.created_at ASC',
        [sessionId],
      )
    ).rows.map(mapLog),
  },

  alerts: {
    findById: async (id) => {
      const result = await query('SELECT * FROM validation_alerts WHERE id=$1', [id]);
      return result.rows[0] ? mapAlert(result.rows[0]) : undefined;
    },
    list: async (status: ValidationAlertStatus | undefined, request) => {
      const values = status ? [status] : [];
      const where = status ? ' WHERE status=$1' : '';
      const { rows, total, page } = await pageQuery(
        `SELECT * FROM validation_alerts${where} ORDER BY created_at DESC`,
        `SELECT count(*) FROM validation_alerts${where}`,
        values,
        request,
      );
      return toPage(rows.map(mapAlert), total, page);
    },
    transition: async (id, action, actor, closeNote) => transaction(async (client) => {
      const current = await client.query('SELECT * FROM validation_alerts WHERE id=$1 FOR UPDATE', [id]);
      if (!current.rows[0]) throw new RepositoryError('ALERT_NOT_FOUND', 'Validation alert tidak ditemukan.', 404);

      const status = current.rows[0].status;
      let result;
      if (action === 'REVIEW' && status === 'OPEN') {
        result = await client.query(
          "UPDATE validation_alerts SET status='UNDER_REVIEW',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *",
          [id, actor],
        );
      } else if (action === 'CLOSE' && status !== 'CLOSED' && closeNote?.trim()) {
        result = await client.query(
          "UPDATE validation_alerts SET status='CLOSED',closed_by=$2,closed_at=now(),close_note=$3,updated_at=now() WHERE id=$1 RETURNING *",
          [id, actor, closeNote.trim()],
        );
      } else if (action === 'REOPEN' && status === 'CLOSED') {
        result = await client.query(
          "UPDATE validation_alerts SET status='OPEN',reopened_by=$2,reopened_at=now(),closed_by=NULL,closed_at=NULL,close_note=NULL,updated_at=now() WHERE id=$1 RETURNING *",
          [id, actor],
        );
      } else {
        throw new RepositoryError(
          'INVALID_ALERT_TRANSITION',
          action === 'CLOSE' ? 'Catatan penyelesaian wajib diisi.' : 'Transisi status alert tidak valid.',
          400,
        );
      }
      return mapAlert(result.rows[0]);
    }),
  },

  media: {
    list: async (filters, request) => {
      const { where, values } = buildMediaWhere(filters);
      const base = ` FROM media m LEFT JOIN shift_sessions s ON s.id=m.session_id${where}`;
      const { rows, total, page } = await pageQuery(
        `SELECT m.*,s.operational_date,s.shift_code${base} ORDER BY m.captured_at DESC`,
        `SELECT count(*)${base}`,
        values,
        request,
      );
      return toPage(rows.map(mapMedia), total, page);
    },
    counts: async (filters) => {
      const { where, values } = buildMediaWhere(filters);
      const result = await query<{ document_type: string; count: string }>(
        `SELECT m.document_type,count(*)::text AS count FROM media m LEFT JOIN shift_sessions s ON s.id=m.session_id${where} GROUP BY m.document_type`,
        values,
      );
      const counts: Record<string, number> = { SEMUA: 0, SERTIGAS: 0 };
      for (const row of result.rows) {
        const value = Number(row.count);
        counts[row.document_type] = value;
        counts.SEMUA += value;
        if (row.document_type.startsWith('SERTIGAS_')) counts.SERTIGAS += value;
      }
      return counts;
    },
    add: async (item, sessionId = null, customerId = null) => {
      if (item.photoUrl.startsWith('data:')) {
        throw new RepositoryError(
          'MEDIA_STORAGE_NOT_READY',
          'Media base64 belum boleh disimpan ke PostgreSQL. Aktifkan storage provider Round 4B terlebih dahulu.',
          503,
        );
      }
      const documentType = item.documentType || normalizeDocumentType(item);
      await query(
        "INSERT INTO media(id,document_type,user_id,session_id,customer_id,site_id,reference_type,reference_id,storage_provider,storage_key,mime_type,file_name,file_size,captured_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'external_url',$9,$10,$11,NULL,$12,$13) ON CONFLICT(id) DO NOTHING",
        [
          item.id,
          documentType,
          item.userId,
          sessionId,
          customerId,
          item.siteId,
          item.sourceModule,
          item.sourceId,
          item.photoUrl,
          item.photoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg',
          item.caption || `${item.id}.jpg`,
          item.eventAt,
          item.createdAt,
        ],
      );
      return { ...item, documentType };
    },
  },

  audit: {
    append: async (entry) => {
      const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const createdAt = new Date().toISOString();
      const metadata = {
        ...((entry as any).metadata && typeof (entry as any).metadata === 'object' ? (entry as any).metadata : {}),
        ...(entry.reason ? { reason: entry.reason } : {}),
      };
      const result = await query(
        'INSERT INTO audit_logs(id,actor_user_id,actor_role,action,entity_type,entity_id,before_data,after_data,metadata,ip_address,user_agent,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
        [
          id,
          entry.actorUserId,
          (entry as any).actorRole || null,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.oldValue || null,
          entry.newValue || null,
          Object.keys(metadata).length ? metadata : null,
          entry.ipAddress || null,
          entry.userAgent || null,
          createdAt,
        ],
      );
      const row = result.rows[0];
      return {
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        oldValue: row.before_data,
        newValue: row.after_data,
        reason: row.metadata?.reason,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: iso(row.created_at)!,
      };
    },
    list: async (request) => {
      const { rows, total, page } = await pageQuery(
        'SELECT * FROM audit_logs ORDER BY created_at DESC',
        'SELECT count(*) FROM audit_logs',
        [],
        request,
      );
      const items = rows.map((row: any): AuditLog => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        oldValue: row.before_data,
        newValue: row.after_data,
        reason: row.metadata?.reason,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: iso(row.created_at)!,
      }));
      return toPage(items, total, page);
    },
  },
};
