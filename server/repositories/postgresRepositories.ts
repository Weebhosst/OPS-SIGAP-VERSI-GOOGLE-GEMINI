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
  IncidentReport,
  MediaGalleryItem,
  PatrolLog,
  PatrolSession,
  ShiftHandover,
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

const mapHandover = (row: any): ShiftHandover => ({
  id: row.id,
  sessionId: row.session_id,
  siteId: row.site_id,
  shiftDate: dateOnly(row.operational_date),
  shiftCode: row.shift_code,
  handoverType: row.handover_type,
  fromUserId: row.from_user_id,
  toUserId: row.to_user_id,
  eventAt: iso(row.event_at)!,
  latitude: row.latitude == null ? null : Number(row.latitude),
  longitude: row.longitude == null ? null : Number(row.longitude),
  photoUrl: row.primary_media_url || null,
  photoUrls: row.media_urls || [],
  itemName: row.item_name,
  itemQuantity: row.item_quantity,
  itemCondition: row.item_condition,
  handedFrom: row.handed_from,
  handedTo: row.handed_to,
  isTaruna: row.is_taruna,
  conditionStatus: row.condition_status,
  personnelStatus: row.personnel_status,
  equipmentStatus: row.equipment_status,
  keysStatus: row.keys_status,
  vehicleStatus: row.vehicle_status,
  outstandingIssues: row.outstanding_issues,
  handoverNotes: row.handover_notes,
  ackFrom: row.ack_from,
  ackTo: row.ack_to,
  status: row.status,
  createdBy: row.created_by,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapIncident = (row: any): IncidentReport => ({
  id: row.id,
  sessionId: row.session_id,
  customerId: row.customer_id,
  siteId: row.site_id,
  userId: row.user_id,
  incidentAt: iso(row.incident_at)!,
  shiftCode: row.shift_code,
  shiftDate: dateOnly(row.operational_date),
  category: row.category,
  severity: row.severity,
  title: row.title,
  locationText: row.location_text,
  latitude: row.latitude == null ? null : Number(row.latitude),
  longitude: row.longitude == null ? null : Number(row.longitude),
  photoUrl: row.primary_media_url || null,
  photoUrls: row.media_urls || [],
  notes: row.notes,
  chronology: row.chronology,
  initialAction: row.initial_action,
  followUp: row.follow_up,
  personInvolved: row.person_involved,
  witness: row.witness,
  vehicleInvolved: row.vehicle_involved,
  assetInvolved: row.asset_involved,
  policeReportNo: row.police_report_no,
  externalParty: row.external_party,
  status: row.status,
  escalated: row.escalated,
  escalatedTo: row.escalated_to,
  closedAt: iso(row.closed_at),
  createdBy: row.created_by,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
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
    create: async (user) => transaction(async (client) => {
      try {
        const result = await client.query(
          'INSERT INTO users(id,npk,name,email,password_hash,role,position,status,must_change_password,password_changed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
          [user.id,user.npk,user.name,user.email,user.passwordHash,user.role,user.position||null,user.status,!!user.mustChangePassword,user.passwordChangedAt||null,user.createdAt,user.updatedAt],
        );
        if (user.siteId || user.customerId) {
          await client.query(
            'INSERT INTO user_assignments(id,user_id,customer_id,site_id,effective_from,is_current,changed_by,created_at) VALUES($1,$2,$3,$4,$5,true,$6,$5)',
            [`ASN-${user.id}-${Date.now()}`,user.id,user.customerId||null,user.siteId||null,user.assignmentHistory?.at(-1)?.effectiveAt||user.createdAt,user.assignmentHistory?.at(-1)?.changedBy||null],
          );
        }
        return mapUser({ ...result.rows[0], customer_id:user.customerId||null, site_id:user.siteId||null });
      } catch (error:any) {
        if (error?.code === '23505') throw new RepositoryError('USER_CONFLICT','NPK atau identitas pengguna sudah digunakan.',409);
        throw error;
      }
    }),
    update: async (id, updates, assignment) => transaction(async (client) => {
      const fields:string[]=[]; const values:unknown[]=[];
      const columns:Record<string,string>={name:'name',email:'email',role:'role',position:'position',status:'status',mustChangePassword:'must_change_password',passwordChangedAt:'password_changed_at'};
      for(const [key,column] of Object.entries(columns)) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      if(fields.length){values.push(id);await client.query(`UPDATE users SET ${fields.join(',')},updated_at=now() WHERE id=${values.length}`,values);}
      if(assignment){
        await client.query('UPDATE user_assignments SET is_current=false,effective_until=$2 WHERE user_id=$1 AND is_current',[id,assignment.effectiveAt]);
        await client.query(
          'INSERT INTO user_assignments(id,user_id,customer_id,site_id,effective_from,is_current,changed_by,created_at) VALUES($1,$2,$3,$4,$5,true,$6,$5)',
          [`ASN-${id}-${Date.now()}`,id,assignment.customerId,assignment.siteId,assignment.effectiveAt,assignment.changedBy],
        );
      }
      const result=await client.query('SELECT u.*,a.customer_id,a.site_id FROM users u LEFT JOIN user_assignments a ON a.user_id=u.id AND a.is_current WHERE u.id=$1',[id]);
      return result.rows[0]?mapUser(result.rows[0]):undefined;
    }),
    resetPassword: async (id, passwordHash, changedAt) => {
      const result=await query('UPDATE users SET password_hash=$2,must_change_password=false,password_changed_at=$3,updated_at=now() WHERE id=$1 RETURNING *',[id,passwordHash,changedAt]);
      if(!result.rows[0]) return undefined;
      const assignment=await query('SELECT customer_id,site_id FROM user_assignments WHERE user_id=$1 AND is_current',[id]);
      return mapUser({...result.rows[0],...assignment.rows[0]});
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
    create: async (customer) => {
      try {
        const result=await query('INSERT INTO customers(id,code,name,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[customer.id,customer.code,customer.name,customer.status,customer.createdAt,customer.updatedAt]);
        return mapCustomer(result.rows[0]);
      } catch(error:any){if(error?.code==='23505') throw new RepositoryError('CUSTOMER_CONFLICT','Kode Customer sudah digunakan.',409);throw error;}
    },
    update: async (id, updates) => {
      const fields:string[]=[]; const values:unknown[]=[];
      for(const [key,column] of [['name','name'],['status','status']] as const) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      if(!fields.length) return postgresRepositories.customers.findById(id);
      values.push(id); const result=await query(`UPDATE customers SET ${fields.join(',')},updated_at=now() WHERE id=${values.length} RETURNING *`,values);
      return result.rows[0]?mapCustomer(result.rows[0]):undefined;
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
    create: async (site) => {
      try {
        const result=await query('INSERT INTO sites(id,customer_id,code,name,personnel_capacity,target_rounds_per_shift,timezone,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[site.id,site.customerId,site.code||site.id,site.name,site.personnelCapacity,site.targetRoundsPerShift||1,site.timezone,site.status,site.createdAt,site.updatedAt]);
        return mapSite(result.rows[0]);
      } catch(error:any){if(error?.code==='23505') throw new RepositoryError('SITE_CONFLICT','Kode Site sudah digunakan.',409);throw error;}
    },
    update: async (id, updates) => {
      const fields:string[]=[]; const values:unknown[]=[]; const columns:Record<string,string>={name:'name',status:'status',personnelCapacity:'personnel_capacity',targetRoundsPerShift:'target_rounds_per_shift'};
      for(const [key,column] of Object.entries(columns)) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      if(!fields.length) return postgresRepositories.sites.findById(id);
      values.push(id); const result=await query(`UPDATE sites SET ${fields.join(',')},updated_at=now() WHERE id=${values.length} RETURNING *`,values);
      return result.rows[0]?mapSite(result.rows[0]):undefined;
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
    list: async (request) => {
      const {rows,total,page}=await pageQuery('SELECT * FROM checkpoints ORDER BY site_id,code','SELECT count(*) FROM checkpoints',[],request);
      return toPage(rows.map(mapCheckpoint),total,page);
    },
    listBySite: async (siteId) => (await query('SELECT * FROM checkpoints WHERE site_id=$1 ORDER BY code', [siteId])).rows.map(mapCheckpoint),
    create: async (checkpoint) => {
      try {
        const result=await query('INSERT INTO checkpoints(id,site_id,code,name,latitude,longitude,coordinate_method,gps_accuracy,gps_captured_at,radius_meter,status,qr_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',[checkpoint.id,checkpoint.siteId,checkpoint.code,checkpoint.name,checkpoint.latitude,checkpoint.longitude,checkpoint.coordinateMethod||'MANUAL',checkpoint.gpsAccuracyM||null,checkpoint.gpsCapturedAt||null,checkpoint.radiusMeters,checkpoint.status,checkpoint.qrStatus,checkpoint.createdAt,checkpoint.updatedAt]);
        return mapCheckpoint(result.rows[0]);
      } catch(error:any){if(error?.code==='23505') throw new RepositoryError('CHECKPOINT_CONFLICT','Kode checkpoint sudah digunakan pada site ini.',409);throw error;}
    },
    update: async (id, updates) => {
      const fields:string[]=[]; const values:unknown[]=[]; const columns:Record<string,string>={name:'name',latitude:'latitude',longitude:'longitude',radiusMeters:'radius_meter',status:'status',qrStatus:'qr_status',coordinateMethod:'coordinate_method',gpsAccuracyM:'gps_accuracy',gpsCapturedAt:'gps_captured_at'};
      for(const [key,column] of Object.entries(columns)) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      if(!fields.length) return postgresRepositories.checkpoints.findById(id);
      values.push(id); const result=await query(`UPDATE checkpoints SET ${fields.join(',')},updated_at=now() WHERE id=${values.length} RETURNING *`,values);
      return result.rows[0]?mapCheckpoint(result.rows[0]):undefined;
    },
    replaceToken: async (id, token, actorUserId, activate) => transaction(async (client) => {
      const cp=await client.query('SELECT * FROM checkpoints WHERE id=$1 FOR UPDATE',[id]); if(!cp.rows[0]) return undefined;
      await client.query("UPDATE checkpoint_tokens SET status='REVOKED',revoked_at=now() WHERE checkpoint_id=$1 AND status='ACTIVE'",[id]);
      const tokenHash=createHash('sha256').update(token).digest('hex');
      await client.query('INSERT INTO checkpoint_tokens(id,checkpoint_id,token_hash,token_version,status,generated_at,created_by) VALUES($1,$2,$3,COALESCE((SELECT max(token_version)+1 FROM checkpoint_tokens WHERE checkpoint_id=$2),1),$4,now(),$5)',[`TOK-${id}-${Date.now()}`,id,tokenHash,activate?'ACTIVE':'REVOKED',actorUserId]);
      const result=await client.query('UPDATE checkpoints SET qr_status=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,activate?'ACTIVE':'INACTIVE']);
      return {...mapCheckpoint(result.rows[0]),qrToken:token};
    }),
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
    completeAtomic: async (id, userId, updates) => transaction(async (client) => {
      const current=await client.query("SELECT * FROM shift_sessions WHERE id=$1 FOR UPDATE",[id]);
      if(!current.rows[0]||current.rows[0].user_id!==userId) throw new RepositoryError('SESSION_NOT_FOUND','Active session milik Anda tidak ditemukan.',404);
      if(current.rows[0].status!=='ACTIVE') throw new RepositoryError('SESSION_NOT_ACTIVE','Session sudah tidak aktif.',409);
      const fields:string[]=[]; const values:unknown[]=[]; const columns:Record<string,string>={status:'status',endedAt:'ended_at',endDocumentationCompleted:'end_documentation_completed',endDocumentationAt:'end_documentation_at',startDocumentationCompleted:'start_documentation_completed',startDocumentationAt:'start_documentation_at',totalValid:'checkpoint_completed'};
      for(const [key,column] of Object.entries(columns)) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      values.push(id); const result=await client.query(`UPDATE shift_sessions SET ${fields.join(',')},updated_at=now() WHERE id=${values.length} RETURNING *`,values);
      return mapSession(result.rows[0]);
    }),
    forceCloseAtomic: async (id, actorUserId, actorRole, reason) => transaction(async (client) => {
      const current=await client.query('SELECT * FROM shift_sessions WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RepositoryError('SESSION_NOT_FOUND','Session tidak ditemukan.',404);
      if(current.rows[0].status!=='ACTIVE') throw new RepositoryError('SESSION_NOT_ACTIVE','Session sudah tidak aktif.',409);
      const result=await client.query("UPDATE shift_sessions SET status='FORCE_CLOSED',ended_at=now(),force_closed=true,force_closed_by=$2,force_close_role=$3,force_close_reason=$4,force_closed_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[id,actorUserId,actorRole,reason]);
      return mapSession(result.rows[0]);
    }),
    countActiveBySite: async (siteId) => Number((await query<{count:string}>("SELECT count(*) FROM shift_sessions WHERE site_id=$1 AND status='ACTIVE'",[siteId])).rows[0]?.count||0),
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

  handovers: {
    findById: async (id) => {
      const result=await query("SELECT h.*,array_remove(array_agg(m.storage_key ORDER BY m.captured_at),NULL) AS media_urls,min(m.storage_key) AS primary_media_url FROM handovers h LEFT JOIN handover_media hm ON hm.handover_id=h.id LEFT JOIN media m ON m.id=hm.media_id WHERE h.id=$1 GROUP BY h.id",[id]);
      return result.rows[0]?mapHandover(result.rows[0]):undefined;
    },
    list: async (filter, request) => {
      const clauses:string[]=[]; const values:unknown[]=[]; const add=(expr:string,val:unknown)=>{values.push(val);clauses.push(`${expr}${values.length}`);};
      if(filter.siteId)add('h.site_id=',filter.siteId); if(filter.shiftCode)add('h.shift_code=',filter.shiftCode); if(filter.userId){values.push(filter.userId);clauses.push(`(h.from_user_id=${values.length} OR h.to_user_id=${values.length})`);}
      const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
      const {rows,total,page}=await pageQuery(`SELECT h.* FROM handovers h${where} ORDER BY h.created_at DESC`,`SELECT count(*) FROM handovers h${where}`,values,request);
      return toPage(rows.map(mapHandover),total,page);
    },
    create: async (h) => {
      const result=await query('INSERT INTO handovers(id,session_id,site_id,operational_date,shift_code,handover_type,from_user_id,to_user_id,event_at,latitude,longitude,condition_status,personnel_status,equipment_status,keys_status,vehicle_status,outstanding_issues,handover_notes,item_name,item_quantity,item_condition,handed_from,handed_to,is_taruna,ack_from,ack_to,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *',[h.id,h.sessionId||null,h.siteId,h.shiftDate,h.shiftCode,h.handoverType,h.fromUserId,h.toUserId||null,h.eventAt,h.latitude||null,h.longitude||null,h.conditionStatus,h.personnelStatus,h.equipmentStatus,h.keysStatus,h.vehicleStatus,h.outstandingIssues||null,h.handoverNotes||null,h.itemName||null,h.itemQuantity||null,h.itemCondition||null,h.handedFrom||null,h.handedTo||null,!!h.isTaruna,h.ackFrom,h.ackTo,h.status,h.createdBy,h.createdAt,h.updatedAt]);
      return mapHandover(result.rows[0]);
    },
    update: async (id, updates) => {
      const fields:string[]=[]; const values:unknown[]=[]; const columns:Record<string,string>={toUserId:'to_user_id',ackTo:'ack_to',status:'status',handoverNotes:'handover_notes'};
      for(const [key,column] of Object.entries(columns)) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      if(!fields.length) return postgresRepositories.handovers.findById(id);
      values.push(id); const result=await query(`UPDATE handovers SET ${fields.join(',')},updated_at=now() WHERE id=${values.length} RETURNING *`,values);
      return result.rows[0]?mapHandover(result.rows[0]):undefined;
    },
  },

  incidents: {
    findById: async (id) => {
      const result=await query("SELECT i.*,array_remove(array_agg(m.storage_key ORDER BY m.captured_at),NULL) AS media_urls,min(m.storage_key) AS primary_media_url FROM incident_reports i LEFT JOIN incident_media im ON im.incident_id=i.id LEFT JOIN media m ON m.id=im.media_id WHERE i.id=$1 GROUP BY i.id",[id]);
      return result.rows[0]?mapIncident(result.rows[0]):undefined;
    },
    list: async (filter, request) => {
      const clauses:string[]=[]; const values:unknown[]=[]; const add=(expr:string,val:unknown)=>{values.push(val);clauses.push(`${expr}${values.length}`);};
      if(filter.siteId)add('i.site_id=',filter.siteId); if(filter.shiftCode)add('i.shift_code=',filter.shiftCode); if(filter.userId)add('i.user_id=',filter.userId); if(filter.status)add('i.status=',filter.status);
      const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
      const {rows,total,page}=await pageQuery(`SELECT i.* FROM incident_reports i${where} ORDER BY i.incident_at DESC`,`SELECT count(*) FROM incident_reports i${where}`,values,request);
      return toPage(rows.map(mapIncident),total,page);
    },
    create: async (i) => {
      const result=await query('INSERT INTO incident_reports(id,session_id,customer_id,site_id,user_id,incident_at,shift_code,operational_date,category,severity,title,location_text,latitude,longitude,notes,chronology,initial_action,follow_up,person_involved,witness,vehicle_involved,asset_involved,police_report_no,external_party,status,escalated,escalated_to,closed_at,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING *',[i.id,i.sessionId||null,i.customerId||null,i.siteId,i.userId,i.incidentAt,i.shiftCode,i.shiftDate,i.category,i.severity,i.title,i.locationText,i.latitude||null,i.longitude||null,i.notes||null,i.chronology,i.initialAction,i.followUp||null,i.personInvolved||null,i.witness||null,i.vehicleInvolved||null,i.assetInvolved||null,i.policeReportNo||null,i.externalParty||null,i.status,i.escalated,i.escalatedTo||null,i.closedAt||null,i.createdBy,i.createdAt,i.updatedAt]);
      return mapIncident(result.rows[0]);
    },
    update: async (id, updates) => {
      const fields:string[]=[]; const values:unknown[]=[]; const columns:Record<string,string>={status:'status',followUp:'follow_up',closedAt:'closed_at'};
      for(const [key,column] of Object.entries(columns)) if((updates as any)[key]!==undefined){values.push((updates as any)[key]);fields.push(`${column}=${values.length}`);}
      if(!fields.length) return postgresRepositories.incidents.findById(id);
      values.push(id); const result=await query(`UPDATE incident_reports SET ${fields.join(',')},updated_at=now() WHERE id=${values.length} RETURNING *`,values);
      return result.rows[0]?mapIncident(result.rows[0]):undefined;
    },
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
      await transaction(async (client) => {
        await client.query(
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
        if (item.handoverId) {
          await client.query(
            'INSERT INTO handover_media(handover_id,media_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [item.handoverId, item.id],
          );
        }
        if (item.incidentId) {
          await client.query(
            'INSERT INTO incident_media(incident_id,media_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [item.incidentId, item.id],
          );
        }
      });
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
