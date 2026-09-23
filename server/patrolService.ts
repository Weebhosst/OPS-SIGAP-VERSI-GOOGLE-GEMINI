/**
 * OPS SIGAP — Server-Authoritative Patrol Validation Service
 */

import { db } from './db';
import {
  PatrolLog,
  PatrolSession,
  ValidationStatus,
  calculateDistanceMeters,
  resolveShift,
  getJakartaDateParts,
} from '../src/types/ops';

export interface ScanInput {
  sessionId: string;
  qrToken: string;
  latitude: number;
  longitude: number;
  gpsAccuracyM?: number;
  photoUrl?: string;
  observationStatus?: 'AMAN' | 'TEMUAN' | 'INSIDEN';
  notes?: string;
  clientCapturedAt?: string;
  syncSource?: 'ONLINE' | 'OFFLINE_QUEUE';
  idempotencyId?: string;
  userId: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  rejectionReason?: string;
  rejectionMessage?: string;
  calculatedDistanceM: number;
  checkpointId?: string;
  checkpointCode?: string;
  checkpointName?: string;
  sessionCompleted: boolean;
  totalValid: number;
  totalRequired: number;
  completionPct: number;
  log: PatrolLog;
  session?: PatrolSession;
}

export function validateAndProcessScan(input: ScanInput): ValidationResult {
  const now = new Date().toISOString();
  const clientTime = input.clientCapturedAt || now;
  const syncSource = input.syncSource || 'ONLINE';
  const observationStatus = input.observationStatus || 'AMAN';
  const logId = input.idempotencyId || `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Check idempotency: if log already processed, return it
  const existingLog = db.findPatrolLogById(logId);
  if (existingLog) {
    const session = db.findSessionById(existingLog.sessionId);
    return {
      status: existingLog.validationStatus,
      rejectionReason: existingLog.rejectionReason || undefined,
      rejectionMessage: existingLog.rejectionMessage || undefined,
      calculatedDistanceM: existingLog.calculatedDistanceM,
      checkpointId: existingLog.checkpointId,
      sessionCompleted: session?.status === 'COMPLETE',
      totalValid: session?.totalValid || 0,
      totalRequired: session?.totalRequired || 5,
      completionPct: session?.completionPct || 0,
      log: existingLog,
      session,
    };
  }

  // 1. Session exists?
  const session = db.findSessionById(input.sessionId);
  if (!session) {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: input.sessionId,
      checkpointId: 'UNKNOWN',
      userId: input.userId,
      siteId: 'UNKNOWN',
      validationStatus: 'REJECTED',
      rejectionReason: 'SESSION_MISSING',
      rejectionMessage: 'Sesi patroli tidak ditemukan di server.',
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracyM: input.gpsAccuracyM,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'SESSION_MISSING',
      rejectionMessage: 'Sesi patroli tidak ditemukan di server.',
      calculatedDistanceM: 0,
      sessionCompleted: false,
      totalValid: 0,
      totalRequired: 5,
      completionPct: 0,
      log: failedLog,
    };
  }

  // 2. Session OPEN?
  if (session.status !== 'OPEN') {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: 'UNKNOWN',
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'SESSION_NOT_OPEN',
      rejectionMessage: 'Sesi patroli ini sudah selesai atau ditutup.',
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracyM: input.gpsAccuracyM,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'SESSION_NOT_OPEN',
      rejectionMessage: 'Sesi patroli ini sudah selesai atau ditutup.',
      calculatedDistanceM: 0,
      sessionCompleted: session.status === 'COMPLETE',
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 3. User match?
  if (session.userId !== input.userId) {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: 'UNKNOWN',
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'WRONG_USER',
      rejectionMessage: 'Sesi patroli bukan milik akun yang sedang login.',
      latitude: input.latitude,
      longitude: input.longitude,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'WRONG_USER',
      rejectionMessage: 'Sesi patroli bukan milik akun yang sedang login.',
      calculatedDistanceM: 0,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 4. Resolve QR token
  const cp = db.findCheckpointByToken(input.qrToken.trim());
  if (!cp) {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: 'UNKNOWN',
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'QR_UNKNOWN',
      rejectionMessage: 'QR Code tidak dikenali dalam sistem.',
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracyM: input.gpsAccuracyM,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'QR_UNKNOWN',
      rejectionMessage: 'QR Code tidak dikenali dalam sistem.',
      calculatedDistanceM: 0,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 5. Checkpoint & QR status active?
  if (cp.qrStatus !== 'ACTIVE') {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: cp.id,
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'QR_INACTIVE',
      rejectionMessage: `QR Code untuk ${cp.name} sudah tidak aktif atau telah diregenerasi.`,
      latitude: input.latitude,
      longitude: input.longitude,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'QR_INACTIVE',
      rejectionMessage: `QR Code untuk ${cp.name} sudah tidak aktif atau telah diregenerasi.`,
      calculatedDistanceM: 0,
      checkpointId: cp.id,
      checkpointCode: cp.code,
      checkpointName: cp.name,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  if (cp.status !== 'ACTIVE') {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: cp.id,
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'CHECKPOINT_INACTIVE',
      rejectionMessage: `Titik checkpoint ${cp.code} (${cp.name}) saat ini tidak aktif.`,
      latitude: input.latitude,
      longitude: input.longitude,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'CHECKPOINT_INACTIVE',
      rejectionMessage: `Titik checkpoint ${cp.code} (${cp.name}) saat ini tidak aktif.`,
      calculatedDistanceM: 0,
      checkpointId: cp.id,
      checkpointCode: cp.code,
      checkpointName: cp.name,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 6. Site match?
  if (cp.siteId !== session.siteId) {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: cp.id,
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'WRONG_SITE',
      rejectionMessage: `Checkpoint ${cp.code} bukan milik site patroli ini.`,
      latitude: input.latitude,
      longitude: input.longitude,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'WRONG_SITE',
      rejectionMessage: `Checkpoint ${cp.code} bukan milik site patroli ini.`,
      calculatedDistanceM: 0,
      checkpointId: cp.id,
      checkpointCode: cp.code,
      checkpointName: cp.name,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 7. Duplicate checkpoint in same session?
  const existingLogsForSession = db.getPatrolLogs(session.id);
  const alreadyValid = existingLogsForSession.some(
    (l) => l.checkpointId === cp.id && l.validationStatus === 'VALID'
  );
  if (alreadyValid) {
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: cp.id,
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'DUPLICATE_CHECKPOINT',
      rejectionMessage: `Titik checkpoint ${cp.code} (${cp.name}) sudah tervalidasi pada ronde ini.`,
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracyM: input.gpsAccuracyM,
      calculatedDistanceM: 0,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'DUPLICATE_CHECKPOINT',
      rejectionMessage: `Titik checkpoint ${cp.code} (${cp.name}) sudah tervalidasi pada ronde ini.`,
      calculatedDistanceM: 0,
      checkpointId: cp.id,
      checkpointCode: cp.code,
      checkpointName: cp.name,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 8. GPS Distance Validation (Haversine)
  const distance = calculateDistanceMeters(
    input.latitude,
    input.longitude,
    cp.latitude,
    cp.longitude
  );

  const isLowGpsAccuracy = (input.gpsAccuracyM ?? 0) > 20;

  if (distance > cp.radiusMeters) {
    const diff = (distance - cp.radiusMeters).toFixed(1);
    const msg = `Di luar radius checkpoint. Jarak ${distance.toFixed(1)} m, batas ${cp.radiusMeters} m (selisih +${diff} m).`;
    const failedLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: cp.id,
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REJECTED',
      rejectionReason: 'OUTSIDE_RADIUS',
      rejectionMessage: msg,
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracyM: input.gpsAccuracyM,
      calculatedDistanceM: distance,
      photoUrl: input.photoUrl,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      isLowGpsAccuracy,
      createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return {
      status: 'REJECTED',
      rejectionReason: 'OUTSIDE_RADIUS',
      rejectionMessage: msg,
      calculatedDistanceM: distance,
      checkpointId: cp.id,
      checkpointCode: cp.code,
      checkpointName: cp.name,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: failedLog,
      session,
    };
  }

  // 9. Photo evidence check
  if (!input.photoUrl || input.photoUrl.trim() === '') {
    const reviewLog: PatrolLog = {
      id: logId,
      sessionId: session.id,
      checkpointId: cp.id,
      userId: input.userId,
      siteId: session.siteId,
      validationStatus: 'REVIEW',
      rejectionReason: 'PHOTO_MISSING',
      rejectionMessage: 'Bukti foto wajib diambil langsung di lokasi untuk validasi.',
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracyM: input.gpsAccuracyM,
      calculatedDistanceM: distance,
      photoUrl: undefined,
      observationStatus,
      notes: input.notes,
      clientCapturedAt: clientTime,
      serverReceivedAt: now,
      syncSource,
      isLowGpsAccuracy,
      createdAt: now,
    };
    db.addPatrolLog(reviewLog);
    return {
      status: 'REVIEW',
      rejectionReason: 'PHOTO_MISSING',
      rejectionMessage: 'Bukti foto wajib diambil langsung di lokasi untuk validasi.',
      calculatedDistanceM: distance,
      checkpointId: cp.id,
      checkpointCode: cp.code,
      checkpointName: cp.name,
      sessionCompleted: false,
      totalValid: session.totalValid,
      totalRequired: session.totalRequired,
      completionPct: session.completionPct,
      log: reviewLog,
      session,
    };
  }

  // 10. ALL CRITERIA PASSED -> VALID!
  const validLog: PatrolLog = {
    id: logId,
    sessionId: session.id,
    checkpointId: cp.id,
    userId: input.userId,
    siteId: session.siteId,
    validationStatus: 'VALID',
    latitude: input.latitude,
    longitude: input.longitude,
    gpsAccuracyM: input.gpsAccuracyM,
    calculatedDistanceM: distance,
    photoUrl: input.photoUrl,
    observationStatus,
    notes: input.notes,
    clientCapturedAt: clientTime,
    serverReceivedAt: now,
    syncSource,
    isLowGpsAccuracy,
    createdAt: now,
  };

  db.addPatrolLog(validLog);

  // Automatically register photo in Unified Media Gallery
  db.addMedia({
    id: `MED-${logId}`,
    sourceModule: 'PATROL',
    sourceTable: 'patrol_logs',
    sourceId: logId,
    siteId: session.siteId,
    userId: input.userId,
    shiftDate: session.shiftDate,
    shiftCode: session.shiftCode,
    category: 'PATROLI',
    subcategory: observationStatus,
    photoUrl: input.photoUrl,
    caption: `${cp.code} (${cp.name}) • Jarak ${distance.toFixed(1)}m • ${observationStatus}`,
    eventAt: clientTime,
    latitude: input.latitude,
    longitude: input.longitude,
    checkpointId: cp.id,
    status: 'ACTIVE',
    createdAt: now,
    createdBy: input.userId,
  });

  // Recalculate session progress
  const updatedLogs = db.getPatrolLogs(session.id);
  const uniqueValidCheckpoints = new Set(
    updatedLogs.filter((l) => l.validationStatus === 'VALID').map((l) => l.checkpointId)
  );
  const totalValid = uniqueValidCheckpoints.size;
  const totalRequired = session.totalRequired;
  const completionPct = Math.round((totalValid / totalRequired) * 100);

  const isComplete = totalValid >= totalRequired;

  const sessionUpdates: Partial<PatrolSession> = {
    totalValid,
    completionPct,
  };

  if (isComplete) {
    sessionUpdates.status = 'COMPLETE';
    sessionUpdates.endedAt = clientTime;
    sessionUpdates.endLatitude = input.latitude;
    sessionUpdates.endLongitude = input.longitude;

    // Audit log round completed
    db.addAuditLog({
      actorUserId: input.userId,
      action: 'PATROL_ROUND_COMPLETE',
      entityType: 'patrol_session',
      entityId: session.id,
      newValue: {
        totalValid,
        totalRequired,
        completionPct: 100,
        endedAt: clientTime,
      },
      reason: `Ronde patroli selesai 100% (${totalValid}/${totalRequired} checkpoint valid)`,
    });
  }

  const updatedSession = db.updatePatrolSession(session.id, sessionUpdates);

  return {
    status: 'VALID',
    calculatedDistanceM: distance,
    checkpointId: cp.id,
    checkpointCode: cp.code,
    checkpointName: cp.name,
    sessionCompleted: isComplete,
    totalValid,
    totalRequired,
    completionPct,
    log: validLog,
    session: updatedSession,
  };
}

/**
 * Get shift round progress for a member
 */
export function getMemberShiftProgress(userId: string, siteId: string) {
  const shift = resolveShift();
  const allSessions = db.getPatrolSessions({
    userId,
    siteId,
    shiftCode: shift.code,
  });

  // Completed rounds today for this shift
  const completedRounds = allSessions.filter(
    (s) => s.status === 'COMPLETE' && s.shiftDate === shift.operationalDate
  ).length;

  const activeSession = allSessions.find(
    (s) => s.status === 'OPEN' && s.shiftDate === shift.operationalDate
  );

  return {
    shift,
    targetRounds: 5,
    completedRounds,
    activeSession,
    isTargetAchieved: completedRounds >= 5,
  };
}
