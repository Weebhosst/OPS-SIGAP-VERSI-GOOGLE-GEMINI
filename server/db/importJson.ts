import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import type { DatabaseSchema } from '../db';
import { normalizeDocumentType } from '../mediaTypes';
import { closePostgresPool, transaction } from './postgres';

type Summary = Record<string, { source: number; inserted: number; updated: number; skipped: number; conflicts: number; failed: number }>;
const dryRun = process.argv.includes('--dry-run');
const sourcePath = path.resolve(process.env.OPS_SIGAP_IMPORT_FILE || 'data/ops-sigap.json');
const summary: Summary = {};
const section = (name: string, source: number, conflicts = 0) => summary[name] = { source, inserted: 0, updated: 0, skipped: 0, conflicts, failed: 0 };
const duplicateCount = (values: string[]) => values.length - new Set(values).size;

export function normalizeLegacyJson(raw: Partial<DatabaseSchema>): DatabaseSchema {
  const data = raw as DatabaseSchema;
  data.customers ||= [];
  data.users ||= [];
  data.sites ||= [];
  data.checkpoints ||= [];
  data.patrol_sessions ||= [];
  data.patrol_logs ||= [];
  data.shift_handovers ||= [];
  data.incident_reports ||= [];
  data.media_gallery ||= [];
  data.radius_calibrations ||= [];
  data.audit_logs ||= [];
  data.admin_filter_state ||= [];
  data.validation_alerts ||= [];
  data.settings ||= {};
  data.go_live_checklist ||= [];

  const baseline = data.sites[0]?.createdAt || data.users[0]?.createdAt || '1970-01-01T00:00:00.000Z';
  if (!data.customers.length && data.sites.length) {
    data.customers.push({ id: 'CUST-AIS', code: 'AIS', name: 'ASTRA INFRA SOLUTIONS', status: 'ACTIVE', createdAt: baseline, updatedAt: baseline });
  }
  const defaultCustomerId = data.customers[0]?.id;
  for (const site of data.sites) {
    if (!site.customerId || !data.customers.some((customer) => customer.id === site.customerId)) site.customerId = defaultCustomerId;
    site.code ||= site.id;
    site.personnelCapacity = Math.max(1, Number(site.personnelCapacity) || 1);
    site.targetRoundsPerShift = Math.max(1, Number(site.targetRoundsPerShift) || 1);
    site.timezone ||= 'Asia/Jakarta';
  }
  for (const user of data.users) {
    user.customerId ??= user.siteId ? data.sites.find((site) => site.id === user.siteId)?.customerId || null : null;
    user.position ||= user.role === 'ANGGOTA' ? 'ANGGOTA SECURITY' : user.role.replace('_', ' ');
    user.assignmentHistory ||= [{ customerId: user.customerId || null, siteId: user.siteId, effectiveAt: user.createdAt, changedBy: null }];
  }
  for (const session of data.patrol_sessions) {
    session.customerId ??= data.sites.find((site) => site.id === session.siteId)?.customerId || null;
    session.totalRequired = Math.max(0, Number(session.totalRequired) || 0);
    session.totalValid = Math.max(0, Number(session.totalValid) || 0);
  }
  return data;
}

export function validateJsonImport(data: DatabaseSchema): string[] {
  const errors: string[] = []; const customers = new Set(data.customers.map((item) => item.id)); const sites = new Set(data.sites.map((item) => item.id)); const users = new Set(data.users.map((item) => item.id)); const sessions = new Set(data.patrol_sessions.map((item) => item.id)); const checkpoints = new Set(data.checkpoints.map((item) => item.id));
  data.sites.forEach((item) => { if (!customers.has(item.customerId)) errors.push(`Site ${item.id}: customer ${item.customerId} tidak ditemukan.`); });
  data.users.forEach((item) => { if (item.siteId && !sites.has(item.siteId)) errors.push(`User ${item.id}: site ${item.siteId} tidak ditemukan.`); });
  data.checkpoints.forEach((item) => { if (!sites.has(item.siteId)) errors.push(`Checkpoint ${item.id}: site ${item.siteId} tidak ditemukan.`); });
  data.patrol_sessions.forEach((item) => { if (!users.has(item.userId) || !sites.has(item.siteId)) errors.push(`Session ${item.id}: user/site tidak valid.`); });
  data.patrol_logs.forEach((item) => { if (!sessions.has(item.sessionId) || (item.checkpointId !== 'UNKNOWN' && !checkpoints.has(item.checkpointId))) errors.push(`Patrol log ${item.id}: session/checkpoint tidak valid.`); });
  return errors;
}

