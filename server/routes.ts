/**
 * OPS SIGAP — Express API Router
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { validateAndProcessScan, getMemberShiftProgress } from './patrolService';
import { getOperationalMedia, getOperationalMediaCounts } from './mediaService';
import { checkMediaStorage, cleanupPreparedMedia, prepareMedia, prepareMediaBatch, readMediaObject } from './mediaStorage';
import { repositories } from './repositories';
import { RepositoryError } from './repositories/contracts';
import {
  User,
  resolveShift,
  getJakartaDateParts,
  ShiftHandover,
  IncidentReport,
  PatrolSession,
  Role,
  isAdministrator,
} from '../src/types/ops';

export const apiRouter = Router();

// Simple in-memory session store (or token resolver)
// Using signed / encrypted tokens or ID references
const activeSessions = new Map<string, { userId: string; expiresAt: number }>();

function createSessionToken(userId: string): string {
  const token = `SIGAP-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  activeSessions.set(token, {
    userId,
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
  });
  return token;
}

// Authentication Middleware
export interface AuthenticatedRequest extends Request {
  user?: User;
}

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Extract token from Authorization header or cookie
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.sigap_session) {
    token = req.cookies.sigap_session;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Sesi login tidak ditemukan.' });
  }

  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Sesi login telah berakhir.' });
  }

  try {
    const user = await repositories.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, error: 'Akun dinonaktifkan atau tidak ditemukan.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('[auth] Repository lookup failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', error: 'Layanan database sedang tidak tersedia.' });
  }
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !isAdministrator(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Fitur ini hanya untuk Administrator.',
    });
  }
  next();
}

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Akses ditolak. Fitur konfigurasi hanya untuk Super Admin.' });
  }
  next();
}

function requireMonitoring(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'CHIEF'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Akses monitoring tidak tersedia untuk akun ini.' });
  }
  next();
}

function requireOperationalWrite(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  if (req.user.role === 'CHIEF') {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Chief hanya dapat melihat data operasional.',
    });
  }

  next();
}

function requireFieldMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized.' });
  if (req.user.role !== 'ANGGOTA') return res.status(403).json({ success: false, error: 'Laporan operasional lapangan hanya dapat dibuat oleh Anggota.' });
  next();
}

function sendRepositoryError(res: Response, error: unknown): boolean {
  if (!(error instanceof RepositoryError)) return false;
  res.status(error.status).json({ success: false, code: error.code, error: error.message });
  return true;
}

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

// Simple rate limiter tracking for brute-force defense
const loginAttempts = new Map<string, { count: number; blockedUntil?: number }>();

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { npk, password } = req.body;

  if (!npk || !password) {
    return res.status(400).json({ success: false, error: 'NPK dan Password wajib diisi.' });
  }

  const cleanNpk = String(npk).trim();
  const attemptKey = `npk:${cleanNpk}`;
  const record = loginAttempts.get(attemptKey);

  if (record && record.blockedUntil && record.blockedUntil > Date.now()) {
    const waitSec = Math.ceil((record.blockedUntil - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      error: `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${waitSec} detik.`,
    });
  }

  let user: User | undefined;
  try {
    user = await repositories.users.findByNpk(cleanNpk);
  } catch (error) {
    console.error('[auth] Login repository lookup failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', error: 'Layanan database sedang tidak tersedia.' });
  }
  if (!user) {
    // Record failed attempt
    const count = (record?.count || 0) + 1;
    loginAttempts.set(attemptKey, {
      count,
      blockedUntil: count >= 5 ? Date.now() + 60000 : undefined,
    });
    return res.status(401).json({ success: false, error: 'NPK atau Password salah.' });
  }

  const validPassword = bcrypt.compareSync(String(password), user.passwordHash);
  if (!validPassword) {
    const count = (record?.count || 0) + 1;
    loginAttempts.set(attemptKey, {
      count,
      blockedUntil: count >= 5 ? Date.now() + 60000 : undefined,
    });
    return res.status(401).json({ success: false, error: 'NPK atau Password salah.' });
  }

  // Reset login attempt counter on success
  loginAttempts.delete(attemptKey);

  // Generate session
  const token = createSessionToken(user.id);

  // Set HTTP-only cookie
  res.cookie('sigap_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600 * 1000,
  });

  // Audit login
  await repositories.audit.append({
    actorUserId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const { passwordHash, ...safeUser } = user;
  res.json({
    success: true,
    user: safeUser,
    token,
  });
});

apiRouter.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { passwordHash, ...safeUser } = req.user!;
  res.json({ success: true, user: safeUser });
});

apiRouter.post('/auth/logout', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.sigap_session) {
    token = req.cookies.sigap_session;
  }

  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie('sigap_session');
  res.json({ success: true, message: 'Berhasil logout.' });
});

apiRouter.post('/auth/reset-password-npk', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'User ID wajib diisi.' });

  const targetUser = await repositories.users.findById(userId);
  if (!targetUser) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });

  const changedAt = new Date().toISOString();
  const newHash = bcrypt.hashSync(targetUser.npk, 10);
  await repositories.users.resetPassword(targetUser.id, newHash, changedAt);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'RESET_PASSWORD_TO_NPK',
    entityType: 'user',
    entityId: targetUser.id,
    reason: `Reset password pengguna ${targetUser.name} (NPK ${targetUser.npk}) kembali ke NPK.`,
  });

  res.json({ success: true, message: `Password ${targetUser.name} berhasil direset ke NPK (${targetUser.npk}).` });
});

// -------------------------------------------------------------
// PATROL ROUTES
// -------------------------------------------------------------

apiRouter.get('/patrol/shift-progress', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const siteId = req.user!.siteId || 'BB92';
  const progress = await getMemberShiftProgress(req.user!.id, siteId);
  res.json({ success: true, ...progress });
});

apiRouter.get('/patrol/current', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const siteId = req.user!.siteId || 'BB92';
  const [activeCandidate, checkpoints, site] = await Promise.all([
    repositories.sessions.getActiveByUser(req.user!.id),
    repositories.checkpoints.listBySite(siteId),
    repositories.sites.findById(siteId),
  ]);
  const openSession = activeCandidate?.siteId === siteId ? activeCandidate : undefined;

  if (!openSession) {
    return res.json({
      success: true,
      hasOpenSession: false,
      session: null,
      checkpoints: checkpoints.map((checkpoint) => ({
        ...checkpoint,
        statusInRound: 'BELUM',
        lastScanLog: null,
      })),
    });
  }

  const logs = await repositories.patrol.listAllBySession(openSession.id);
  const targetRounds = Math.max(1, site?.targetRoundsPerShift || 1);
  const activeCheckpointCount = Math.max(1, checkpoints.filter((checkpoint) => checkpoint.status === 'ACTIVE').length);
  const currentRound = Math.min(targetRounds, Math.floor(openSession.totalValid / activeCheckpointCount) + 1);

  const enrichedCheckpoints = checkpoints.map((checkpoint) => {
    const validLog = logs.find(
      (log) => log.checkpointId === checkpoint.id
        && log.validationStatus === 'VALID'
        && (log.roundNumber || 1) === currentRound,
    );
    const latestLog = logs
      .filter((log) => log.checkpointId === checkpoint.id && (log.roundNumber || 1) === currentRound)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    const statusInRound = validLog?.validationStatus || latestLog?.validationStatus || 'BELUM';
    return { ...checkpoint, statusInRound, lastScanLog: validLog || latestLog || null };
  });

  res.json({
    success: true,
    hasOpenSession: true,
    session: openSession,
    checkpoints: enrichedCheckpoints,
    logs,
    targetRounds,
    currentRound,
    rounds: Array.from({ length: targetRounds }, (_, index) => {
      const roundNumber = index + 1;
      const validIds = new Set(
        logs
          .filter((log) => log.validationStatus === 'VALID' && (log.roundNumber || 1) === roundNumber)
          .map((log) => log.checkpointId),
      );
      return {
        roundNumber,
        completed: validIds.size,
        required: checkpoints.filter((checkpoint) => checkpoint.status === 'ACTIVE').length,
        checkpointIds: [...validIds],
      };
    }),
  });
});

apiRouter.post('/patrol/session/start', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const siteId = req.user!.siteId || 'BB92';
  const existingOpen = await repositories.sessions.getActiveByUser(req.user!.id);
  if (existingOpen) {
    return res.status(400).json({
      success: false,
      code: 'USER_ALREADY_HAS_ACTIVE_SESSION',
      error: 'Anda masih memiliki sesi patroli yang sedang berjalan. Lanjutkan sesi tersebut.',
      session: existingOpen,
    });
  }

  const site = await repositories.sites.findById(siteId);
  if (!site || site.status !== 'ACTIVE') {
    return res.status(400).json({ success: false, code: 'SITE_UNAVAILABLE', error: 'Site penugasan tidak aktif atau tidak ditemukan.' });
  }

  const shift = resolveShift();
  const activeCheckpoints = (await repositories.checkpoints.listBySite(siteId)).filter((c) => c.status === 'ACTIVE');
  const now = new Date().toISOString();

  const roundNumber = 1;

  const newSession: PatrolSession = {
    id: `SES-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    userId: req.user!.id,
    npk: req.user!.npk,
    customerId: site.customerId,
    siteId,
    shiftCode: shift.code,
    shiftDate: shift.operationalDate,
    startedAt: now,
    status: 'ACTIVE',
    forceClosed: false,
    startDocumentationCompleted: false,
    startDocumentationAt: null,
    endDocumentationCompleted: false,
    endDocumentationAt: null,
    totalRequired: activeCheckpoints.length * Math.max(1, site.targetRoundsPerShift || 1),
    totalValid: 0,
    completionPct: 0,
    roundNumber,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const created = await repositories.sessions.startAtomic({ session: newSession, personnelCapacity: site.personnelCapacity });
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'PATROL_SESSION_START',
      entityType: 'patrol_session',
      entityId: created.id,
      newValue: { siteId, shiftCode: shift.code, shiftDate: shift.operationalDate, roundNumber, totalRequired: activeCheckpoints.length },
      reason: `Mulai shift patroli dengan target ${Math.max(1, site.targetRoundsPerShift || 1)} ronde (${shift.name})`,
    });
    res.json({ success: true, session: created });
  } catch (error: any) {
    const controlled = error instanceof RepositoryError;
    const code = controlled ? error.code : 'DATABASE_OPERATION_FAILED';
    const status = Number(error?.status) || (code === 'SITE_CAPACITY_FULL' ? 409 : 400);
    console.error('[session] Start shift failed:', error instanceof Error ? error.message : 'unknown');
    res.status(controlled ? status : 500).json({ success: false, code, error: controlled ? error.message : 'Shift tidak dapat dimulai karena gangguan database.' });
  }
});

apiRouter.post('/patrol/session/:id/start-documentation', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const photoUrl = String(req.body.photoUrl || '').trim();
  if (!photoUrl) return res.status(400).json({ success: false, error: 'Foto Sertigas Naik Jaga wajib diambil.' });

  const session = await repositories.sessions.findById(req.params.id);
  if (!session || session.userId !== req.user!.id) return res.status(404).json({ success: false, error: 'Active session milik Anda tidak ditemukan.' });
  if (session.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Session sudah tidak aktif.' });
  if (session.startDocumentationCompleted) return res.status(409).json({ success: false, error: 'Sertigas Naik Jaga sudah tersimpan.' });

  const now = new Date().toISOString();
  const handoverId = `HND-NAIK-${Date.now()}`;
  const mediaId = `MED-${handoverId}`;
  let prepared;

  try {
    prepared = await prepareMedia({
      mediaId,
      sourceModule: 'HANDOVER',
      siteId: session.siteId,
      userId: req.user!.id,
      documentType: 'SERTIGAS_NAIK_JAGA',
      eventAt: now,
      photoUrl,
    });
  } catch (error) {
    if (sendRepositoryError(res, error)) return;
    throw error;
  }

  let handoverCreated = false;
  try {
    const handover: ShiftHandover = {
      id: handoverId,
      sessionId: session.id,
      siteId: session.siteId,
      shiftDate: session.shiftDate,
      shiftCode: session.shiftCode,
      handoverType: 'NAIK_JAGA',
      fromUserId: req.user!.id,
      toUserId: null,
      eventAt: now,
      photoUrl: prepared.photoUrl,
      photoUrls: [prepared.photoUrl],
      conditionStatus: 'BAIK',
      personnelStatus: 'Petugas memulai shift',
      equipmentStatus: 'Dicatat saat naik jaga',
      keysStatus: 'Dicatat saat naik jaga',
      vehicleStatus: 'Dicatat saat naik jaga',
      outstandingIssues: '',
      handoverNotes: 'Sertigas Naik Jaga',
      ackFrom: true,
      ackTo: false,
      status: 'SUBMITTED',
      createdBy: req.user!.id,
      createdAt: now,
      updatedAt: now,
    };

    await repositories.handovers.create(handover);
    handoverCreated = true;
    await repositories.media.add({
      id: mediaId,
      sourceModule: 'HANDOVER',
      sourceTable: 'shift_handovers',
      sourceId: handoverId,
      siteId: session.siteId,
      userId: req.user!.id,
      shiftDate: session.shiftDate,
      shiftCode: session.shiftCode,
      category: 'SERTIGAS NAIK JAGA',
      documentType: 'SERTIGAS_NAIK_JAGA',
      subcategory: 'NAIK_JAGA',
      photoUrl: prepared.photoUrl,
      storageProvider: prepared.storageProvider,
      storageKey: prepared.storageKey,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      fileSize: prepared.fileSize,
      caption: `Sertigas Naik Jaga • ${req.user!.name}`,
      eventAt: now,
      handoverId,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: req.user!.id,
    }, session.id, session.customerId || null);

    const updated = await repositories.sessions.update(session.id, {
      startDocumentationCompleted: true,
      startDocumentationAt: now,
    });
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'SERTIGAS_NAIK_JAGA',
      entityType: 'patrol_session',
      entityId: session.id,
      newValue: { photoRequired: true, documentedAt: now, mediaId, storageProvider: prepared.storageProvider },
      reason: 'Dokumentasi wajib sebelum patroli',
    });
    const storedHandover = await repositories.handovers.findById(handoverId);
    res.json({ success: true, session: updated, handover: storedHandover || handover });
  } catch (error) {
    if (!handoverCreated) await cleanupPreparedMedia([prepared]);
    if (sendRepositoryError(res, error)) return;
    throw error;
  }
});

apiRouter.post('/patrol/session/:id/close', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const session = await repositories.sessions.findById(req.params.id);
  if (!session || session.userId !== req.user!.id) return res.status(404).json({ success: false, error: 'Active session milik Anda tidak ditemukan.' });
  if (session.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Session sudah tidak aktif.' });

  const [activeCheckpointsRaw, site, validLogsAll] = await Promise.all([
    repositories.checkpoints.listBySite(session.siteId),
    repositories.sites.findById(session.siteId),
    repositories.patrol.listAllBySession(session.id),
  ]);
  const activeCheckpoints = activeCheckpointsRaw.filter((checkpoint) => checkpoint.status === 'ACTIVE');
  const targetRounds = Math.max(1, site?.targetRoundsPerShift || 1);
  const validLogs = validLogsAll.filter((log) => log.validationStatus === 'VALID');
  const missing = Array.from({ length: targetRounds }, (_, index) => index + 1).flatMap(
    (roundNumber) => activeCheckpoints
      .filter((checkpoint) => !validLogs.some((log) => log.checkpointId === checkpoint.id && (log.roundNumber || 1) === roundNumber))
      .map((checkpoint) => ({ id: checkpoint.id, code: checkpoint.code, name: checkpoint.name, roundNumber })),
  );

  if (session.totalValid < session.totalRequired || missing.length) {
    return res.status(409).json({
      success: false,
      code: 'CHECKPOINT_INCOMPLETE',
      error: `Patroli belum selesai. Checkpoint ${session.totalValid}/${session.totalRequired}. Belum selesai: ${missing.map((checkpoint) => `${checkpoint.code} ${checkpoint.name}`).join(', ')}.`,
      progress: { completed: session.totalValid, target: session.totalRequired },
      missingCheckpoints: missing,
    });
  }

  const endPhotoUrl = String(req.body.endPhotoUrl || '').trim();
  if (!endPhotoUrl) return res.status(400).json({ success: false, error: 'Foto Sertigas / Turun Jaga wajib diambil.' });

  const hasSpecialHandover = req.body.hasSpecialHandover === true;
  const specialNotes = String(req.body.specialNotes || '').trim();
  const specialPhotoUrls = Array.isArray(req.body.specialPhotoUrls)
    ? req.body.specialPhotoUrls.filter((item: unknown) => typeof item === 'string' && item)
    : [];
  if (hasSpecialHandover && (!specialNotes || specialPhotoUrls.length < 3 || specialPhotoUrls.length > 5)) {
    return res.status(400).json({ success: false, error: !specialNotes ? 'Catatan TARUNA wajib diisi.' : 'Dokumentasi TARUNA minimal 3 dan maksimal 5 foto.' });
  }

  const now = new Date().toISOString();
  const specialId = hasSpecialHandover ? `HND-TARUNA-${Date.now()}` : null;
  const endId = `HND-TURUN-${Date.now()}`;
  const prepareInputs = [
    ...(specialId ? specialPhotoUrls.map((photoUrl, index) => ({
      mediaId: `MED-${specialId}-${index + 1}`,
      sourceModule: 'HANDOVER' as const,
      siteId: session.siteId,
      userId: req.user!.id,
      documentType: 'TARUNA',
      eventAt: now,
      photoUrl,
    })) : []),
    {
      mediaId: `MED-${endId}`,
      sourceModule: 'HANDOVER' as const,
      siteId: session.siteId,
      userId: req.user!.id,
      documentType: 'SERTIGAS_TURUN_JAGA',
      eventAt: now,
      photoUrl: endPhotoUrl,
    },
  ];

  let preparedEvidence;
  try {
    preparedEvidence = await prepareMediaBatch(prepareInputs);
  } catch (error) {
    if (sendRepositoryError(res, error)) return;
    throw error;
  }

  const specialPrepared = specialId ? preparedEvidence.slice(0, specialPhotoUrls.length) : [];
  const endPrepared = preparedEvidence[preparedEvidence.length - 1];
  let persistenceStarted = false;

  try {
    if (specialId) {
      const specialUrls = specialPrepared.map((item) => item.photoUrl);
      const specialHandover: ShiftHandover = {
        id: specialId,
        sessionId: session.id,
        siteId: session.siteId,
        shiftDate: session.shiftDate,
        shiftCode: session.shiftCode,
        handoverType: 'SERAH_TERIMA',
        fromUserId: req.user!.id,
        eventAt: now,
        photoUrl: specialUrls[0],
        photoUrls: specialUrls,
        conditionStatus: 'PERLU_PERHATIAN',
        personnelStatus: 'TARUNA / serah terima khusus',
        equipmentStatus: '-',
        keysStatus: '-',
        vehicleStatus: '-',
        outstandingIssues: specialNotes,
        handoverNotes: specialNotes,
        isTaruna: true,
        ackFrom: true,
        ackTo: false,
        status: 'SUBMITTED',
        createdBy: req.user!.id,
        createdAt: now,
        updatedAt: now,
      };
      await repositories.handovers.create(specialHandover);
      persistenceStarted = true;
      for (let index = 0; index < specialPrepared.length; index += 1) {
        const prepared = specialPrepared[index];
        await repositories.media.add({
          id: prepareInputs[index].mediaId,
          sourceModule: 'HANDOVER',
          sourceTable: 'shift_handovers',
          sourceId: `${specialId}-${index + 1}`,
          siteId: session.siteId,
          userId: req.user!.id,
          shiftDate: session.shiftDate,
          shiftCode: session.shiftCode,
          category: 'TARUNA',
          documentType: 'TARUNA',
          subcategory: 'SERAH_TERIMA_KHUSUS',
          photoUrl: prepared.photoUrl,
          storageProvider: prepared.storageProvider,
          storageKey: prepared.storageKey,
          mimeType: prepared.mimeType,
          fileName: prepared.fileName,
          fileSize: prepared.fileSize,
          caption: `TARUNA • ${specialNotes}`,
          eventAt: now,
          handoverId: specialId,
          status: 'ACTIVE',
          createdAt: now,
          createdBy: req.user!.id,
        }, session.id, session.customerId || null);
      }
    }

    const endHandover: ShiftHandover = {
      id: endId,
      sessionId: session.id,
      siteId: session.siteId,
      shiftDate: session.shiftDate,
      shiftCode: session.shiftCode,
      handoverType: 'TURUN_JAGA',
      fromUserId: req.user!.id,
      eventAt: now,
      photoUrl: endPrepared.photoUrl,
      photoUrls: [endPrepared.photoUrl],
      conditionStatus: 'BAIK',
      personnelStatus: 'Petugas mengakhiri shift',
      equipmentStatus: 'Diserahterimakan',
      keysStatus: 'Diserahterimakan',
      vehicleStatus: 'Diserahterimakan',
      outstandingIssues: '',
      handoverNotes: 'Sertigas Turun Jaga',
      ackFrom: true,
      ackTo: false,
      status: 'SUBMITTED',
      createdBy: req.user!.id,
      createdAt: now,
      updatedAt: now,
    };
    await repositories.handovers.create(endHandover);
    persistenceStarted = true;
    await repositories.media.add({
      id: `MED-${endId}`,
      sourceModule: 'HANDOVER',
      sourceTable: 'shift_handovers',
      sourceId: endId,
      siteId: session.siteId,
      userId: req.user!.id,
      shiftDate: session.shiftDate,
      shiftCode: session.shiftCode,
      category: 'SERTIGAS TURUN JAGA',
      documentType: 'SERTIGAS_TURUN_JAGA',
      subcategory: 'TURUN_JAGA',
      photoUrl: endPrepared.photoUrl,
      storageProvider: endPrepared.storageProvider,
      storageKey: endPrepared.storageKey,
      mimeType: endPrepared.mimeType,
      fileName: endPrepared.fileName,
      fileSize: endPrepared.fileSize,
      caption: `Sertigas Turun Jaga • ${req.user!.name}`,
      eventAt: now,
      handoverId: endId,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: req.user!.id,
    }, session.id, session.customerId || null);

    const updated = await repositories.sessions.completeAtomic(session.id, req.user!.id, {
      status: 'COMPLETED',
      endedAt: now,
      endDocumentationCompleted: true,
      endDocumentationAt: now,
    });
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'SHIFT_SESSION_COMPLETED',
      entityType: 'patrol_session',
      entityId: session.id,
      oldValue: { status: 'ACTIVE' },
      newValue: {
        status: 'COMPLETED',
        checkpoint: `${session.totalValid}/${session.totalRequired}`,
        endDocumentationAt: now,
        evidenceCount: preparedEvidence.length,
        storageProvider: endPrepared.storageProvider,
      },
      reason: 'Normal close setelah checkpoint dan Turun Jaga lengkap',
    });

    res.json({ success: true, session: updated });
  } catch (error) {
    if (!persistenceStarted) await cleanupPreparedMedia(preparedEvidence);
    if (sendRepositoryError(res, error)) return;
    throw error;
  }
});

apiRouter.post('/patrol/scan', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const {
    sessionId,
    qrToken,
    latitude,
    longitude,
    gpsAccuracyM,
    photoUrl,
    observationStatus,
    notes,
    clientCapturedAt,
    syncSource,
    idempotencyId,
  } = req.body;

  if (!sessionId || !qrToken) {
    return res.status(400).json({
      success: false,
      error: 'Session ID dan Token QR wajib disertakan.',
    });
  }

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Data GPS aktual (Latitude & Longitude) wajib disertakan.',
    });
  }

  const result = await validateAndProcessScan({
    sessionId,
    qrToken,
    latitude: Number(latitude),
    longitude: Number(longitude),
    gpsAccuracyM: gpsAccuracyM ? Number(gpsAccuracyM) : undefined,
    photoUrl,
    observationStatus,
    notes,
    clientCapturedAt,
    syncSource,
    idempotencyId,
    userId: req.user!.id,
  });

  res.json({ success: true, ...result });
});

apiRouter.get('/patrol/sessions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const filter: any = {};
  if (!isAdministrator(req.user!.role)) {
    filter.userId = req.user!.id;
    if (req.user!.siteId) filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
    if (req.query.userId) filter.userId = String(req.query.userId);
  }
  const result = await repositories.sessions.listFiltered(filter, { limit: 500, offset: 0 });
  res.json({ success: true, sessions: result.items });
});

// -------------------------------------------------------------
// HANDOVER ROUTES
// -------------------------------------------------------------

apiRouter.get('/handover', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const filter: any = {};
  if (!isAdministrator(req.user!.role)) {
    if (req.user!.siteId) filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
  }
  const page = await repositories.handovers.list(filter, { limit: 500, offset: 0 });
  res.json({ success: true, handovers: page.items });
});

apiRouter.post('/handover', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const {
    handoverType,
    toUserId,
    eventAt,
    latitude,
    longitude,
    photoUrl,
    conditionStatus,
    personnelStatus,
    equipmentStatus,
    keysStatus,
    vehicleStatus,
    outstandingIssues,
    handoverNotes,
    photoUrls,
    itemName,
    itemQuantity,
    itemCondition,
    handedFrom,
    handedTo,
    isTaruna,
  } = req.body;

  const siteId = req.user!.siteId || 'BB92';
  const activeSession = await repositories.sessions.getActiveByUser(req.user!.id);
  if (!activeSession || activeSession.siteId !== siteId || !activeSession.startDocumentationCompleted) {
    return res.status(409).json({ success: false, error: 'Serah terima barang hanya dapat dibuat saat shift aktif.' });
  }
  if (handoverType && handoverType !== 'SERAH_TERIMA') {
    return res.status(400).json({ success: false, error: 'Naik/Turun Jaga hanya dapat dibuat melalui alur Start/Close Shift.' });
  }

  const evidencePhotos = Array.isArray(photoUrls)
    ? photoUrls.filter((item: unknown) => typeof item === 'string' && item)
    : (photoUrl ? [photoUrl] : []);
  if (!itemName || !itemQuantity || !itemCondition || !handedFrom || !handedTo) {
    return res.status(400).json({ success: false, error: 'Nama barang, jumlah, kondisi, pihak penyerah, dan penerima wajib diisi.' });
  }
  if (!isTaruna && evidencePhotos.length < 1) {
    return res.status(400).json({ success: false, error: 'Dokumentasi Serah Terima Barang wajib diisi.' });
  }
  if (isTaruna && (!String(handoverNotes || '').trim() || evidencePhotos.length < 3 || evidencePhotos.length > 5)) {
    return res.status(400).json({ success: false, error: 'TARUNA membutuhkan catatan dan dokumentasi minimal 3, maksimal 5 foto.' });
  }

  const now = new Date().toISOString();
  const id = `HND-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const documentType = isTaruna ? 'TARUNA' : 'SERAH_TERIMA_BARANG';
  const mediaInputs = evidencePhotos.map((evidencePhoto: string, index: number) => ({
    mediaId: `MED-${id}-${index + 1}`,
    sourceModule: 'HANDOVER' as const,
    siteId,
    userId: req.user!.id,
    documentType,
    eventAt: eventAt || now,
    photoUrl: evidencePhoto,
  }));

  let preparedEvidence;
  try {
    preparedEvidence = await prepareMediaBatch(mediaInputs);
  } catch (error) {
    if (sendRepositoryError(res, error)) return;
    throw error;
  }

  const preparedUrls = preparedEvidence.map((item) => item.photoUrl);
  const handover: ShiftHandover = {
    id,
    sessionId: activeSession.id,
    siteId,
    shiftDate: activeSession.shiftDate,
    shiftCode: activeSession.shiftCode,
    handoverType: 'SERAH_TERIMA',
    fromUserId: req.user!.id,
    toUserId: toUserId || null,
    eventAt: eventAt || now,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    photoUrl: preparedUrls[0] || null,
    photoUrls: preparedUrls,
    itemName,
    itemQuantity: String(itemQuantity),
    itemCondition,
    handedFrom,
    handedTo,
    isTaruna: !!isTaruna,
    conditionStatus: conditionStatus || 'BAIK',
    personnelStatus: personnelStatus || 'Lengkap sesuai regu',
    equipmentStatus: equipmentStatus || 'Lengkap & berfungsi normal',
    keysStatus: keysStatus || 'Kunci pos & portal lengkap',
    vehicleStatus: vehicleStatus || 'Inventaris operasional aman',
    outstandingIssues: outstandingIssues || '',
    handoverNotes: handoverNotes || '',
    ackFrom: true,
    ackTo: false,
    status: 'SUBMITTED',
    createdBy: req.user!.id,
    createdAt: now,
    updatedAt: now,
  };

  let handoverCreated = false;
  try {
    await repositories.handovers.create(handover);
    handoverCreated = true;
    const site = await repositories.sites.findById(siteId);
    for (let index = 0; index < preparedEvidence.length; index += 1) {
      const prepared = preparedEvidence[index];
      await repositories.media.add({
        id: mediaInputs[index].mediaId,
        sourceModule: 'HANDOVER',
        sourceTable: 'shift_handovers',
        sourceId: `${id}-${index + 1}`,
        siteId,
        userId: req.user!.id,
        shiftDate: activeSession.shiftDate,
        shiftCode: activeSession.shiftCode,
        category: isTaruna ? 'TARUNA' : 'SERAH TERIMA BARANG',
        documentType,
        subcategory: isTaruna ? 'TARUNA' : handover.handoverType,
        photoUrl: prepared.photoUrl,
        storageProvider: prepared.storageProvider,
        storageKey: prepared.storageKey,
        mimeType: prepared.mimeType,
        fileName: prepared.fileName,
        fileSize: prepared.fileSize,
        caption: `${isTaruna ? 'TARUNA' : 'Serah Terima Barang'} • ${itemName} • ${site?.name || siteId}`,
        eventAt: handover.eventAt,
        latitude: handover.latitude,
        longitude: handover.longitude,
        handoverId: id,
        status: 'ACTIVE',
        createdAt: now,
        createdBy: req.user!.id,
      }, activeSession.id, activeSession.customerId || null);
    }

    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'HANDOVER_CREATE',
      entityType: 'shift_handover',
      entityId: id,
      newValue: {
        handoverType: handover.handoverType,
        siteId,
        shiftCode: activeSession.shiftCode,
        conditionStatus: handover.conditionStatus,
        evidenceCount: preparedEvidence.length,
        storageProvider: preparedEvidence[0]?.storageProvider,
      },
      reason: `Input serah terima jaga ${handover.handoverType}`,
    });

    const stored = await repositories.handovers.findById(id);
    res.json({ success: true, handover: stored || handover });
  } catch (error) {
    if (!handoverCreated) await cleanupPreparedMedia(preparedEvidence);
    if (sendRepositoryError(res, error)) return;
    throw error;
  }
});

apiRouter.post('/handover/:id/ack', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const handover = await repositories.handovers.findById(req.params.id);
  if (!handover) return res.status(404).json({ success: false, error: 'Data serah terima tidak ditemukan.' });

  const updated = await repositories.handovers.update(handover.id, {
    ackTo: true,
    status: 'ACKNOWLEDGED',
    toUserId: req.user!.id,
  });
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'HANDOVER_ACKNOWLEDGE',
    entityType: 'shift_handover',
    entityId: handover.id,
    reason: `Konfirmasi penerimaan serah terima jaga oleh ${req.user!.name}`,
  });

  res.json({ success: true, handover: updated });
});

// -------------------------------------------------------------
// INCIDENT ROUTES
// -------------------------------------------------------------

apiRouter.get('/incidents', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const filter: any = {};
  if (!isAdministrator(req.user!.role)) {
    if (req.user!.siteId) filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
    if (req.query.status) filter.status = String(req.query.status);
  }
  const page = await repositories.incidents.list(filter, { limit: 500, offset: 0 });
  res.json({ success: true, incidents: page.items });
});

apiRouter.post('/incidents', authMiddleware, requireFieldMember, async (req: AuthenticatedRequest, res: Response) => {
  const {
    category,
    severity,
    title,
    locationText,
    latitude,
    longitude,
    photoUrl,
    photoUrls,
    chronology,
    initialAction,
    followUp,
    personInvolved,
    witness,
    vehicleInvolved,
    assetInvolved,
    policeReportNo,
    externalParty,
    escalated,
    escalatedTo,
    notes,
  } = req.body;

  if (!title || !locationText || !chronology || !initialAction) {
    return res.status(400).json({ success: false, error: 'Judul, Area Kejadian, kronologi, dan tindakan awal wajib diisi.' });
  }

  const siteId = req.user!.siteId || 'BB92';
  const activeSession = await repositories.sessions.getActiveByUser(req.user!.id);
  if (!activeSession || activeSession.siteId !== siteId || !activeSession.startDocumentationCompleted) {
    return res.status(409).json({ success: false, error: 'Laporan kejadian hanya dapat dibuat saat shift aktif setelah Sertigas Naik Jaga.' });
  }

  const incidentPhotos = Array.isArray(photoUrls)
    ? photoUrls.filter((item: unknown) => typeof item === 'string' && item)
    : (photoUrl ? [photoUrl] : []);
  if (incidentPhotos.length < 3) return res.status(400).json({ success: false, error: 'Dokumentasi kejadian minimal 3 foto.' });
  if (incidentPhotos.length > 5) return res.status(400).json({ success: false, error: 'Maksimal 5 foto dokumentasi.' });
  if (rejectUnstoredBase64Media(res, incidentPhotos)) return;

  const now = new Date().toISOString();
  const id = `INC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const incident: IncidentReport = {
    id,
    sessionId: activeSession.id,
    customerId: activeSession.customerId || null,
    siteId,
    userId: req.user!.id,
    incidentAt: now,
    shiftCode: activeSession.shiftCode,
    shiftDate: activeSession.shiftDate,
    category: category || 'INSIDENTIL',
    severity: severity || 'RENDAH',
    title,
    locationText,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    photoUrl: incidentPhotos[0],
    photoUrls: incidentPhotos,
    notes: notes || null,
    chronology,
    initialAction,
    followUp: followUp || null,
    personInvolved: personInvolved || null,
    witness: witness || null,
    vehicleInvolved: vehicleInvolved || null,
    assetInvolved: assetInvolved || null,
    policeReportNo: policeReportNo || null,
    externalParty: externalParty || null,
    status: 'OPEN',
    escalated: !!escalated,
    escalatedTo: escalated ? (escalatedTo || 'SUPERVISOR / POLSEK') : null,
    createdBy: req.user!.id,
    createdAt: now,
    updatedAt: now,
  };

  await repositories.incidents.create(incident);
  for (let index = 0; index < incidentPhotos.length; index += 1) {
    const incidentPhoto = incidentPhotos[index];
    await repositories.media.add({
      id: `MED-${id}-${index + 1}`,
      sourceModule: 'INCIDENT',
      sourceTable: 'incident_reports',
      sourceId: `${id}-${index + 1}`,
      siteId,
      userId: req.user!.id,
      shiftDate: activeSession.shiftDate,
      shiftCode: activeSession.shiftCode,
      category: 'KEJADIAN',
      documentType: 'INSIDEN',
      subcategory: incident.category,
      photoUrl: incidentPhoto,
      caption: `${incident.category} • ${incident.title} [${incident.severity}]`,
      eventAt: incident.incidentAt,
      latitude: incident.latitude,
      longitude: incident.longitude,
      incidentId: id,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: req.user!.id,
    }, activeSession.id, activeSession.customerId || null);
  }

  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'INCIDENT_REPORTED',
    entityType: 'incident_report',
    entityId: id,
    newValue: { title, category: incident.category, severity: incident.severity, escalated: incident.escalated },
    reason: `Laporan kejadian: ${title} (${incident.severity})`,
  });

  res.json({ success: true, incident });
});

apiRouter.patch('/incidents/:id/status', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { status, followUp } = req.body;
  const incident = await repositories.incidents.findById(req.params.id);
  if (!incident) return res.status(404).json({ success: false, error: 'Laporan kejadian tidak ditemukan.' });

  const updates: Partial<IncidentReport> = {};
  if (status) updates.status = status;
  if (followUp) updates.followUp = followUp;
  if (status === 'CLOSED') updates.closedAt = new Date().toISOString();

  const updated = await repositories.incidents.update(incident.id, updates);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'INCIDENT_STATUS_CHANGE',
    entityType: 'incident_report',
    entityId: incident.id,
    oldValue: { status: incident.status },
    newValue: updates,
    reason: `Perubahan status insiden ${incident.id} menjadi ${status}`,
  });

  res.json({ success: true, incident: updated });
});

// -------------------------------------------------------------
// UNIFIED MEDIA GALLERY
// -------------------------------------------------------------

apiRouter.get('/gallery', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const canViewGlobal = isAdministrator(req.user!.role) || req.user!.role === 'CHIEF';
  const filter: any = {};

  if (!canViewGlobal) {
    if (req.user!.siteId) filter.siteId = req.user!.siteId;
    filter.userId = req.user!.id;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.customerId) filter.customerId = String(req.query.customerId);
  }

  if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
  if (req.query.sessionId) filter.sessionId = String(req.query.sessionId);

  const currentJakarta = getJakartaDateParts(new Date());
  const month = Math.min(12, Math.max(1, Number(req.query.month) || currentJakarta.month));
  const year = Math.min(2100, Math.max(2020, Number(req.query.year) || currentJakarta.year));
  let startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  let endExclusive = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const requestedDate = String(req.query.date || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate.startsWith(`${year}-${String(month).padStart(2, '0')}-`)) {
    startDate = requestedDate;
    const [dateYear, dateMonth, dateDay] = requestedDate.split('-').map(Number);
    endExclusive = new Date(Date.UTC(dateYear, dateMonth - 1, dateDay + 1)).toISOString().slice(0, 10);
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 48));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const documentType = String(req.query.documentType || '');

  const queryFilter = {
    ...filter,
    from: startDate,
    to: endExclusive,
    ...(documentType ? { documentType } : {}),
  };
  const [page, counts] = await Promise.all([
    getOperationalMedia(queryFilter, { limit, offset }),
    getOperationalMediaCounts({ ...filter, from: startDate, to: endExclusive }),
  ]);

  const normalizedCounts = {
    SEMUA: counts.SEMUA || 0,
    SERTIGAS: counts.SERTIGAS || 0,
    PATROLI_QR: counts.PATROLI_QR || 0,
    SERAH_TERIMA_BARANG: counts.SERAH_TERIMA_BARANG || 0,
    TARUNA: counts.TARUNA || 0,
    INSIDEN: counts.INSIDEN || 0,
    LAINNYA: counts.LAINNYA || 0,
  };

  res.json({
    success: true,
    media: page.items,
    counts: normalizedCounts,
    pagination: { total: page.total, limit: page.limit, offset: page.offset, hasMore: page.hasMore },
    period: { startDate, endExclusive },
  });
});

apiRouter.get('/monitoring/active-sessions', authMiddleware, requireMonitoring, async (_req: AuthenticatedRequest, res: Response) => {
  const [sitePage, activeSessions] = await Promise.all([
    repositories.sites.list({ limit: 500, offset: 0 }),
    repositories.sessions.listFiltered({ status: 'ACTIVE' }, { limit: 500, offset: 0 }),
  ]);
  const uniqueUserIds = [...new Set(activeSessions.items.map((session) => session.userId))];
  const userEntries = await Promise.all(uniqueUserIds.map(async (id) => [id, await repositories.users.findById(id)] as const));
  const users = new Map(userEntries);

  const sites = sitePage.items.map((site) => {
    const sessions = activeSessions.items
      .filter((session) => session.siteId === site.id)
      .map((session) => {
        const user = users.get(session.userId);
        return { ...session, memberName: user?.name || 'Petugas', npk: user?.npk || session.npk || '-' };
      });
    return {
      ...site,
      activeCount: sessions.length,
      capacityStatus: sessions.length >= site.personnelCapacity ? 'FULL' : 'AVAILABLE',
      sessions,
    };
  });
  res.json({ success: true, sites });
});

apiRouter.post('/admin/sessions/:id/force-close', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, error: 'Alasan Force Close wajib diisi.' });

  const previous = await repositories.sessions.findById(req.params.id);
  if (!previous) return res.status(404).json({ success: false, error: 'Shift session tidak ditemukan.' });

  try {
    const updated = await repositories.sessions.forceCloseAtomic(req.params.id, req.user!.id, req.user!.role, reason);
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'SHIFT_SESSION_FORCE_CLOSED',
      entityType: 'patrol_session',
      entityId: previous.id,
      oldValue: { status: previous.status, totalValid: previous.totalValid, totalRequired: previous.totalRequired },
      newValue: { status: 'FORCE_CLOSED', forceCloseReason: reason, forceCloseRole: req.user!.role },
      reason,
    });
    res.json({ success: true, session: updated });
  } catch (error:any) {
    if (error instanceof RepositoryError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    throw error;
  }
});

// -------------------------------------------------------------
// SUPER ADMIN COMMAND CENTER & MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/admin/command-center', authMiddleware, requireMonitoring, async (req: AuthenticatedRequest, res: Response) => {
  const adminId = req.user!.id;
  const storedFilter = await repositories.adminState.get(adminId);
  const filterState = storedFilter || {
    id: `AFS-${adminId}`,
    userId: adminId,
    siteId: null,
    shiftCode: null,
    memberUserId: null,
    updatedAt: new Date().toISOString(),
  };

  const { dateString: todayJakarta } = getJakartaDateParts();
  const siteId = filterState.siteId || undefined;
  const shiftCode = filterState.shiftCode || undefined;
  const memberUserId = filterState.memberUserId || undefined;

  const sessionFilter:any = { status: 'ACTIVE' };
  if (siteId) sessionFilter.siteId = siteId;
  if (shiftCode) sessionFilter.shiftCode = shiftCode;
  if (memberUserId) sessionFilter.userId = memberUserId;

  const incidentFilter:any = {};
  if (siteId) incidentFilter.siteId = siteId;
  if (shiftCode) incidentFilter.shiftCode = shiftCode;
  if (memberUserId) incidentFilter.userId = memberUserId;

  const handoverFilter:any = {};
  if (siteId) handoverFilter.siteId = siteId;
  if (shiftCode) handoverFilter.shiftCode = shiftCode;
  if (memberUserId) handoverFilter.userId = memberUserId;

  const [
    activeSessionsPage,
    incidentsPage,
    handoversPage,
    alertsPage,
    mediaPage,
    sitesPage,
    usersPage,
  ] = await Promise.all([
    repositories.sessions.listFiltered(sessionFilter, { limit: 500, offset: 0 }),
    repositories.incidents.list(incidentFilter, { limit: 500, offset: 0 }),
    repositories.handovers.list(handoverFilter, { limit: 500, offset: 0 }),
    repositories.alerts.list(undefined, { limit: 500, offset: 0 }),
    getOperationalMedia({ siteId, userId: memberUserId, shiftCode }, { limit: 12, offset: 0 }),
    repositories.sites.list({ limit: 500, offset: 0 }),
    repositories.users.list({ limit: 500, offset: 0 }),
  ]);

  const activePatrols = activeSessionsPage.items;
  const openIncidents = incidentsPage.items.filter((incident) => incident.status !== 'CLOSED');
  const handoversToday = handoversPage.items.filter((handover) => handover.shiftDate === todayJakarta);
  const filteredAlerts = alertsPage.items
    .filter((alert) => (!siteId || alert.siteId === siteId) && (!memberUserId || alert.userId === memberUserId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const rejectedToday = filteredAlerts.filter((alert) => getJakartaDateParts(new Date(alert.createdAt)).dateString === todayJakarta);

  const recentAlerts = await Promise.all(filteredAlerts.slice(0, 10).map(async (alert) => ({
    ...alert,
    patrolLog: await repositories.patrol.findById(alert.patrolLogId) || null,
  })));

  const criticalIncidents = incidentsPage.items
    .filter((incident) => incident.severity === 'TINGGI' || incident.severity === 'KRITIS' || incident.category === 'MENONJOL' || incident.status !== 'CLOSED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const users = usersPage.items
    .filter((user) => user.role === 'ANGGOTA')
    .map(({ passwordHash, ...user }) => user);

  res.json({
    success: true,
    filterState,
    kpis: {
      patroliAktif: activePatrols.length,
      kejadianOpen: openIncidents.length,
      rejectedHariIni: rejectedToday.length,
      serahTerimaHariIni: handoversToday.length,
    },
    panels: {
      activePatrols: activePatrols.slice(0, 8),
      validationAlerts: recentAlerts,
      recentHandovers: handoversToday.slice(0, 8),
      criticalIncidents,
      recentMedia: mediaPage.items,
    },
    options: {
      sites: sitesPage.items,
      users,
      shifts: [
        { code: 'SHIFT_1', name: 'Shift 1 (07:00 - 15:00)' },
        { code: 'SHIFT_2', name: 'Shift 2 (15:00 - 23:00)' },
        { code: 'SHIFT_3', name: 'Shift 3 (23:00 - 07:00)' },
      ],
    },
  });
});

apiRouter.post('/admin/filter-state', authMiddleware, requireMonitoring, async (req: AuthenticatedRequest, res: Response) => {
  const { siteId, shiftCode, memberUserId } = req.body;
  const updated = await repositories.adminState.set(req.user!.id, {
    siteId: siteId === '' ? null : siteId,
    shiftCode: shiftCode === '' ? null : shiftCode,
    memberUserId: memberUserId === '' ? null : memberUserId,
  });
  res.json({ success: true, filterState: updated });
});

apiRouter.post('/admin/filter-state/reset', authMiddleware, requireMonitoring, async (req: AuthenticatedRequest, res: Response) => {
  const updated = await repositories.adminState.set(req.user!.id, {
    siteId: null,
    shiftCode: null,
    memberUserId: null,
  });
  res.json({ success: true, filterState: updated });
});

apiRouter.patch('/admin/validation-alerts/:id', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const action = String(req.body.action || '').toUpperCase();
  if (!['REVIEW', 'CLOSE', 'REOPEN'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Action alert tidak valid.' });
  }
  try {
    const previous = await repositories.alerts.findById(req.params.id);
    if (!previous) return res.status(404).json({ success: false, error: 'Validation alert tidak ditemukan.' });
    const updated = await repositories.alerts.transition(req.params.id, action as 'REVIEW' | 'CLOSE' | 'REOPEN', req.user!.id, String(req.body.closeNote || ''));
    await repositories.audit.append({ actorUserId: req.user!.id, action: `VALIDATION_ALERT_${action}`, entityType: 'validation_alert', entityId: previous.id, oldValue: { status: previous.status }, newValue: { status: updated.status }, reason: updated.closeNote || `Workflow alert ${action}` });
    res.json({ success: true, alert: updated });
  } catch (error: any) {
    const controlled = error instanceof RepositoryError;
    const code = controlled ? error.code : 'DATABASE_OPERATION_FAILED';
    console.error('[alert] Workflow failed:', error instanceof Error ? error.message : 'unknown');
    res.status(controlled ? error.status : 500).json({ success: false, code, error: controlled ? error.message : 'Workflow alert gagal diproses karena gangguan database.' });
  }
});

// Admin User Management
apiRouter.get('/admin/users', authMiddleware, requireMonitoring, async (_req: Request, res: Response) => {
  const page = await repositories.users.list({ limit: 500, offset: 0 });
  const users = page.items.map(({ passwordHash, ...user }) => user);
  res.json({ success: true, users });
});

apiRouter.get('/admin/masters', authMiddleware, requireMonitoring, async (_req: Request, res: Response) => {
  const [customersPage, sitesPage, usersPage, checkpointsPage, activeSessionsPage] = await Promise.all([
    repositories.customers.list({ limit: 500, offset: 0 }),
    repositories.sites.list({ limit: 500, offset: 0 }),
    repositories.users.list({ limit: 500, offset: 0 }),
    repositories.checkpoints.list({ limit: 500, offset: 0 }),
    repositories.sessions.listFiltered({ status: 'ACTIVE' }, { limit: 500, offset: 0 }),
  ]);
  const customersById = new Map(customersPage.items.map((customer) => [customer.id, customer]));
  const activeCountBySite = new Map<string, number>();
  for (const session of activeSessionsPage.items) {
    activeCountBySite.set(session.siteId, (activeCountBySite.get(session.siteId) || 0) + 1);
  }
  const sites = sitesPage.items.map((site) => ({
    ...site,
    customer: customersById.get(site.customerId) || null,
    activeCount: activeCountBySite.get(site.id) || 0,
  }));
  const personnel = usersPage.items
    .filter((user) => user.role === 'ANGGOTA')
    .map(({ passwordHash, ...user }) => user);

  res.json({
    success: true,
    customers: customersPage.items,
    sites,
    personnel,
    checkpoints: checkpointsPage.items,
  });
});

apiRouter.post('/admin/customers', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!code || !name) return res.status(400).json({ success: false, error: 'Kode dan nama Customer wajib diisi.' });

  const existing = await repositories.customers.list({ limit: 500, offset: 0 });
  if (existing.items.some((item) => item.code === code)) {
    return res.status(409).json({ success: false, error: 'Kode Customer sudah digunakan.' });
  }

  const now = new Date().toISOString();
  try {
    const customer = await repositories.customers.create({
      id: `CUST-${code}`,
      code,
      name,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'CUSTOMER_CREATE',
      entityType: 'customer',
      entityId: customer.id,
      newValue: customer,
      reason: `Tambah customer ${name}`,
    });
    res.status(201).json({ success: true, customer });
  } catch (error:any) {
    if (error instanceof RepositoryError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    throw error;
  }
});

apiRouter.patch('/admin/customers/:id', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customer = await repositories.customers.findById(req.params.id);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer tidak ditemukan.' });

  const updates: Partial<typeof customer> = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.status === 'ACTIVE' || req.body.status === 'INACTIVE') updates.status = req.body.status;

  const updated = await repositories.customers.update(customer.id, updates);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'CUSTOMER_UPDATE',
    entityType: 'customer',
    entityId: customer.id,
    oldValue: customer,
    newValue: updates,
    reason: `Perubahan customer ${customer.code}`,
  });
  res.json({ success: true, customer: updated });
});

apiRouter.post('/admin/sites', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  const customerId = String(req.body.customerId || '');
  const personnelCapacity = Number(req.body.personnelCapacity);
  const customer = await repositories.customers.findById(customerId);

  if (!code || !name || !customer || !Number.isInteger(personnelCapacity) || personnelCapacity < 1) {
    return res.status(400).json({ success: false, error: 'Customer, kode, nama, dan capacity minimal 1 wajib valid.' });
  }
  if (await repositories.sites.findById(code)) return res.status(409).json({ success: false, error: 'Kode Site sudah digunakan.' });

  const now = new Date().toISOString();
  const targetRoundsPerShift = Math.max(1, Number(req.body.targetRoundsPerShift) || 1);
  try {
    const site = await repositories.sites.create({
      id: code,
      code,
      name,
      customerId,
      personnelCapacity,
      targetRoundsPerShift,
      timezone: 'Asia/Jakarta',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'SITE_CREATE',
      entityType: 'site',
      entityId: site.id,
      newValue: site,
      reason: `Tambah site ${name}`,
    });
    res.status(201).json({ success: true, site });
  } catch (error:any) {
    if (error instanceof RepositoryError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    throw error;
  }
});

apiRouter.patch('/admin/sites/:id', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const site = await repositories.sites.findById(req.params.id);
  if (!site) return res.status(404).json({ success: false, error: 'Site tidak ditemukan.' });

  const updates: Partial<typeof site> = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.status === 'ACTIVE' || req.body.status === 'INACTIVE') updates.status = req.body.status;

  if (req.body.personnelCapacity !== undefined) {
    const capacity = Number(req.body.personnelCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) return res.status(400).json({ success: false, error: 'Personnel capacity minimal 1.' });
    const activeCount = await repositories.sessions.countActiveBySite(site.id);
    if (capacity < activeCount) return res.status(409).json({ success: false, error: 'Capacity tidak boleh lebih kecil dari jumlah session aktif.' });
    updates.personnelCapacity = capacity;
  }

  if (req.body.targetRoundsPerShift !== undefined) {
    const targetRounds = Number(req.body.targetRoundsPerShift);
    if (!Number.isInteger(targetRounds) || targetRounds < 1 || targetRounds > 20) {
      return res.status(400).json({ success: false, error: 'Target ronde harus bilangan 1 sampai 20.' });
    }
    updates.targetRoundsPerShift = targetRounds;
  }

  const updated = await repositories.sites.update(site.id, updates);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'SITE_UPDATE',
    entityType: 'site',
    entityId: site.id,
    oldValue: site,
    newValue: updates,
    reason: `Perubahan site ${site.code || site.id}`,
  });
  res.json({ success: true, site: updated });
});

apiRouter.post('/admin/users', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, npk, email, role, siteId, position } = req.body;
  if (!name || !npk) return res.status(400).json({ success: false, error: 'Nama dan NPK wajib diisi.' });

  const cleanNpk = String(npk).trim();
  if (await repositories.users.findByNpk(cleanNpk)) return res.status(400).json({ success: false, error: 'NPK sudah terdaftar.' });

  const now = new Date().toISOString();
  const allowedRoles: Role[] = ['ANGGOTA', 'ADMIN', 'CHIEF', 'SUPER_ADMIN'];
  const selectedRole: Role = allowedRoles.includes(role) ? role : 'ANGGOTA';
  const selectedSite = selectedRole === 'SUPER_ADMIN' ? null : await repositories.sites.findById(siteId || '');
  if (selectedRole !== 'SUPER_ADMIN' && !selectedSite) {
    return res.status(400).json({ success: false, error: 'Site penugasan wajib valid.' });
  }

  const newUser: User = {
    id: `USR-${siteId || 'GEN'}-${Date.now().toString().slice(-6)}`,
    name: String(name).trim(),
    npk: cleanNpk,
    email: email ? String(email).trim() : `${cleanNpk}@sigap.local`,
    role: selectedRole,
    customerId: selectedSite?.customerId || null,
    siteId: selectedSite?.id || null,
    position: String(position || (selectedRole === 'ANGGOTA' ? 'ANGGOTA SECURITY' : selectedRole.replace('_', ' '))),
    assignmentHistory: selectedSite ? [{
      customerId: selectedSite.customerId,
      siteId: selectedSite.id,
      effectiveAt: now,
      changedBy: req.user!.id,
    }] : [],
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync(cleanNpk, 10),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const created = await repositories.users.create(newUser);
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: created.id,
      newValue: { name: created.name, npk: created.npk, role: created.role, siteId: created.siteId },
      reason: `Tambah pengguna baru ${created.name}`,
    });
    const { passwordHash, ...safeUser } = created;
    res.json({ success: true, user: safeUser });
  } catch (error:any) {
    if (error instanceof RepositoryError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    throw error;
  }
});

apiRouter.patch('/admin/users/:id', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, role, siteId, status, position } = req.body;
  const user = await repositories.users.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });

  const oldValues = { name: user.name, role: user.role, siteId: user.siteId, status: user.status };
  const updates: Partial<User> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (email !== undefined) updates.email = String(email).trim();
  if (role !== undefined) updates.role = role;
  if (position !== undefined) updates.position = String(position).trim();
  if (status !== undefined) updates.status = status;

  let assignment;
  const requestedRole = (role || user.role) as Role;
  if (requestedRole === 'SUPER_ADMIN') {
    if (user.siteId !== null || user.customerId !== null) {
      assignment = { customerId: null, siteId: null, effectiveAt: new Date().toISOString(), changedBy: req.user!.id };
    }
  } else if (siteId !== undefined && siteId !== user.siteId) {
    const selectedSite = siteId ? await repositories.sites.findById(siteId) : undefined;
    if (!selectedSite) return res.status(400).json({ success: false, error: 'Site penugasan tidak valid.' });
    assignment = {
      customerId: selectedSite.customerId,
      siteId: selectedSite.id,
      effectiveAt: new Date().toISOString(),
      changedBy: req.user!.id,
    };
  } else if (!user.siteId) {
    return res.status(400).json({ success: false, error: 'Site penugasan wajib valid untuk role ini.' });
  }

  const updated = await repositories.users.update(user.id, updates, assignment);
  if (!updated) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });

  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'USER_UPDATE',
    entityType: 'user',
    entityId: user.id,
    oldValue: oldValues,
    newValue: { ...updates, ...(assignment ? { customerId: assignment.customerId, siteId: assignment.siteId } : {}) },
    reason: `Perubahan data pengguna ${user.name}`,
  });

  const { passwordHash, ...safeUser } = updated;
  res.json({ success: true, user: safeUser });
});

// Admin Checkpoint Management
apiRouter.get('/admin/checkpoints', authMiddleware, async (_req: Request, res: Response) => {
  const page = await repositories.checkpoints.list({ limit: 500, offset: 0 });
  res.json({ success: true, checkpoints: page.items });
});

apiRouter.post('/admin/checkpoints', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { siteId, code, name, latitude, longitude, radiusMeters, coordinateMethod, accuracy, capturedAt } = req.body;
  if (!code || !name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, error: 'Semua data checkpoint wajib diisi.' });
  }

  const checkpointSite = await repositories.sites.findById(siteId || '');
  if (!checkpointSite) return res.status(400).json({ success: false, error: 'Checkpoint wajib terhubung ke Site yang valid.' });

  const normalizedCode = String(code).trim().toUpperCase();
  const checkpointId = `${checkpointSite.id}-${normalizedCode}`;
  if (await repositories.checkpoints.findById(checkpointId)) {
    return res.status(409).json({ success: false, error: 'Kode checkpoint sudah digunakan pada site ini.' });
  }

  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  if (!Number.isFinite(numericLatitude) || numericLatitude < -90 || numericLatitude > 90 || !Number.isFinite(numericLongitude) || numericLongitude < -180 || numericLongitude > 180) {
    return res.status(400).json({ success: false, error: 'Latitude atau Longitude tidak valid.' });
  }
  if (coordinateMethod === 'GPS' && (!Number.isFinite(Number(accuracy)) || Number(accuracy) > 25 || !capturedAt)) {
    return res.status(400).json({ success: false, error: 'Akurasi GPS rendah atau data capture belum lengkap. Ambil GPS kembali.' });
  }

  const now = new Date().toISOString();
  try {
    const checkpoint = await repositories.checkpoints.create({
      id: checkpointId,
      siteId: checkpointSite.id,
      code: normalizedCode,
      name: String(name).trim(),
      latitude: numericLatitude,
      longitude: numericLongitude,
      radiusMeters: Number(radiusMeters) || 15,
      coordinateMethod: coordinateMethod === 'GPS' ? 'GPS' : 'MANUAL',
      gpsAccuracyM: coordinateMethod === 'GPS' && accuracy !== null ? Number(accuracy) : null,
      gpsCapturedAt: coordinateMethod === 'GPS' ? capturedAt || now : null,
      qrToken: '',
      status: 'ACTIVE',
      qrStatus: 'INACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'CHECKPOINT_CREATE',
      entityType: 'checkpoint',
      entityId: checkpoint.id,
      newValue: checkpoint,
      reason: `Tambah checkpoint baru ${checkpoint.code}`,
    });
    res.json({ success: true, checkpoint });
  } catch (error:any) {
    if (error instanceof RepositoryError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    throw error;
  }
});

apiRouter.post('/admin/checkpoints/:id/generate-token', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const checkpoint = await repositories.checkpoints.findById(req.params.id);
  if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  if (!Number.isFinite(checkpoint.latitude) || !Number.isFinite(checkpoint.longitude) || !Number.isFinite(checkpoint.radiusMeters) || checkpoint.radiusMeters < 1) {
    return res.status(409).json({ success: false, error: 'Lengkapi koordinat dan radius checkpoint sebelum generate token.' });
  }

  const token = `CP-${checkpoint.siteId}-${checkpoint.code.replace(/\D/g, '').padStart(3, '0')}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const updated = await repositories.checkpoints.replaceToken(checkpoint.id, token, req.user!.id, false);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'CHECKPOINT_TOKEN_GENERATE',
    entityType: 'checkpoint',
    entityId: checkpoint.id,
    newValue: { tokenGenerated: true, qrStatus: 'INACTIVE' },
    reason: `Generate secure token ${checkpoint.code}`,
  });
  res.json({ success: true, checkpoint: updated, token });
});

apiRouter.post('/admin/checkpoints/:id/generate-qr', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const checkpoint = await repositories.checkpoints.findById(req.params.id);
  if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  if (!Number.isFinite(checkpoint.latitude) || !Number.isFinite(checkpoint.longitude) || !Number.isFinite(checkpoint.radiusMeters) || checkpoint.radiusMeters < 1) {
    return res.status(409).json({ success: false, error: 'Koordinat dan radius checkpoint belum valid.' });
  }

  const token = `CP-${checkpoint.siteId}-${checkpoint.code.replace(/\D/g, '').padStart(3, '0')}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const updated = await repositories.checkpoints.replaceToken(checkpoint.id, token, req.user!.id, true);
  const qrPayload = JSON.stringify({ checkpointId: checkpoint.id, token });
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'CHECKPOINT_QR_GENERATE',
    entityType: 'checkpoint',
    entityId: checkpoint.id,
    newValue: { qrGenerated: true, qrStatus: 'ACTIVE' },
    reason: `Generate QR ${checkpoint.code}`,
  });
  res.json({ success: true, checkpoint: updated, qrPayload });
});

apiRouter.patch('/admin/checkpoints/:id', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const checkpoint = await repositories.checkpoints.findById(req.params.id);
  if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });

  const { name, latitude, longitude, radiusMeters, status, qrStatus } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (latitude !== undefined) updates.latitude = Number(latitude);
  if (longitude !== undefined) updates.longitude = Number(longitude);
  if (radiusMeters !== undefined) updates.radiusMeters = Number(radiusMeters);
  if (status !== undefined) updates.status = status;
  if (qrStatus !== undefined) updates.qrStatus = qrStatus;

  const updated = await repositories.checkpoints.update(checkpoint.id, updates);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'CHECKPOINT_UPDATE',
    entityType: 'checkpoint',
    entityId: checkpoint.id,
    oldValue: checkpoint,
    newValue: updates,
    reason: `Perubahan parameter checkpoint ${checkpoint.code}`,
  });
  res.json({ success: true, checkpoint: updated });
});

apiRouter.post('/admin/checkpoints/:id/regenerate-qr', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const checkpoint = await repositories.checkpoints.findById(req.params.id);
  if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });

  const newToken = `${checkpoint.siteId}-${Math.random().toString(36).substring(2, 14).toUpperCase()}`;
  await repositories.checkpoints.replaceToken(checkpoint.id, newToken, req.user!.id, true);
  await repositories.audit.append({
    actorUserId: req.user!.id,
    action: 'QR_REGENERATE',
    entityType: 'checkpoint',
    entityId: checkpoint.id,
    oldValue: { qrStatus: checkpoint.qrStatus },
    newValue: { qrStatus: 'ACTIVE', tokenRegenerated: true },
    reason: `Regenerasi QR token untuk ${checkpoint.code} (${checkpoint.name})`,
  });
  res.json({ success: true, message: `QR Token baru untuk ${checkpoint.code} berhasil dibuat.`, newToken });
});

// Admin Radius Calibration
apiRouter.get('/admin/radius-calibrations', authMiddleware, async (_req: Request, res: Response) => {
  const page = await repositories.radiusCalibrations.list({ limit: 500, offset: 0 });
  res.json({ success: true, calibrations: page.items });
});

apiRouter.post('/admin/radius-calibrations', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { checkpointId, latitude, longitude, gpsAccuracyM, calculatedDistanceM, verdict, notes } = req.body;
  const checkpoint = await repositories.checkpoints.findById(checkpointId);
  if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });

  const now = new Date().toISOString();
  const calibration = await repositories.radiusCalibrations.create({
    id: `CAL-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    siteId: checkpoint.siteId,
    checkpointId: checkpoint.id,
    testedByUserId: req.user!.id,
    testedAt: now,
    latitude: Number(latitude),
    longitude: Number(longitude),
    gpsAccuracyM: gpsAccuracyM ? Number(gpsAccuracyM) : null,
    calculatedDistanceM: Number(calculatedDistanceM),
    configuredRadiusM: checkpoint.radiusMeters,
    verdict: verdict || 'VALID',
    deviceModel: req.headers['user-agent'] || 'Field Unit',
    notes: notes || 'Uji kalibrasi lapangan',
    createdAt: now,
  });
  res.json({ success: true, calibration });
});

// Admin Audit Logs
apiRouter.get('/admin/audit-logs', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const page = await repositories.audit.list({ limit: 100, offset: 0 });
  res.json({ success: true, logs: page.items });
});

// Admin Override Validation
apiRouter.post('/admin/override-validation', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { logId, newStatus, reason } = req.body;
  if (!logId || !newStatus || !reason) {
    return res.status(400).json({ success: false, error: 'Log ID, Status Baru, dan Alasan Koreksi wajib diisi.' });
  }
  if (!['VALID', 'REVIEW', 'REJECTED'].includes(String(newStatus))) {
    return res.status(400).json({ success: false, error: 'Status validasi tidak valid.' });
  }

  const previous = await repositories.patrol.findById(logId);
  if (!previous) return res.status(404).json({ success: false, error: 'Patrol Log tidak ditemukan.' });

  try {
    const updated = await repositories.patrol.overrideValidation(logId, newStatus, String(reason));
    await repositories.audit.append({
      actorUserId: req.user!.id,
      action: 'VALIDATION_OVERRIDE',
      entityType: 'patrol_log',
      entityId: logId,
      oldValue: { validationStatus: previous.validationStatus },
      newValue: { validationStatus: newStatus },
      reason: String(reason),
    });
    res.json({ success: true, log: updated });
  } catch (error:any) {
    if (error instanceof RepositoryError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    throw error;
  }
});

// -------------------------------------------------------------
// BATCH OFFLINE QUEUE SYNC
// -------------------------------------------------------------

apiRouter.post('/sync', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'Payload sync harus berupa array items.' });
  }

  const results: any[] = [];

  for (const item of items) {
    try {
      if (item.type === 'PATROL_SCAN') {
        const result = await validateAndProcessScan({
          sessionId: item.sessionId,
          qrToken: item.qrToken,
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          gpsAccuracyM: item.gpsAccuracyM,
          photoUrl: item.photoUrl,
          observationStatus: item.observationStatus,
          notes: item.notes,
          clientCapturedAt: item.clientCapturedAt,
          syncSource: 'OFFLINE_QUEUE',
          idempotencyId: item.idempotencyId,
          userId: req.user!.id,
        });
        results.push({
          idempotencyId: item.idempotencyId,
          status: 'SYNCED',
          resultStatus: result.status,
          message: result.rejectionMessage || 'Sinkronisasi berhasil',
        });
      } else {
        results.push({
          idempotencyId: item.idempotencyId,
          status: 'SKIPPED',
          message: 'Tipe item tidak dikenali',
        });
      }
    } catch (err: any) {
      results.push({
        idempotencyId: item.idempotencyId,
        status: 'SYNC_FAILED',
        error: err.message || 'Gagal memproses item',
      });
    }
  }

  res.json({ success: true, processed: results.length, results });
});

// -------------------------------------------------------------
// HEALTH CHECK
// -------------------------------------------------------------

apiRouter.get('/health', async (_req: Request, res: Response) => {
  const { dateString, timeString } = getJakartaDateParts();
  const shift = resolveShift();
  const repositoryHealth = await repositories.health();
  const connected = repositoryHealth.database === 'connected';

  let databaseDetails:any = { status: repositoryHealth.database.toUpperCase() };
  if (connected) {
    try {
      const [users, sites, checkpoints, sessions, patrolLogsCount] = await Promise.all([
        repositories.users.list({ limit: 1, offset: 0 }),
        repositories.sites.list({ limit: 1, offset: 0 }),
        repositories.checkpoints.list({ limit: 1, offset: 0 }),
        repositories.sessions.list({ limit: 1, offset: 0 }),
        repositories.patrol.countAll(),
      ]);
      databaseDetails = {
        ...databaseDetails,
        usersCount: users.total,
        sitesCount: sites.total,
        checkpointsCount: checkpoints.total,
        patrolSessionsCount: sessions.total,
        patrolLogsCount,
      };
    } catch (error) {
      console.error('[health] Count query failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    provider: repositoryHealth.provider,
    database: repositoryHealth.database,
    service: 'OPS SIGAP Security Operations System',
    timestamp: new Date().toISOString(),
    serverTimeJakarta: `${dateString} ${timeString} WIB`,
    activeShift: shift,
    databaseDetails,
  });
});