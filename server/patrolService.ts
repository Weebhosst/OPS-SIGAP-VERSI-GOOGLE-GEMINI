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
      sessionCompleted: session?.status === 'COMPLETED',
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

  // 2. Session ACTIVE?
  if (session.status !== 'ACTIVE') {
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
      sessionCompleted: session.status === 'COMPLETED',
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

  if (!session.startDocumentationCompleted) {
    const failedLog: PatrolLog = {
      id: logId, sessionId: session.id, checkpointId: 'UNKNOWN', userId: input.userId, siteId: session.siteId,
      validationStatus: 'REJECTED', rejectionReason: 'START_DOCUMENTATION_REQUIRED',
      rejectionMessage: 'Sertigas Naik Jaga wajib disimpan sebelum patroli.', latitude: input.latitude, longitude: input.longitude,
      calculatedDistanceM: 0, photoUrl: input.photoUrl, observationStatus, notes: input.notes,
      clientCapturedAt: clientTime, serverReceivedAt: now, syncSource, createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return { status: 'REJECTED', rejectionReason: 'START_DOCUMENTATION_REQUIRED', rejectionMessage: 'Sertigas Naik Jaga wajib disimpan sebelum patroli.', calculatedDistanceM: 0, sessionCompleted: false, totalValid: session.totalValid, totalRequired: session.totalRequired, completionPct: session.completionPct, log: failedLog, session };
  }

  // 4. Resolve QR payload. Legacy token-only QR remains readable, while new QR binds checkpoint ID + secure token.
  const rawQr = input.qrToken.trim();
  let secureToken = rawQr;
  let encodedCheckpointId: string | null = null;
  try {
    const payload = JSON.parse(rawQr);
    if (typeof payload?.token === 'string' && typeof payload?.checkpointId === 'string') {
      secureToken = payload.token.trim();
      encodedCheckpointId = payload.checkpointId.trim();
    }
  } catch {
    // Backward compatibility for QR cards that contain only the secure token.
  }
  const cp = db.findCheckpointByToken(secureToken);
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

  if (encodedCheckpointId && encodedCheckpointId !== cp.id) {
    const failedLog: PatrolLog = {
      id: logId, sessionId: session.id, checkpointId: cp.id, userId: input.userId, siteId: session.siteId,
      validationStatus: 'REJECTED', rejectionReason: 'QR_CHECKPOINT_MISMATCH',
      rejectionMessage: 'Checkpoint ID pada QR tidak cocok dengan secure token.', latitude: input.latitude,
      longitude: input.longitude, calculatedDistanceM: 0, photoUrl: input.photoUrl, observationStatus,
      notes: input.notes, clientCapturedAt: clientTime, serverReceivedAt: now, syncSource, createdAt: now,
    };
    db.addPatrolLog(failedLog);
    return { status: 'REJECTED', rejectionReason: 'QR_CHECKPOINT_MISMATCH', rejectionMessage: 'Checkpoint ID pada QR tidak cocok dengan secure token.', calculatedDistanceM: 0, checkpointId: cp.id, sessionCompleted: false, totalValid: session.totalValid, totalRequired: session.totalRequired, completionPct: session.completionPct, log: failedLog, session };
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
  const checkpointsPerRound = Math.max(1, db.getCheckpoints(session.siteId).filter((checkpoint) => checkpoint.status === 'ACTIVE').length);
  const targetRounds = Math.max(1, db.findSiteById(session.siteId)?.targetRoundsPerShift || 1);
  const validLogsCount = existingLogsForSession.filter((log) => log.validationStatus === 'VALID').length;
  const currentRound = Math.min(targetRounds, Math.floor(validLogsCount / checkpointsPerRound) + 1);
  const alreadyValid = existingLogsForSession.some(
    (l) => l.checkpointId === cp.id && l.validationStatus === 'VALID' && (l.roundNumber || 1) === currentRound
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
      roundNumber: currentRound,
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
      roundNumber: currentRound,
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
      roundNumber: currentRound,
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
    roundNumber: currentRound,
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
  const totalValid = updatedLogs.filter((l) => l.validationStatus === 'VALID').length;
  const totalRequired = session.totalRequired;
  const completionPct = Math.round((totalValid / totalRequired) * 100);

  const isComplete = totalValid >= totalRequired;

  const sessionUpdates: Partial<PatrolSession> = {
    totalValid,
    completionPct,
    roundNumber: Math.min(targetRounds, Math.floor(totalValid / checkpointsPerRound) + 1),
  };

  if (isComplete) {
    // Checkpoint target achieved. Session remains ACTIVE until mandatory Turun Jaga documentation.
    db.addAuditLog({
      actorUserId: input.userId,
      action: 'PATROL_TARGET_ACHIEVED',
      entityType: 'patrol_session',
      entityId: session.id,
      newValue: {
        totalValid,
        totalRequired,
        completionPct: 100,
        achievedAt: clientTime,
      },
      reason: `Target checkpoint tercapai (${totalValid}/${totalRequired}); menunggu Turun Jaga`,
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

  const activeSession = allSessions.find(
    (s) => s.status === 'ACTIVE' && s.shiftDate === shift.operationalDate
  );
  const targetRounds = Math.max(1, db.findSiteById(siteId)?.targetRoundsPerShift || 1);
  const checkpointsPerRound = Math.max(1, db.getCheckpoints(siteId).filter((checkpoint) => checkpoint.status === 'ACTIVE').length);
  const completedSession = allSessions.find((s) => s.status === 'COMPLETED' && s.shiftDate === shift.operationalDate);
  const completedRounds = completedSession ? targetRounds : Math.min(targetRounds, Math.floor((activeSession?.totalValid || 0) / checkpointsPerRound));

  return {
    shift,
    targetRounds,
    completedRounds,
    activeSession,
    isTargetAchieved: completedRounds >= targetRounds,
  };
}