async function insert(client: PoolClient, name: string, sql: string, values: unknown[]) {
  try { const result = await client.query(sql, values); if (result.rowCount) summary[name].inserted += 1; else summary[name].skipped += 1; }
  catch (error) { summary[name].failed += 1; throw error; }
}

export async function importJsonDatabase(): Promise<Summary> {
  const data = normalizeLegacyJson(JSON.parse(fs.readFileSync(sourcePath, 'utf8'))); const errors = validateJsonImport(data);
  section('Customers', data.customers.length, duplicateCount(data.customers.map((item) => item.id))); section('Sites', data.sites.length, duplicateCount(data.sites.map((item) => item.id))); section('Users', data.users.length, duplicateCount(data.users.map((item) => item.id))); section('Assignments', data.users.length); section('Checkpoints', data.checkpoints.length, duplicateCount(data.checkpoints.map((item) => item.id))); section('Tokens', data.checkpoints.filter((item) => item.qrToken).length); section('Sessions', data.patrol_sessions.length, duplicateCount(data.patrol_sessions.map((item) => item.id))); section('Rounds', 0); section('PatrolLogs', data.patrol_logs.length, duplicateCount(data.patrol_logs.map((item) => item.id))); section('Alerts', data.validation_alerts.length, duplicateCount(data.validation_alerts.map((item) => item.id))); section('Incidents', data.incident_reports.length, duplicateCount(data.incident_reports.map((item) => item.id))); section('Handovers', data.shift_handovers.length, duplicateCount(data.shift_handovers.map((item) => item.id))); section('Media', data.media_gallery.length, duplicateCount(data.media_gallery.map((item) => item.id))); section('Audit', data.audit_logs.length, duplicateCount(data.audit_logs.map((item) => item.id)));
  if (errors.length) throw new Error(`JSON import validation failed (${errors.length}):\n${errors.slice(0, 20).join('\n')}`);
  if (dryRun) return summary;
  await transaction(async (client) => {
    for (const item of data.customers) await insert(client,'Customers','INSERT INTO customers(id,code,name,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[item.id,item.code,item.name,item.status,item.createdAt,item.updatedAt]);
    for (const item of data.sites) await insert(client,'Sites','INSERT INTO sites(id,customer_id,code,name,personnel_capacity,target_rounds_per_shift,timezone,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING',[item.id,item.customerId,item.code||item.id,item.name,item.personnelCapacity,item.targetRoundsPerShift||1,item.timezone,item.status,item.createdAt,item.updatedAt]);
    for (const item of data.users) await insert(client,'Users','INSERT INTO users(id,npk,name,email,password_hash,role,position,status,must_change_password,password_changed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING',[item.id,item.npk,item.name,item.email,item.passwordHash,item.role,item.position||null,item.status,!!item.mustChangePassword,item.passwordChangedAt||null,item.createdAt,item.updatedAt]);
    for (const item of data.users) if (item.siteId || item.customerId) await insert(client,'Assignments','INSERT INTO user_assignments(id,user_id,customer_id,site_id,effective_from,is_current,changed_by,created_at) VALUES($1,$2,$3,$4,$5,true,NULL,$5) ON CONFLICT(id) DO NOTHING',[`ASN-${item.id}-CURRENT`,item.id,item.customerId||data.sites.find((site)=>site.id===item.siteId)?.customerId||null,item.siteId,item.assignmentHistory?.at(-1)?.effectiveAt||item.createdAt]); else summary.Assignments.skipped += 1;
    for (const item of data.checkpoints) { await insert(client,'Checkpoints','INSERT INTO checkpoints(id,site_id,code,name,latitude,longitude,coordinate_method,gps_accuracy,gps_captured_at,radius_meter,status,qr_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO NOTHING',[item.id,item.siteId,item.code,item.name,item.latitude,item.longitude,item.coordinateMethod||'MANUAL',item.gpsAccuracyM||null,item.gpsCapturedAt||null,item.radiusMeters,item.status,item.qrStatus,item.createdAt,item.updatedAt]); if(item.qrToken) await insert(client,'Tokens','INSERT INTO checkpoint_tokens(id,checkpoint_id,token_hash,token_version,status,generated_at,created_by) VALUES($1,$2,$3,1,$4,$5,NULL) ON CONFLICT(id) DO NOTHING',[`TOK-${item.id}-1`,item.id,createHash('sha256').update(item.qrToken).digest('hex'),item.qrStatus==='ACTIVE'?'ACTIVE':'REVOKED',item.updatedAt]); }
    for (const item of data.patrol_sessions) await insert(client,'Sessions','INSERT INTO shift_sessions(id,user_id,customer_id,site_id,shift_code,operational_date,started_at,ended_at,status,checkpoint_target,checkpoint_completed,start_documentation_completed,start_documentation_at,end_documentation_completed,end_documentation_at,force_closed,force_closed_by,force_close_role,force_close_reason,force_closed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ON CONFLICT(id) DO NOTHING',[item.id,item.userId,item.customerId||data.sites.find((site)=>site.id===item.siteId)?.customerId,item.siteId,item.shiftCode,item.shiftDate,item.startedAt,item.endedAt||null,item.status,item.totalRequired,item.totalValid,!!item.startDocumentationCompleted,item.startDocumentationAt||null,!!item.endDocumentationCompleted,item.endDocumentationAt||null,!!item.forceClosed,item.forceCloseBy||null,item.forceCloseRole||null,item.forceCloseReason||null,item.forceCloseAt||null,item.createdAt,item.updatedAt]);
    const rounds = new Map<string,{id:string;sessionId:string;round:number}>(); data.patrol_logs.forEach((log)=>{const round=log.roundNumber||1;rounds.set(`${log.sessionId}:${round}`,{id:`RND-${log.sessionId}-${round}`,sessionId:log.sessionId,round});}); summary.Rounds.source=rounds.size;
    for(const item of rounds.values()) await insert(client,'Rounds','INSERT INTO patrol_rounds(id,session_id,round_number,status,started_at) VALUES($1,$2,$3,\'COMPLETED\',NULL) ON CONFLICT(id) DO NOTHING',[item.id,item.sessionId,item.round]);
    for(const item of data.patrol_logs) await insert(client,'PatrolLogs','INSERT INTO patrol_logs(id,session_id,round_id,user_id,site_id,checkpoint_id,latitude,longitude,gps_accuracy,distance_meter,validation_status,rejection_reason,rejection_message,observation_status,notes,scanned_at,sync_source,is_low_gps_accuracy,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT(id) DO NOTHING',[item.id,item.sessionId,`RND-${item.sessionId}-${item.roundNumber||1}`,item.userId,item.siteId,item.checkpointId==='UNKNOWN'?null:item.checkpointId,item.latitude,item.longitude,item.gpsAccuracyM||null,item.calculatedDistanceM,item.validationStatus,item.rejectionReason||null,item.rejectionMessage||null,item.observationStatus,item.notes||null,item.clientCapturedAt,item.syncSource,!!item.isLowGpsAccuracy,item.createdAt]);
    for(const item of data.validation_alerts) await insert(client,'Alerts','INSERT INTO validation_alerts(id,patrol_log_id,session_id,user_id,site_id,checkpoint_id,alert_type,status,message,reviewed_by,reviewed_at,closed_by,closed_at,close_note,reopened_by,reopened_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(id) DO NOTHING',[item.id,item.patrolLogId,item.sessionId,item.userId,item.siteId,item.checkpointId==='UNKNOWN'?null:item.checkpointId,item.alertType,item.status,item.message,item.reviewedBy||null,item.reviewedAt||null,item.closedBy||null,item.closedAt||null,item.closeNote||null,item.reopenedBy||null,item.reopenedAt||null,item.createdAt,item.reopenedAt||item.closedAt||item.reviewedAt||item.createdAt]);
    for(const item of data.incident_reports) await insert(client,'Incidents','INSERT INTO incident_reports(id,session_id,customer_id,site_id,user_id,incident_at,shift_code,operational_date,category,severity,title,location_text,latitude,longitude,notes,chronology,initial_action,follow_up,person_involved,witness,vehicle_involved,asset_involved,police_report_no,external_party,status,escalated,escalated_to,closed_at,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) ON CONFLICT(id) DO NOTHING',[item.id,item.sessionId||null,item.customerId||null,item.siteId,item.userId,item.incidentAt,item.shiftCode,item.shiftDate,item.category,item.severity,item.title,item.locationText,item.latitude||null,item.longitude||null,item.notes||null,item.chronology,item.initialAction,item.followUp||null,item.personInvolved||null,item.witness||null,item.vehicleInvolved||null,item.assetInvolved||null,item.policeReportNo||null,item.externalParty||null,item.status,item.escalated,item.escalatedTo||null,item.closedAt||null,item.createdBy,item.createdAt,item.updatedAt]);
    for(const item of data.shift_handovers) await insert(client,'Handovers','INSERT INTO handovers(id,session_id,site_id,operational_date,shift_code,handover_type,from_user_id,to_user_id,event_at,latitude,longitude,condition_status,personnel_status,equipment_status,keys_status,vehicle_status,outstanding_issues,handover_notes,item_name,item_quantity,item_condition,handed_from,handed_to,is_taruna,ack_from,ack_to,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) ON CONFLICT(id) DO NOTHING',[item.id,item.sessionId||null,item.siteId,item.shiftDate,item.shiftCode,item.handoverType,item.fromUserId,item.toUserId||null,item.eventAt,item.latitude||null,item.longitude||null,item.conditionStatus,item.personnelStatus,item.equipmentStatus,item.keysStatus,item.vehicleStatus,item.outstandingIssues||null,item.handoverNotes||null,item.itemName||null,item.itemQuantity||null,item.itemCondition||null,item.handedFrom||null,item.handedTo||null,!!item.isTaruna,item.ackFrom,item.ackTo,item.status,item.createdBy,item.createdAt,item.updatedAt]);
    for(const item of data.media_gallery) { const sessionId=item.sourceModule==='PATROL'?data.patrol_logs.find((log)=>log.id===item.sourceId)?.sessionId:item.sourceModule==='HANDOVER'?data.shift_handovers.find((h)=>h.id===item.handoverId||item.sourceId.startsWith(h.id))?.sessionId:data.incident_reports.find((i)=>i.id===item.incidentId||item.sourceId.startsWith(i.id))?.sessionId; const site=data.sites.find((value)=>value.id===item.siteId); await insert(client,'Media','INSERT INTO media(id,document_type,user_id,session_id,customer_id,site_id,reference_type,reference_id,storage_provider,storage_key,mime_type,file_name,file_size,captured_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'legacy_json\',$9,$10,$11,NULL,$12,$13) ON CONFLICT(id) DO NOTHING',[item.id,normalizeDocumentType(item),item.userId,sessionId||null,site?.customerId||null,item.siteId,item.sourceModule,item.sourceId,`legacy-json:${item.id}`,item.photoUrl.startsWith('data:image/png')?'image/png':'image/jpeg',`${item.id}.jpg`,item.eventAt,item.createdAt]); }
    const userIds=new Set(data.users.map((item)=>item.id)); for(const item of data.audit_logs) await insert(client,'Audit','INSERT INTO audit_logs(id,actor_user_id,actor_role,action,entity_type,entity_id,before_data,after_data,metadata,ip_address,user_agent,created_at) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING',[item.id,userIds.has(item.actorUserId)?item.actorUserId:null,item.action,item.entityType,item.entityId,item.oldValue||null,item.newValue||null,item.reason?{reason:item.reason}:null,item.ipAddress||null,item.userAgent||null,item.createdAt]);
  });
  return summary;
}

function printSummary(result: Summary) { for (const [name,value] of Object.entries(result)) console.log(`${name}: source=${value.source}, inserted=${value.inserted}, updated=${value.updated}, skipped=${value.skipped}, conflicts=${value.conflicts}, failed=${value.failed}`); }
if (process.argv[1]?.toLowerCase().includes('importjson')) importJsonDatabase().then((result)=>{console.log(dryRun?'DRY RUN — no database writes performed.':'JSON import committed.');printSummary(result);}).catch((error)=>{console.error(error instanceof Error?error.message:'Import failed');process.exitCode=1;}).finally(closePostgresPool);
