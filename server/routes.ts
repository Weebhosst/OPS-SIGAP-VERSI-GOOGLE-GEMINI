/**
 * OPS SIGAP — Express API Router
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { validateAndProcessScan, getMemberShiftProgress } from './patrolService';
import { getOperationalMedia } from './mediaService';
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

apiRouter.post('/auth/reset-password-npk', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID wajib diisi.' });
  }

  const targetUser = db.findUserById(userId);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  }

  const newHash = bcrypt.hashSync(targetUser.npk, 10);
  db.updateUser(targetUser.id, {
    passwordHash: newHash,
    mustChangePassword: false,
    passwordChangedAt: new Date().toISOString(),
  });

  db.addAuditLog({
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

apiRouter.get('/patrol/shift-progress', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const siteId = req.user!.siteId || 'BB92';
  const progress = getMemberShiftProgress(req.user!.id, siteId);
  res.json({ success: true, ...progress });
});

apiRouter.get('/patrol/current', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const siteId = req.user!.siteId || 'BB92';
  const openSession = db.getOpenSessionForUser(req.user!.id, siteId);
  const checkpoints = db.getCheckpoints(siteId);

  if (!openSession) {
    return res.json({
      success: true,
      hasOpenSession: false,
      session: null,
      checkpoints: checkpoints.map((c) => ({
        ...c,
        statusInRound: 'BELUM',
        lastScanLog: null,
      })),
    });
  }

  const logs = db.getPatrolLogs(openSession.id);
  const targetRounds = Math.max(1, db.findSiteById(siteId)?.targetRoundsPerShift || 1);
  const currentRound = Math.min(targetRounds, Math.floor(openSession.totalValid / Math.max(1, checkpoints.length)) + 1);

  const enrichedCheckpoints = checkpoints.map((cp) => {
    const validLog = logs.find((l) => l.checkpointId === cp.id && l.validationStatus === 'VALID' && (l.roundNumber || 1) === currentRound);
    const latestLog = logs
      .filter((l) => l.checkpointId === cp.id && (l.roundNumber || 1) === currentRound)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    let statusInRound: 'BELUM' | 'VALID' | 'REVIEW' | 'REJECTED' = 'BELUM';
    if (validLog) {
      statusInRound = 'VALID';
    } else if (latestLog) {
      statusInRound = latestLog.validationStatus;
    }

    return {
      ...cp,
      statusInRound,
      lastScanLog: validLog || latestLog || null,
    };
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
      const validIds = new Set(logs.filter((log) => log.validationStatus === 'VALID' && (log.roundNumber || 1) === roundNumber).map((log) => log.checkpointId));
      return { roundNumber, completed: validIds.size, required: checkpoints.length, checkpointIds: [...validIds] };
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

apiRouter.post('/patrol/session/:id/start-documentation', authMiddleware, requireFieldMember, (req: AuthenticatedRequest, res: Response) => {
  const photoUrl = String(req.body.photoUrl || '').trim();
  if (!photoUrl) return res.status(400).json({ success: false, error: 'Foto Sertigas Naik Jaga wajib diambil.' });
  const session = db.findSessionById(req.params.id);
  if (!session || session.userId !== req.user!.id) return res.status(404).json({ success: false, error: 'Active session milik Anda tidak ditemukan.' });
  if (session.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Session sudah tidak aktif.' });
  if (session.startDocumentationCompleted) return res.status(409).json({ success: false, error: 'Sertigas Naik Jaga sudah tersimpan.' });
  const now = new Date().toISOString();
  const handoverId = `HND-NAIK-${Date.now()}`;
  const handover: ShiftHandover = {
    id: handoverId, sessionId: session.id, siteId: session.siteId, shiftDate: session.shiftDate,
    shiftCode: session.shiftCode, handoverType: 'NAIK_JAGA', fromUserId: req.user!.id, toUserId: null,
    eventAt: now, photoUrl, photoUrls: [photoUrl], conditionStatus: 'BAIK', personnelStatus: 'Petugas memulai shift',
    equipmentStatus: 'Dicatat saat naik jaga', keysStatus: 'Dicatat saat naik jaga', vehicleStatus: 'Dicatat saat naik jaga',
    outstandingIssues: '', handoverNotes: 'Sertigas Naik Jaga', ackFrom: true, ackTo: false, status: 'SUBMITTED',
    createdBy: req.user!.id, createdAt: now, updatedAt: now,
  };
  db.addHandover(handover);
  db.addMedia({ id: `MED-${handoverId}`, sourceModule: 'HANDOVER', sourceTable: 'shift_handovers', sourceId: handoverId, siteId: session.siteId, userId: req.user!.id, shiftDate: session.shiftDate, shiftCode: session.shiftCode, category: 'SERTIGAS NAIK JAGA', subcategory: 'NAIK_JAGA', photoUrl, caption: `Sertigas Naik Jaga • ${req.user!.name}`, eventAt: now, handoverId, status: 'ACTIVE', createdAt: now, createdBy: req.user!.id });
  const updated = db.updatePatrolSession(session.id, { startDocumentationCompleted: true, startDocumentationAt: now });
  db.addAuditLog({ actorUserId: req.user!.id, action: 'SERTIGAS_NAIK_JAGA', entityType: 'patrol_session', entityId: session.id, newValue: { photoRequired: true, documentedAt: now }, reason: 'Dokumentasi wajib sebelum patroli' });
  res.json({ success: true, session: updated, handover });
});

apiRouter.post('/patrol/session/:id/close', authMiddleware, requireFieldMember, (req: AuthenticatedRequest, res: Response) => {
  const session = db.findSessionById(req.params.id);
  if (!session || session.userId !== req.user!.id) return res.status(404).json({ success: false, error: 'Active session milik Anda tidak ditemukan.' });
  if (session.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Session sudah tidak aktif.' });
  const activeCheckpoints = db.getCheckpoints(session.siteId).filter((checkpoint) => checkpoint.status === 'ACTIVE');
  const targetRounds = Math.max(1, db.findSiteById(session.siteId)?.targetRoundsPerShift || 1);
  const validLogs = db.getPatrolLogs(session.id).filter((log) => log.validationStatus === 'VALID');
  const missing = Array.from({ length: targetRounds }, (_, index) => index + 1).flatMap((roundNumber) => activeCheckpoints.filter((checkpoint) => !validLogs.some((log) => log.checkpointId === checkpoint.id && (log.roundNumber || 1) === roundNumber)).map((checkpoint) => ({ id: checkpoint.id, code: checkpoint.code, name: checkpoint.name, roundNumber })));
  if (session.totalValid < session.totalRequired || missing.length) return res.status(409).json({ success: false, code: 'CHECKPOINT_INCOMPLETE', error: `Patroli belum selesai. Checkpoint ${session.totalValid}/${session.totalRequired}. Belum selesai: ${missing.map((checkpoint) => `${checkpoint.code} ${checkpoint.name}`).join(', ')}.`, progress: { completed: session.totalValid, target: session.totalRequired }, missingCheckpoints: missing });
  const endPhotoUrl = String(req.body.endPhotoUrl || '').trim();
  if (!endPhotoUrl) return res.status(400).json({ success: false, error: 'Foto Sertigas / Turun Jaga wajib diambil.' });
  const hasSpecialHandover = req.body.hasSpecialHandover === true;
  const specialNotes = String(req.body.specialNotes || '').trim();
  const specialPhotoUrls = Array.isArray(req.body.specialPhotoUrls) ? req.body.specialPhotoUrls.filter((item: unknown) => typeof item === 'string' && item) : [];
  if (hasSpecialHandover && (!specialNotes || specialPhotoUrls.length < 3 || specialPhotoUrls.length > 5)) return res.status(400).json({ success: false, error: !specialNotes ? 'Catatan TARUNA wajib diisi.' : 'Dokumentasi TARUNA minimal 3 dan maksimal 5 foto.' });
  const now = new Date().toISOString();
  if (hasSpecialHandover) {
    const specialId = `HND-TARUNA-${Date.now()}`;
    db.addHandover({ id: specialId, sessionId: session.id, siteId: session.siteId, shiftDate: session.shiftDate, shiftCode: session.shiftCode, handoverType: 'SERAH_TERIMA', fromUserId: req.user!.id, eventAt: now, photoUrl: specialPhotoUrls[0], photoUrls: specialPhotoUrls, conditionStatus: 'PERLU_PERHATIAN', personnelStatus: 'TARUNA / serah terima khusus', equipmentStatus: '-', keysStatus: '-', vehicleStatus: '-', outstandingIssues: specialNotes, handoverNotes: specialNotes, isTaruna: true, ackFrom: true, ackTo: false, status: 'SUBMITTED', createdBy: req.user!.id, createdAt: now, updatedAt: now });
    specialPhotoUrls.forEach((photoUrl: string, index: number) => db.addMedia({ id: `MED-${specialId}-${index + 1}`, sourceModule: 'HANDOVER', sourceTable: 'shift_handovers', sourceId: `${specialId}-${index + 1}`, siteId: session.siteId, userId: req.user!.id, shiftDate: session.shiftDate, shiftCode: session.shiftCode, category: 'TARUNA', subcategory: 'SERAH_TERIMA_KHUSUS', photoUrl, caption: `TARUNA • ${specialNotes}`, eventAt: now, handoverId: specialId, status: 'ACTIVE', createdAt: now, createdBy: req.user!.id }));
  }
  const endId = `HND-TURUN-${Date.now()}`;
  db.addHandover({ id: endId, sessionId: session.id, siteId: session.siteId, shiftDate: session.shiftDate, shiftCode: session.shiftCode, handoverType: 'TURUN_JAGA', fromUserId: req.user!.id, eventAt: now, photoUrl: endPhotoUrl, photoUrls: [endPhotoUrl], conditionStatus: 'BAIK', personnelStatus: 'Petugas mengakhiri shift', equipmentStatus: 'Diserahterimakan', keysStatus: 'Diserahterimakan', vehicleStatus: 'Diserahterimakan', outstandingIssues: '', handoverNotes: 'Sertigas Turun Jaga', ackFrom: true, ackTo: false, status: 'SUBMITTED', createdBy: req.user!.id, createdAt: now, updatedAt: now });
  db.addMedia({ id: `MED-${endId}`, sourceModule: 'HANDOVER', sourceTable: 'shift_handovers', sourceId: endId, siteId: session.siteId, userId: req.user!.id, shiftDate: session.shiftDate, shiftCode: session.shiftCode, category: 'SERTIGAS TURUN JAGA', subcategory: 'TURUN_JAGA', photoUrl: endPhotoUrl, caption: `Sertigas Turun Jaga • ${req.user!.name}`, eventAt: now, handoverId: endId, status: 'ACTIVE', createdAt: now, createdBy: req.user!.id });
  const updated = db.updatePatrolSession(session.id, { status: 'COMPLETED', endedAt: now, endDocumentationCompleted: true, endDocumentationAt: now });
  db.addAuditLog({ actorUserId: req.user!.id, action: 'SHIFT_SESSION_COMPLETED', entityType: 'patrol_session', entityId: session.id, oldValue: { status: 'ACTIVE' }, newValue: { status: 'COMPLETED', checkpoint: `${session.totalValid}/${session.totalRequired}`, endDocumentationAt: now }, reason: 'Normal close setelah checkpoint dan Turun Jaga lengkap' });
  res.json({ success: true, session: updated });
});

apiRouter.post('/patrol/scan', authMiddleware, requireFieldMember, (req: AuthenticatedRequest, res: Response) => {
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

  const result = validateAndProcessScan({
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

apiRouter.get('/patrol/sessions', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isSuperAdmin = isAdministrator(req.user!.role);
  const filter: any = {};

  if (!isSuperAdmin) {
    filter.userId = req.user!.id;
    filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
    if (req.query.userId) filter.userId = String(req.query.userId);
  }

  const sessions = db.getPatrolSessions(filter).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  res.json({ success: true, sessions });
});

// -------------------------------------------------------------
// HANDOVER ROUTES
// -------------------------------------------------------------

apiRouter.get('/handover', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isSuperAdmin = isAdministrator(req.user!.role);
  const filter: any = {};

  if (!isSuperAdmin) {
    filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
  }

  const handovers = db.getHandovers(filter).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ success: true, handovers });
});

apiRouter.post('/handover', authMiddleware, requireFieldMember, (req: AuthenticatedRequest, res: Response) => {
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
  const activeSession = db.getActiveSessionForUser(req.user!.id);
  if (!activeSession || activeSession.siteId !== siteId || !activeSession.startDocumentationCompleted) return res.status(409).json({ success: false, error: 'Serah terima barang hanya dapat dibuat saat shift aktif.' });
  if (handoverType && handoverType !== 'SERAH_TERIMA') return res.status(400).json({ success: false, error: 'Naik/Turun Jaga hanya dapat dibuat melalui alur Start/Close Shift.' });
  const evidencePhotos = Array.isArray(photoUrls) ? photoUrls.filter((item: unknown) => typeof item === 'string' && item) : (photoUrl ? [photoUrl] : []);
  if (!itemName || !itemQuantity || !itemCondition || !handedFrom || !handedTo) return res.status(400).json({ success: false, error: 'Nama barang, jumlah, kondisi, pihak penyerah, dan penerima wajib diisi.' });
  if (!isTaruna && evidencePhotos.length < 1) return res.status(400).json({ success: false, error: 'Dokumentasi Serah Terima Barang wajib diisi.' });
  if (isTaruna && (!String(handoverNotes || '').trim() || evidencePhotos.length < 3 || evidencePhotos.length > 5)) return res.status(400).json({ success: false, error: 'TARUNA membutuhkan catatan dan dokumentasi minimal 3, maksimal 5 foto.' });
  const now = new Date().toISOString();

  const id = `HND-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

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
    photoUrl: evidencePhotos[0] || null,
    photoUrls: evidencePhotos,
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

  db.addHandover(handover);

  evidencePhotos.forEach((evidencePhoto: string, index: number) => {
    const site = db.getSites().find((s) => s.id === siteId);
    db.addMedia({
      id: `MED-${id}-${index + 1}`,
      sourceModule: 'HANDOVER',
      sourceTable: 'shift_handovers',
      sourceId: `${id}-${index + 1}`,
      siteId,
      userId: req.user!.id,
      shiftDate: activeSession.shiftDate,
      shiftCode: activeSession.shiftCode,
      category: isTaruna ? 'TARUNA' : 'SERAH TERIMA BARANG',
      subcategory: isTaruna ? 'TARUNA' : handover.handoverType,
      photoUrl: evidencePhoto,
      caption: `${isTaruna ? 'TARUNA' : 'Serah Terima Barang'} • ${itemName} • ${site?.name || siteId}`,
      eventAt: handover.eventAt,
      latitude: handover.latitude,
      longitude: handover.longitude,
      handoverId: id,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: req.user!.id,
    });
  });

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'HANDOVER_CREATE',
    entityType: 'shift_handover',
    entityId: id,
    newValue: {
      handoverType: handover.handoverType,
      siteId,
      shiftCode: activeSession.shiftCode,
      conditionStatus: handover.conditionStatus,
    },
    reason: `Input serah terima jaga ${handover.handoverType}`,
  });

  res.json({ success: true, handover });
});

apiRouter.post('/handover/:id/ack', authMiddleware, requireFieldMember, (req: AuthenticatedRequest, res: Response) => {
  const handover = db.findHandoverById(req.params.id);
  if (!handover) {
    return res.status(404).json({ success: false, error: 'Data serah terima tidak ditemukan.' });
  }

  handover.ackTo = true;
  handover.status = 'ACKNOWLEDGED';
  handover.toUserId = req.user!.id;
  db.updateHandover(handover.id, handover);

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'HANDOVER_ACKNOWLEDGE',
    entityType: 'shift_handover',
    entityId: handover.id,
    reason: `Konfirmasi penerimaan serah terima jaga oleh ${req.user!.name}`,
  });

  res.json({ success: true, handover });
});

// -------------------------------------------------------------
// INCIDENT ROUTES
// -------------------------------------------------------------

apiRouter.get('/incidents', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const isSuperAdmin = isAdministrator(req.user!.role);
  const filter: any = {};

  if (!isSuperAdmin) {
    filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
    if (req.query.status) filter.status = String(req.query.status);
  }

  const incidents = db.getIncidents(filter).sort(
    (a, b) => new Date(b.incidentAt).getTime() - new Date(a.incidentAt).getTime()
  );

  res.json({ success: true, incidents });
});

apiRouter.post('/incidents', authMiddleware, requireFieldMember, (req: AuthenticatedRequest, res: Response) => {
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
    return res.status(400).json({
      success: false,
      error: 'Judul, Area Kejadian, kronologi, dan tindakan awal wajib diisi.',
    });
  }

  const siteId = req.user!.siteId || 'BB92';
  const activeSession = db.getActiveSessionForUser(req.user!.id);
  if (!activeSession || activeSession.siteId !== siteId || !activeSession.startDocumentationCompleted) return res.status(409).json({ success: false, error: 'Laporan kejadian hanya dapat dibuat saat shift aktif setelah Sertigas Naik Jaga.' });
  const incidentPhotos = Array.isArray(photoUrls) ? photoUrls.filter((item: unknown) => typeof item === 'string' && item) : (photoUrl ? [photoUrl] : []);
  if (incidentPhotos.length < 3) return res.status(400).json({ success: false, error: 'Dokumentasi kejadian minimal 3 foto.' });
  if (incidentPhotos.length > 5) return res.status(400).json({ success: false, error: 'Maksimal 5 foto dokumentasi.' });
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

  db.addIncident(incident);

  // Register every evidence photo in the gallery.
  incidentPhotos.forEach((incidentPhoto: string, index: number) => {
    db.addMedia({
      id: `MED-${id}-${index + 1}`,
      sourceModule: 'INCIDENT',
      sourceTable: 'incident_reports',
      sourceId: `${id}-${index + 1}`,
      siteId,
      userId: req.user!.id,
      shiftDate: activeSession.shiftDate,
      shiftCode: activeSession.shiftCode,
      category: 'KEJADIAN',
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
    });
  });

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'INCIDENT_REPORTED',
    entityType: 'incident_report',
    entityId: id,
    newValue: {
      title,
      category: incident.category,
      severity: incident.severity,
      escalated: incident.escalated,
    },
    reason: `Laporan kejadian: ${title} (${incident.severity})`,
  });

  res.json({ success: true, incident });
});

apiRouter.patch('/incidents/:id/status', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { status, followUp } = req.body;
  const incident = db.findIncidentById(req.params.id);

  if (!incident) {
    return res.status(404).json({ success: false, error: 'Laporan kejadian tidak ditemukan.' });
  }

  const updates: Partial<IncidentReport> = {};
  if (status) updates.status = status;
  if (followUp) updates.followUp = followUp;
  if (status === 'CLOSED') updates.closedAt = new Date().toISOString();

  const updated = db.updateIncident(incident.id, updates);

  db.addAuditLog({
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

apiRouter.get('/gallery', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const canViewGlobal = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
  const filter: any = {};

  if (!canViewGlobal) {
    filter.siteId = req.user!.siteId;
    if (req.user!.role === 'ANGGOTA') filter.userId = req.user!.id;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
  }

  if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
  if (req.query.customerId) filter.customerId = String(req.query.customerId);
  if (req.query.sessionId) filter.sessionId = String(req.query.sessionId);

  const now = new Date();
  const currentJakarta = getJakartaDateParts(now);
  const month = Math.min(12, Math.max(1, Number(req.query.month) || currentJakarta.month));
  const year = Math.min(2100, Math.max(2020, Number(req.query.year) || currentJakarta.year));
  let startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  let nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const requestedDate = String(req.query.date || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate.startsWith(`${year}-${String(month).padStart(2, '0')}-`)) {
    startDate = requestedDate;
    const [dateYear, dateMonth, dateDay] = requestedDate.split('-').map(Number);
    const following = new Date(Date.UTC(dateYear, dateMonth - 1, dateDay + 1));
    nextMonth = following.toISOString().slice(0, 10);
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 48));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const periodMedia = getOperationalMedia(filter).filter((item) => item.shiftDate >= startDate && item.shiftDate < nextMonth);
  const documentType = String(req.query.documentType || '');
  const matchingMedia = periodMedia.filter((item) => !documentType || item.documentType === documentType || (documentType === 'SERTIGAS' && item.documentType.startsWith('SERTIGAS_'))).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const media = matchingMedia.slice(offset, offset + limit);
  const count = (type: string) => periodMedia.filter((item) => type === 'SEMUA' || item.documentType === type || (type === 'SERTIGAS' && item.documentType.startsWith('SERTIGAS_'))).length;
  const counts = { SEMUA: count('SEMUA'), SERTIGAS: count('SERTIGAS'), PATROLI_QR: count('PATROLI_QR'), SERAH_TERIMA_BARANG: count('SERAH_TERIMA_BARANG'), TARUNA: count('TARUNA'), INSIDEN: count('INSIDEN'), LAINNYA: count('LAINNYA') };

  res.json({ success: true, media, counts, pagination: { total: matchingMedia.length, limit, offset, hasMore: offset + media.length < matchingMedia.length }, period: { startDate, endExclusive: nextMonth } });
});

apiRouter.get('/monitoring/active-sessions', authMiddleware, requireMonitoring, (_req: AuthenticatedRequest, res: Response) => {
  const sites = db.getSites().map((site) => {
    const sessions = db.getActiveSessionsForSite(site.id).map((session) => {
      const user = db.findUserById(session.userId);
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

apiRouter.post('/admin/sessions/:id/force-close', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, error: 'Alasan Force Close wajib diisi.' });
  const session = db.findSessionById(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Shift session tidak ditemukan.' });
  if (session.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Hanya session ACTIVE yang dapat di-force close.' });
  const now = new Date().toISOString();
  const updated = db.updatePatrolSession(session.id, {
    status: 'FORCE_CLOSED',
    endedAt: now,
    forceClosed: true,
    forceCloseBy: req.user!.id,
    forceCloseRole: req.user!.role,
    forceCloseReason: reason,
    forceCloseAt: now,
  });
  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'SHIFT_SESSION_FORCE_CLOSED',
    entityType: 'patrol_session',
    entityId: session.id,
    oldValue: { status: 'ACTIVE', totalValid: session.totalValid, totalRequired: session.totalRequired },
    newValue: { status: 'FORCE_CLOSED', forceCloseReason: reason, forceCloseRole: req.user!.role },
    reason,
  });
  res.json({ success: true, session: updated });
});

// -------------------------------------------------------------
// SUPER ADMIN COMMAND CENTER & MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/admin/command-center', authMiddleware, requireMonitoring, (req: AuthenticatedRequest, res: Response) => {
  const adminId = req.user!.id;
  const filterState = db.getAdminFilterState(adminId) || {
    id: `AFS-${adminId}`,
    userId: adminId,
    siteId: null,
    shiftCode: null,
    memberUserId: null,
    updatedAt: new Date().toISOString(),
  };

  const { dateString: todayJakarta } = getJakartaDateParts();

  // Filter conditions
  const siteId = filterState.siteId || null;
  const shiftCode = filterState.shiftCode || null;
  const memberUserId = filterState.memberUserId || null;

  // 1. Patroli Aktif
  const allSessions = db.getPatrolSessions();
  const activePatrols = allSessions.filter((s) => {
    if (s.status !== 'ACTIVE') return false;
    if (siteId && s.siteId !== siteId) return false;
    if (shiftCode && s.shiftCode !== shiftCode) return false;
    if (memberUserId && s.userId !== memberUserId) return false;
    return true;
  });

  // 2. Kejadian Open (Incidents with status != CLOSED)
  const allIncidents = db.getIncidents();
  const openIncidents = allIncidents.filter((i) => {
    if (i.status === 'CLOSED') return false;
    if (siteId && i.siteId !== siteId) return false;
    if (shiftCode && i.shiftCode !== shiftCode) return false;
    if (memberUserId && i.userId !== memberUserId) return false;
    return true;
  });

  // 3. Rejected Hari Ini (Logs validationStatus == REJECTED today Jakarta time)
  const allLogs = db.getPatrolLogs();
  const rejectedTodayLogs = allLogs.filter((l) => {
    if (l.validationStatus !== 'VALID') {
      // Check date
      const logDate = getJakartaDateParts(new Date(l.createdAt)).dateString;
      if (logDate !== todayJakarta) return false;
      if (siteId && l.siteId !== siteId) return false;
      if (memberUserId && l.userId !== memberUserId) return false;
      return true;
    }
    return false;
  });

  // 4. Serah Terima Hari Ini (Handovers with shiftDate or createdAt == today Jakarta)
  const allHandovers = db.getHandovers();
  const handoversToday = allHandovers.filter((h) => {
    const hDate = h.shiftDate || getJakartaDateParts(new Date(h.createdAt)).dateString;
    if (hDate !== todayJakarta) return false;
    if (siteId && h.siteId !== siteId) return false;
    if (shiftCode && h.shiftCode !== shiftCode) return false;
    if (memberUserId && h.fromUserId !== memberUserId && h.toUserId !== memberUserId) return false;
    return true;
  });

  // KPIs
  const kpis = {
    patroliAktif: activePatrols.length,
    kejadianOpen: openIncidents.length,
    rejectedHariIni: rejectedTodayLogs.length,
    serahTerimaHariIni: handoversToday.length,
  };

  // Recent Validation Alerts (REJECTED and REVIEW)
  const validationAlerts = db.getValidationAlerts()
    .filter((alert) => (!siteId || alert.siteId === siteId) && (!memberUserId || alert.userId === memberUserId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((alert) => ({ ...alert, patrolLog: db.findPatrolLogById(alert.patrolLogId) || null }));

  // Critical Incidents
  const criticalIncidents = allIncidents
    .filter((i) => i.severity === 'TINGGI' || i.severity === 'KRITIS' || i.category === 'MENONJOL' || i.status !== 'CLOSED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  // Recent Media
  const recentMedia = getOperationalMedia({ siteId: siteId || undefined, userId: memberUserId || undefined, shiftCode: shiftCode || undefined }).sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime()).slice(0, 12);

  // Master options for filter dropdowns
  const sites = db.getSites();
  const users = db.getUsers().filter((u) => u.role === 'ANGGOTA');

  res.json({
    success: true,
    filterState,
    kpis,
    panels: {
      activePatrols: activePatrols.slice(0, 8),
      validationAlerts,
      recentHandovers: handoversToday.slice(0, 8),
      criticalIncidents,
      recentMedia,
    },
    options: {
      sites,
      users,
      shifts: [
        { code: 'SHIFT_1', name: 'Shift 1 (07:00 - 15:00)' },
        { code: 'SHIFT_2', name: 'Shift 2 (15:00 - 23:00)' },
        { code: 'SHIFT_3', name: 'Shift 3 (23:00 - 07:00)' },
      ],
    },
  });
});

apiRouter.post('/admin/filter-state', authMiddleware, requireMonitoring, (req: AuthenticatedRequest, res: Response) => {
  const { siteId, shiftCode, memberUserId } = req.body;
  const updated = db.setAdminFilterState(req.user!.id, {
    siteId: siteId === '' ? null : siteId,
    shiftCode: shiftCode === '' ? null : shiftCode,
    memberUserId: memberUserId === '' ? null : memberUserId,
  });
  res.json({ success: true, filterState: updated });
});

apiRouter.post('/admin/filter-state/reset', authMiddleware, requireMonitoring, (req: AuthenticatedRequest, res: Response) => {
  const updated = db.setAdminFilterState(req.user!.id, {
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
apiRouter.get('/admin/users', authMiddleware, requireMonitoring, (_req: Request, res: Response) => {
  const users = db.getUsers().map(({ passwordHash, ...u }) => u);
  res.json({ success: true, users });
});

apiRouter.get('/admin/masters', authMiddleware, requireMonitoring, (_req: Request, res: Response) => {
  const customers = db.getCustomers();
  const sites = db.getSites().map((site) => ({
    ...site,
    customer: db.findCustomerById(site.customerId) || null,
    activeCount: db.getActiveSessionsForSite(site.id).length,
  }));
  const personnel = db.getUsers()
    .filter((user) => user.role === 'ANGGOTA')
    .map(({ passwordHash, ...user }) => user);
  res.json({ success: true, customers, sites, personnel, checkpoints: db.getCheckpoints() });
});

apiRouter.post('/admin/customers', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!code || !name) return res.status(400).json({ success: false, error: 'Kode dan nama Customer wajib diisi.' });
  if (db.getCustomers().some((item) => item.code === code)) return res.status(409).json({ success: false, error: 'Kode Customer sudah digunakan.' });
  const now = new Date().toISOString();
  const customer = db.addCustomer({ id: `CUST-${code}`, code, name, status: 'ACTIVE', createdAt: now, updatedAt: now });
  db.addAuditLog({ actorUserId: req.user!.id, action: 'CUSTOMER_CREATE', entityType: 'customer', entityId: customer.id, newValue: customer, reason: `Tambah customer ${name}` });
  res.status(201).json({ success: true, customer });
});

apiRouter.patch('/admin/customers/:id', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const customer = db.findCustomerById(req.params.id);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer tidak ditemukan.' });
  const updates: any = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.status === 'ACTIVE' || req.body.status === 'INACTIVE') updates.status = req.body.status;
  const updated = db.updateCustomer(customer.id, updates);
  db.addAuditLog({ actorUserId: req.user!.id, action: 'CUSTOMER_UPDATE', entityType: 'customer', entityId: customer.id, oldValue: customer, newValue: updates, reason: `Perubahan customer ${customer.code}` });
  res.json({ success: true, customer: updated });
});

apiRouter.post('/admin/sites', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  const customerId = String(req.body.customerId || '');
  const personnelCapacity = Number(req.body.personnelCapacity);
  if (!code || !name || !db.findCustomerById(customerId) || !Number.isInteger(personnelCapacity) || personnelCapacity < 1) {
    return res.status(400).json({ success: false, error: 'Customer, kode, nama, dan capacity minimal 1 wajib valid.' });
  }
  if (db.findSiteById(code)) return res.status(409).json({ success: false, error: 'Kode Site sudah digunakan.' });
  const now = new Date().toISOString();
  const targetRoundsPerShift = Math.max(1, Number(req.body.targetRoundsPerShift) || 1);
  const site = db.addSite({ id: code, code, name, customerId, personnelCapacity, targetRoundsPerShift, timezone: 'Asia/Jakarta', status: 'ACTIVE', createdAt: now, updatedAt: now });
  db.addAuditLog({ actorUserId: req.user!.id, action: 'SITE_CREATE', entityType: 'site', entityId: site.id, newValue: site, reason: `Tambah site ${name}` });
  res.status(201).json({ success: true, site });
});

apiRouter.patch('/admin/sites/:id', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const site = db.findSiteById(req.params.id);
  if (!site) return res.status(404).json({ success: false, error: 'Site tidak ditemukan.' });
  const updates: any = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.status === 'ACTIVE' || req.body.status === 'INACTIVE') updates.status = req.body.status;
  if (req.body.personnelCapacity !== undefined) {
    const capacity = Number(req.body.personnelCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) return res.status(400).json({ success: false, error: 'Personnel capacity minimal 1.' });
    if (capacity < db.getActiveSessionsForSite(site.id).length) return res.status(409).json({ success: false, error: 'Capacity tidak boleh lebih kecil dari jumlah session aktif.' });
    updates.personnelCapacity = capacity;
  }
  if (req.body.targetRoundsPerShift !== undefined) {
    const targetRounds = Number(req.body.targetRoundsPerShift);
    if (!Number.isInteger(targetRounds) || targetRounds < 1 || targetRounds > 20) return res.status(400).json({ success: false, error: 'Target ronde harus bilangan 1 sampai 20.' });
    updates.targetRoundsPerShift = targetRounds;
  }
  const updated = db.updateSite(site.id, updates);
  db.addAuditLog({ actorUserId: req.user!.id, action: 'SITE_UPDATE', entityType: 'site', entityId: site.id, oldValue: site, newValue: updates, reason: `Perubahan site ${site.code || site.id}` });
  res.json({ success: true, site: updated });
});

apiRouter.post('/admin/users', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, npk, email, role, siteId, position } = req.body;
  if (!name || !npk) {
    return res.status(400).json({ success: false, error: 'Nama dan NPK wajib diisi.' });
  }

  const existing = db.findUserByNpk(String(npk).trim());
  if (existing) {
    return res.status(400).json({ success: false, error: 'NPK sudah terdaftar.' });
  }

  const cleanNpk = String(npk).trim();
  const now = new Date().toISOString();
  const allowedRoles: Role[] = ['ANGGOTA', 'ADMIN', 'CHIEF', 'SUPER_ADMIN'];
  const selectedRole: Role = allowedRoles.includes(role) ? role : 'ANGGOTA';
  const selectedSite = selectedRole === 'SUPER_ADMIN' ? null : db.findSiteById(siteId || '');
  if (selectedRole !== 'SUPER_ADMIN' && !selectedSite) return res.status(400).json({ success: false, error: 'Site penugasan wajib valid.' });
  const newUser: User = {
    id: `USR-${siteId || 'GEN'}-${Date.now().toString().slice(-4)}`,
    name: name.trim(),
    npk: cleanNpk,
    email: email ? email.trim() : `${cleanNpk}@sigap.local`,
    role: selectedRole,
    customerId: selectedSite?.customerId || null,
    siteId: selectedSite?.id || null,
    position: String(position || (selectedRole === 'ANGGOTA' ? 'ANGGOTA SECURITY' : selectedRole.replace('_', ' '))),
    assignmentHistory: [{ customerId: selectedSite?.customerId || null, siteId: selectedSite?.id || null, effectiveAt: now, changedBy: req.user!.id }],
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync(cleanNpk, 10), // default password = NPK
    createdAt: now,
    updatedAt: now,
  };

  db.addUser(newUser);

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'USER_CREATE',
    entityType: 'user',
    entityId: newUser.id,
    newValue: { name: newUser.name, npk: newUser.npk, role: newUser.role, siteId: newUser.siteId },
    reason: `Tambah pengguna baru ${newUser.name}`,
  });

  const { passwordHash, ...safeUser } = newUser;
  res.json({ success: true, user: safeUser });
});

apiRouter.patch('/admin/users/:id', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, email, role, siteId, status, position } = req.body;
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  }

  const oldValues = { name: user.name, role: user.role, siteId: user.siteId, status: user.status };
  const updates: Partial<User> = {};
  if (name !== undefined) updates.name = name.trim();
  if (email !== undefined) updates.email = email.trim();
  if (role !== undefined) updates.role = role;
  if (position !== undefined) updates.position = String(position).trim();
  if (siteId !== undefined && siteId !== user.siteId) {
    const selectedSite = siteId ? db.findSiteById(siteId) : undefined;
    if (siteId && !selectedSite) return res.status(400).json({ success: false, error: 'Site penugasan tidak valid.' });
    updates.siteId = selectedSite?.id || null;
    updates.customerId = selectedSite?.customerId || null;
    updates.assignmentHistory = [...(user.assignmentHistory || []), { customerId: selectedSite?.customerId || null, siteId: selectedSite?.id || null, effectiveAt: new Date().toISOString(), changedBy: req.user!.id }];
  }
  if (status !== undefined) updates.status = status;

  const updated = db.updateUser(user.id, updates);

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'USER_UPDATE',
    entityType: 'user',
    entityId: user.id,
    oldValue: oldValues,
    newValue: updates,
    reason: `Perubahan data pengguna ${user.name}`,
  });

  const { passwordHash, ...safeUser } = updated!;
  res.json({ success: true, user: safeUser });
});

// Admin Checkpoint Management
apiRouter.get('/admin/checkpoints', authMiddleware, (_req: Request, res: Response) => {
  const checkpoints = db.getCheckpoints();
  res.json({ success: true, checkpoints });
});

apiRouter.post('/admin/checkpoints', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { siteId, code, name, latitude, longitude, radiusMeters, coordinateMethod, accuracy, capturedAt } = req.body;
  if (!code || !name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, error: 'Semua data checkpoint wajib diisi.' });
  }
  const checkpointSite = db.findSiteById(siteId || '');
  if (!checkpointSite) return res.status(400).json({ success: false, error: 'Checkpoint wajib terhubung ke Site yang valid.' });
  if (db.findCheckpointById(`${checkpointSite.id}-${code.toUpperCase()}`)) return res.status(409).json({ success: false, error: 'Kode checkpoint sudah digunakan pada site ini.' });
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  if (!Number.isFinite(numericLatitude) || numericLatitude < -90 || numericLatitude > 90 || !Number.isFinite(numericLongitude) || numericLongitude < -180 || numericLongitude > 180) return res.status(400).json({ success: false, error: 'Latitude atau Longitude tidak valid.' });
  if (coordinateMethod === 'GPS' && (!Number.isFinite(Number(accuracy)) || Number(accuracy) > 25 || !capturedAt)) return res.status(400).json({ success: false, error: 'Akurasi GPS rendah atau data capture belum lengkap. Ambil GPS kembali.' });

  const now = new Date().toISOString();
  const cp = db.addCheckpoint({
    id: `${checkpointSite.id}-${code.toUpperCase()}`,
    siteId: checkpointSite.id,
    code: code.toUpperCase(),
    name: name.trim(),
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

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'CHECKPOINT_CREATE',
    entityType: 'checkpoint',
    entityId: cp.id,
    newValue: cp,
    reason: `Tambah checkpoint baru ${cp.code}`,
  });

  res.json({ success: true, checkpoint: cp });
});

apiRouter.post('/admin/checkpoints/:id/generate-token', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const cp = db.findCheckpointById(req.params.id);
  if (!cp) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  if (!Number.isFinite(cp.latitude) || !Number.isFinite(cp.longitude) || !Number.isFinite(cp.radiusMeters) || cp.radiusMeters < 1) return res.status(409).json({ success: false, error: 'Lengkapi koordinat dan radius checkpoint sebelum generate token.' });
  let token = '';
  do {
    token = `CP-${cp.siteId}-${cp.code.replace(/\D/g, '').padStart(3, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  } while (db.findCheckpointByToken(token));
  const updated = db.updateCheckpoint(cp.id, { qrToken: token, qrStatus: 'INACTIVE' });
  db.addAuditLog({ actorUserId: req.user!.id, action: 'CHECKPOINT_TOKEN_GENERATE', entityType: 'checkpoint', entityId: cp.id, oldValue: { qrToken: cp.qrToken }, newValue: { qrToken: token }, reason: `Generate secure token ${cp.code}` });
  res.json({ success: true, checkpoint: updated, token });
});

apiRouter.post('/admin/checkpoints/:id/generate-qr', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const cp = db.findCheckpointById(req.params.id);
  if (!cp) return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  if (!cp.qrToken) return res.status(409).json({ success: false, error: 'Generate token terlebih dahulu.' });
  if (!Number.isFinite(cp.latitude) || !Number.isFinite(cp.longitude) || !Number.isFinite(cp.radiusMeters) || cp.radiusMeters < 1) return res.status(409).json({ success: false, error: 'Koordinat dan radius checkpoint belum valid.' });
  const qrPayload = JSON.stringify({ checkpointId: cp.id, token: cp.qrToken });
  const updated = db.updateCheckpoint(cp.id, { qrStatus: 'ACTIVE' });
  db.addAuditLog({ actorUserId: req.user!.id, action: 'CHECKPOINT_QR_GENERATE', entityType: 'checkpoint', entityId: cp.id, newValue: { qrPayload }, reason: `Generate QR ${cp.code}` });
  res.json({ success: true, checkpoint: updated, qrPayload });
});

apiRouter.patch('/admin/checkpoints/:id', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const cp = db.findCheckpointById(req.params.id);
  if (!cp) {
    return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  }

  const { name, latitude, longitude, radiusMeters, status, qrStatus } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (latitude !== undefined) updates.latitude = Number(latitude);
  if (longitude !== undefined) updates.longitude = Number(longitude);
  if (radiusMeters !== undefined) updates.radiusMeters = Number(radiusMeters);
  if (status !== undefined) updates.status = status;
  if (qrStatus !== undefined) updates.qrStatus = qrStatus;

  const updated = db.updateCheckpoint(cp.id, updates);

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'CHECKPOINT_UPDATE',
    entityType: 'checkpoint',
    entityId: cp.id,
    oldValue: cp,
    newValue: updates,
    reason: `Perubahan parameter checkpoint ${cp.code}`,
  });

  res.json({ success: true, checkpoint: updated });
});

apiRouter.post('/admin/checkpoints/:id/regenerate-qr', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const cp = db.findCheckpointById(req.params.id);
  if (!cp) {
    return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  }

  const oldToken = cp.qrToken;
  const newToken = `${cp.siteId}-${Math.random().toString(36).substring(2, 12).toUpperCase()}`;

  db.updateCheckpoint(cp.id, {
    qrToken: newToken,
    qrStatus: 'ACTIVE',
  });

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'QR_REGENERATE',
    entityType: 'checkpoint',
    entityId: cp.id,
    oldValue: { qrToken: oldToken },
    newValue: { qrToken: newToken },
    reason: `Regenerasi QR token untuk ${cp.code} (${cp.name})`,
  });

  res.json({
    success: true,
    message: `QR Token baru untuk ${cp.code} berhasil dibuat.`,
    newToken,
  });
});

// Admin Radius Calibration
apiRouter.get('/admin/radius-calibrations', authMiddleware, (_req: Request, res: Response) => {
  const calibrations = db.getRadiusCalibrations();
  res.json({ success: true, calibrations });
});

apiRouter.post('/admin/radius-calibrations', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { checkpointId, latitude, longitude, gpsAccuracyM, calculatedDistanceM, verdict, notes } = req.body;
  const cp = db.findCheckpointById(checkpointId);
  if (!cp) {
    return res.status(404).json({ success: false, error: 'Checkpoint tidak ditemukan.' });
  }

  const now = new Date().toISOString();
  const cal = db.addRadiusCalibration({
    id: `CAL-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    siteId: cp.siteId,
    checkpointId: cp.id,
    testedByUserId: req.user!.id,
    testedAt: now,
    latitude: Number(latitude),
    longitude: Number(longitude),
    gpsAccuracyM: gpsAccuracyM ? Number(gpsAccuracyM) : null,
    calculatedDistanceM: Number(calculatedDistanceM),
    configuredRadiusM: cp.radiusMeters,
    verdict: verdict || 'VALID',
    deviceModel: req.headers['user-agent'] || 'Field Unit',
    notes: notes || 'Uji kalibrasi lapangan',
    createdAt: now,
  });

  res.json({ success: true, calibration: cal });
});

// Admin Audit Logs
apiRouter.get('/admin/audit-logs', authMiddleware, requireAdmin, (_req: Request, res: Response) => {
  const logs = db.getAuditLogs().slice(0, 100);
  res.json({ success: true, logs });
});

// Admin Override Validation
apiRouter.post('/admin/override-validation', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { logId, newStatus, reason } = req.body;
  if (!logId || !newStatus || !reason) {
    return res.status(400).json({ success: false, error: 'Log ID, Status Baru, dan Alasan Koreksi wajib diisi.' });
  }

  const log = db.findPatrolLogById(logId);
  if (!log) {
    return res.status(404).json({ success: false, error: 'Patrol Log tidak ditemukan.' });
  }

  const oldStatus = log.validationStatus;
  log.validationStatus = newStatus;
  if (newStatus === 'VALID') {
    log.rejectionReason = null;
    log.rejectionMessage = `Status diubah menjadi VALID oleh Super Admin (${reason})`;
  }

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'VALIDATION_OVERRIDE',
    entityType: 'patrol_log',
    entityId: log.id,
    oldValue: { validationStatus: oldStatus },
    newValue: { validationStatus: newStatus },
    reason,
  });

  res.json({ success: true, log });
});

// -------------------------------------------------------------
// BATCH OFFLINE QUEUE SYNC
// -------------------------------------------------------------

apiRouter.post('/sync', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'Payload sync harus berupa array items.' });
  }

  const results: any[] = [];

  for (const item of items) {
    try {
      if (item.type === 'PATROL_SCAN') {
        const result = validateAndProcessScan({
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
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    provider: repositoryHealth.provider,
    database: repositoryHealth.database,
    service: 'OPS SIGAP Security Operations System',
    timestamp: new Date().toISOString(),
    serverTimeJakarta: `${dateString} ${timeString} WIB`,
    activeShift: shift,
    databaseDetails: {
      status: repositoryHealth.database.toUpperCase(),
      ...(repositoryHealth.provider === 'json' ? {
        usersCount: db.getUsers().length,
        sitesCount: db.getSites().length,
        checkpointsCount: db.getCheckpoints().length,
        patrolSessionsCount: db.getPatrolSessions().length,
        patrolLogsCount: db.getPatrolLogs().length,
      } : {}),
    },
  });
});
