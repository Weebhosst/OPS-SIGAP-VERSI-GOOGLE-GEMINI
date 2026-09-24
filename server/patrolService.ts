/**
 * OPS SIGAP — Server-Authoritative Patrol Validation Service
 *
 * Round 4A.1: provider-safe. This service must never access the legacy
 * JSON store directly; all persistence goes through RepositoryBundle.
 */

import { repositories } from './repositories';
import { RepositoryError } from './repositories/contracts';
import {
  PatrolLog,
  PatrolSession,
  ValidationStatus,
  calculateDistanceMeters,
  resolveShift,
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

function createLog(
  input: ScanInput,
  values: {
    id: string;
    siteId: string;
    checkpointId?: string;
    validationStatus: ValidationStatus;
    rejectionReason?: string;
    rejectionMessage?: string;
    calculatedDistanceM?: number;
    isLowGpsAccuracy?: boolean;
    roundNumber?: number;
  },
): PatrolLog {
  const now = new Date().toISOString();
  return {
    id: values.id,
    sessionId: input.sessionId,
    checkpointId: values.checkpointId || 'UNKNOWN',
    userId: input.userId,
    siteId: values.siteId,
    validationStatus: values.validationStatus,
    rejectionReason: values.rejectionReason,
    rejectionMessage: values.rejectionMessage,
    latitude: input.latitude,
    longitude: input.longitude,
    gpsAccuracyM: input.gpsAccuracyM,
    calculatedDistanceM: values.calculatedDistanceM || 0,
    photoUrl: input.photoUrl,
    observationStatus: input.observationStatus || 'AMAN',
    notes: input.notes,
    clientCapturedAt: input.clientCapturedAt || now,
    serverReceivedAt: now,
    syncSource: input.syncSource || 'ONLINE',
    isLowGpsAccuracy: values.isLowGpsAccuracy,
    createdAt: now,
    roundNumber: values.roundNumber,
  };
}

function resultFromLog(
  log: PatrolLog,
  session?: PatrolSession,
  checkpoint?: { id: string; code: string; name: string },
): ValidationResult {
  return {
    status: log.validationStatus,
    rejectionReason: log.rejectionReason || undefined,
    rejectionMessage: log.rejectionMessage || undefined,
    calculatedDistanceM: log.calculatedDistanceM,
    checkpointId: checkpoint?.id || (log.checkpointId !== 'UNKNOWN' ? log.checkpointId : undefined),
    checkpointCode: checkpoint?.code,
    checkpointName: checkpoint?.name,
    sessionCompleted: !!session && session.totalRequired > 0 && session.totalValid >= session.totalRequired,
    totalValid: session?.totalValid || 0,
    totalRequired: session?.totalRequired || 0,
    completionPct: session?.completionPct || 0,
    log,
    session,
  };
}

async function persistRejected(
  input: ScanInput,
  session: PatrolSession,
  logId: string,
  rejectionReason: string,
  rejectionMessage: string,
  options: {
    checkpointId?: string;
    calculatedDistanceM?: number;
    validationStatus?: ValidationStatus;
    isLowGpsAccuracy?: boolean;
    roundNumber?: number;
  } = {},
) {
  const log = createLog(input, {
    id: logId,
    siteId: session.siteId,
    checkpointId: options.checkpointId,
    validationStatus: options.validationStatus || 'REJECTED',
    rejectionReason,
    rejectionMessage,
    calculatedDistanceM: options.calculatedDistanceM,
    isLowGpsAccuracy: options.isLowGpsAccuracy,
    roundNumber: options.roundNumber,
  });
  const stored = await repositories.patrol.addLogAtomic(log);
  return stored;
}

function parseQr(rawValue: string) {
  const rawQr = rawValue.trim();
  let secureToken = rawQr;
  let encodedCheckpointId: string | null = null;
  try {
    const payload = JSON.parse(rawQr);
    if (typeof payload?.token === 'string' && typeof payload?.checkpointId === 'string') {
      secureToken = payload.token.trim();
      encodedCheckpointId = payload.checkpointId.trim();
    }
  } catch {
    // Backward compatibility: older cards may contain only the secure token.
  }
  return { secureToken, encodedCheckpointId };
}

export async function validateAndProcessScan(input: ScanInput): Promise<ValidationResult> {
  const logId = input.idempotencyId || `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const existingLog = await repositories.patrol.findById(logId);
  if (existingLog) {
    const existingSession = await repositories.sessions.findById(existingLog.sessionId);
    return resultFromLog(existingLog, existingSession);
  }

  const session = await repositories.sessions.findById(input.sessionId);
  if (!session) {
    // PostgreSQL intentionally does not persist a log with a missing session
    // because referential integrity is enforced by FK constraints.
    const transient = createLog(input, {
      id: logId,
      siteId: 'UNKNOWN',
      validationStatus: 'REJECTED',
      rejectionReason: 'SESSION_MISSING',
      rejectionMessage: 'Sesi patroli tidak ditemukan di server.',
    });
    return resultFromLog(transient);
  }

  if (session.status !== 'ACTIVE') {
    const log = await persistRejected(input, session, logId, 'SESSION_NOT_OPEN', 'Sesi patroli ini sudah selesai atau ditutup.');
    return resultFromLog(log, session);
  }

  if (session.userId !== input.userId) {
    const log = await persistRejected(input, session, logId, 'WRONG_USER', 'Sesi patroli bukan milik akun yang sedang login.');
    return resultFromLog(log, session);
  }

  if (!session.startDocumentationCompleted) {
    const log = await persistRejected(
      input,
      session,
      logId,
      'START_DOCUMENTATION_REQUIRED',
      'Sertigas Naik Jaga wajib disimpan sebelum patroli.',
    );
    return resultFromLog(log, session);
  }

  const { secureToken, encodedCheckpointId } = parseQr(input.qrToken);
  const checkpoint = await repositories.checkpoints.findByToken(secureToken);
  if (!checkpoint) {
    const log = await persistRejected(input, session, logId, 'QR_UNKNOWN', 'QR Code tidak dikenali dalam sistem.');
    return resultFromLog(log, session);
  }

  if (encodedCheckpointId && encodedCheckpointId !== checkpoint.id) {
    const log = await persistRejected(
      input,
      session,
      logId,
      'QR_CHECKPOINT_MISMATCH',
      'Checkpoint ID pada QR tidak cocok dengan secure token.',
      { checkpointId: checkpoint.id },
    );
    return resultFromLog(log, session, checkpoint);
  }

  if (checkpoint.qrStatus !== 'ACTIVE') {
    const log = await persistRejected(
      input,
      session,
      logId,
      'QR_INACTIVE',
      `QR Code untuk ${checkpoint.name} sudah tidak aktif atau telah diregenerasi.`,
      { checkpointId: checkpoint.id },
    );
    return resultFromLog(log, session, checkpoint);
  }

  if (checkpoint.status !== 'ACTIVE') {
    const log = await persistRejected(
      input,
      session,
      logId,
      'CHECKPOINT_INACTIVE',
      `Titik checkpoint ${checkpoint.code} (${checkpoint.name}) saat ini tidak aktif.`,
      { checkpointId: checkpoint.id },
    );
    return resultFromLog(log, session, checkpoint);
  }

  if (checkpoint.siteId !== session.siteId) {
    const log = await persistRejected(
      input,
      session,
      logId,
      'WRONG_SITE',
      `Checkpoint ${checkpoint.code} bukan milik site patroli ini.`,
      { checkpointId: checkpoint.id },
    );
    return resultFromLog(log, session, checkpoint);
  }

  const [existingLogs, site, activeCheckpoints] = await Promise.all([
    repositories.patrol.listAllBySession(session.id),
    repositories.sites.findById(session.siteId),
    repositories.checkpoints.listBySite(session.siteId),
  ]);
  const enabledCheckpoints = activeCheckpoints.filter((item) => item.status === 'ACTIVE');
  const checkpointsPerRound = Math.max(1, enabledCheckpoints.length);
  const targetRounds = Math.max(1, site?.targetRoundsPerShift || 1);
  const validLogs = existingLogs.filter((item) => item.validationStatus === 'VALID');
  const currentRound = Math.min(targetRounds, Math.floor(validLogs.length / checkpointsPerRound) + 1);

  const alreadyValid = validLogs.some(
    (item) => item.checkpointId === checkpoint.id && (item.roundNumber || 1) === currentRound,
  );
  if (alreadyValid) {
    const log = await persistRejected(
      input,
      session,
      logId,
      'DUPLICATE_CHECKPOINT',
      `Titik checkpoint ${checkpoint.code} (${checkpoint.name}) sudah tervalidasi pada ronde ini.`,
      { checkpointId: checkpoint.id, roundNumber: currentRound },
    );
    return resultFromLog(log, session, checkpoint);
  }

  const distance = calculateDistanceMeters(
    input.latitude,
    input.longitude,
    checkpoint.latitude,
    checkpoint.longitude,
  );
  const isLowGpsAccuracy = (input.gpsAccuracyM ?? 0) > 20;

  if (distance > checkpoint.radiusMeters) {
    const diff = (distance - checkpoint.radiusMeters).toFixed(1);
    const message = `Di luar radius checkpoint. Jarak ${distance.toFixed(1)} m, batas ${checkpoint.radiusMeters} m (selisih +${diff} m).`;
    const log = await persistRejected(
      input,
      session,
      logId,
      'OUTSIDE_RADIUS',
      message,
      {
        checkpointId: checkpoint.id,
        calculatedDistanceM: distance,
        isLowGpsAccuracy,
        roundNumber: currentRound,
      },
    );
    return resultFromLog(log, session, checkpoint);
  }

  if (!input.photoUrl?.trim()) {
    const log = await persistRejected(
      input,
      session,
      logId,
      'PHOTO_MISSING',
      'Bukti foto wajib diambil langsung di lokasi untuk validasi.',
      {
        checkpointId: checkpoint.id,
        calculatedDistanceM: distance,
        validationStatus: 'REVIEW',
        isLowGpsAccuracy,
        roundNumber: currentRound,
      },
    );
    return resultFromLog(log, session, checkpoint);
  }

  if (repositories.provider === 'postgres' && input.photoUrl.startsWith('data:')) {
    const log = await persistRejected(
      input,
      session,
      logId,
      'MEDIA_STORAGE_NOT_READY',
      'Penyimpanan foto produksi belum aktif. Scan tidak dihitung agar bukti foto tidak hilang.',
      {
        checkpointId: checkpoint.id,
        calculatedDistanceM: distance,
        validationStatus: 'REVIEW',
        isLowGpsAccuracy,
        roundNumber: currentRound,
      },
    );
    return resultFromLog(log, session, checkpoint);
  }

  const now = new Date().toISOString();
  const validLog = createLog(input, {
    id: logId,
    siteId: session.siteId,
    checkpointId: checkpoint.id,
    validationStatus: 'VALID',
    calculatedDistanceM: distance,
    isLowGpsAccuracy,
    roundNumber: currentRound,
  });

  try {
    await repositories.patrol.addLogAtomic(validLog);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === 'DUPLICATE_CHECKPOINT') {
      const duplicateLog = createLog(input, {
        id: logId,
        siteId: session.siteId,
        checkpointId: checkpoint.id,
        validationStatus: 'REJECTED',
        rejectionReason: 'DUPLICATE_CHECKPOINT',
        rejectionMessage: `Titik checkpoint ${checkpoint.code} (${checkpoint.name}) sudah tervalidasi pada ronde ini.`,
        roundNumber: currentRound,
      });
      return resultFromLog(duplicateLog, session, checkpoint);
    }
    throw error;
  }

  await repositories.media.add(
    {
      id: `MED-${logId}`,
      sourceModule: 'PATROL',
      sourceTable: 'patrol_logs',
      sourceId: logId,
      siteId: session.siteId,
      userId: input.userId,
      shiftDate: session.shiftDate,
      shiftCode: session.shiftCode,
      category: 'PATROLI_QR',
      documentType: 'PATROLI_QR',
      subcategory: input.observationStatus || 'AMAN',
      photoUrl: input.photoUrl,
      caption: `${checkpoint.code} (${checkpoint.name}) • Jarak ${distance.toFixed(1)}m • ${input.observationStatus || 'AMAN'}`,
      eventAt: input.clientCapturedAt || now,
      latitude: input.latitude,
      longitude: input.longitude,
      checkpointId: checkpoint.id,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: input.userId,
    },
    session.id,
    session.customerId,
  );

  const updatedLogs = await repositories.patrol.listAllBySession(session.id);
  const totalValid = updatedLogs.filter((item) => item.validationStatus === 'VALID').length;
  const totalRequired = session.totalRequired;
  const completionPct = totalRequired > 0 ? Math.min(100, Math.round(totalValid / totalRequired * 100)) : 0;
  const isComplete = totalRequired > 0 && totalValid >= totalRequired;

  if (isComplete && session.totalValid < totalRequired) {
    await repositories.audit.append({
      actorUserId: input.userId,
      action: 'PATROL_TARGET_ACHIEVED',
      entityType: 'patrol_session',
      entityId: session.id,
      newValue: {
        totalValid,
        totalRequired,
        completionPct: 100,
        achievedAt: input.clientCapturedAt || now,
      },
      reason: `Target checkpoint tercapai (${totalValid}/${totalRequired}); menunggu Turun Jaga`,
    });
  }

  const updatedSession = await repositories.sessions.update(session.id, {
    totalValid,
    completionPct,
    roundNumber: Math.min(targetRounds, Math.floor(totalValid / checkpointsPerRound) + 1),
  });

  return {
    status: 'VALID',
    calculatedDistanceM: distance,
    checkpointId: checkpoint.id,
    checkpointCode: checkpoint.code,
    checkpointName: checkpoint.name,
    sessionCompleted: isComplete,
    totalValid,
    totalRequired,
    completionPct,
    log: validLog,
    session: updatedSession || session,
  };
}

export async function getMemberShiftProgress(userId: string, siteId: string) {
  const shift = resolveShift();
  const [site, checkpoints, activeCandidate, completed] = await Promise.all([
    repositories.sites.findById(siteId),
    repositories.checkpoints.listBySite(siteId),
    repositories.sessions.getActiveByUser(userId),
    repositories.sessions.listFiltered(
      {
        userId,
        siteId,
        shiftCode: shift.code,
        status: 'COMPLETED',
        operationalDate: shift.operationalDate,
      },
      { limit: 1, offset: 0 },
    ),
  ]);

  const activeSession = activeCandidate
    && activeCandidate.siteId === siteId
    && activeCandidate.shiftCode === shift.code
    && activeCandidate.shiftDate === shift.operationalDate
    ? activeCandidate
    : undefined;

  const targetRounds = Math.max(1, site?.targetRoundsPerShift || 1);
  const checkpointsPerRound = Math.max(1, checkpoints.filter((checkpoint) => checkpoint.status === 'ACTIVE').length);
  const completedSession = completed.items[0];
  const completedRounds = completedSession
    ? targetRounds
    : Math.min(targetRounds, Math.floor((activeSession?.totalValid || 0) / checkpointsPerRound));

  return {
    shift,
    targetRounds,
    completedRounds,
    activeSession,
    isTargetAchieved: completedRounds >= targetRounds,
  };
}
