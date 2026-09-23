/**
 * OPS SIGAP — Express API Router
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { validateAndProcessScan, getMemberShiftProgress } from './patrolService';
import {
  User,
  resolveShift,
  getJakartaDateParts,
  ShiftHandover,
  IncidentReport,
  PatrolSession,
  Role,
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

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

  const user = db.findUserById(session.userId);
  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({ success: false, error: 'Akun dinonaktifkan atau tidak ditemukan.' });
  }

  req.user = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Fitur ini hanya untuk Super Admin.',
    });
  }
  next();
}

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

// Simple rate limiter tracking for brute-force defense
const loginAttempts = new Map<string, { count: number; blockedUntil?: number }>();

apiRouter.post('/auth/login', (req: Request, res: Response) => {
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

  const user = db.findUserByNpk(cleanNpk);
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
  db.addAuditLog({
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

  const enrichedCheckpoints = checkpoints.map((cp) => {
    const validLog = logs.find((l) => l.checkpointId === cp.id && l.validationStatus === 'VALID');
    const latestLog = logs
      .filter((l) => l.checkpointId === cp.id)
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
  });
});

apiRouter.post('/patrol/session/start', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const siteId = req.user!.siteId || 'BB92';
  const existingOpen = db.getOpenSessionForUser(req.user!.id, siteId);

  if (existingOpen) {
    return res.status(400).json({
      success: false,
      error: 'Anda masih memiliki sesi patroli yang sedang berjalan. Lanjutkan sesi tersebut.',
      session: existingOpen,
    });
  }

  const shift = resolveShift();
  const activeCheckpoints = db.getCheckpoints(siteId).filter((c) => c.status === 'ACTIVE');
  const now = new Date().toISOString();

  // Count existing completed rounds for this shift
  const existingRounds = db.getPatrolSessions({
    userId: req.user!.id,
    siteId,
    shiftCode: shift.code,
  }).filter((s) => s.shiftDate === shift.operationalDate);

  const roundNumber = existingRounds.length + 1;

  const newSession: PatrolSession = {
    id: `SES-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    userId: req.user!.id,
    siteId,
    shiftCode: shift.code,
    shiftDate: shift.operationalDate,
    startedAt: now,
    status: 'OPEN',
    totalRequired: activeCheckpoints.length,
    totalValid: 0,
    completionPct: 0,
    roundNumber,
    createdAt: now,
    updatedAt: now,
  };

  db.createPatrolSession(newSession);

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'PATROL_SESSION_START',
    entityType: 'patrol_session',
    entityId: newSession.id,
    newValue: {
      siteId,
      shiftCode: shift.code,
      shiftDate: shift.operationalDate,
      roundNumber,
      totalRequired: activeCheckpoints.length,
    },
    reason: `Mulai ronde #${roundNumber} (${shift.name})`,
  });

  res.json({ success: true, session: newSession });
});

apiRouter.post('/patrol/scan', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
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
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
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
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
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

apiRouter.post('/handover', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
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
  } = req.body;

  const siteId = req.user!.siteId || 'BB92';
  const shift = resolveShift();
  const now = new Date().toISOString();

  const id = `HND-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const handover: ShiftHandover = {
    id,
    siteId,
    shiftDate: shift.operationalDate,
    shiftCode: shift.code,
    handoverType: handoverType || 'SERAH_TERIMA',
    fromUserId: req.user!.id,
    toUserId: toUserId || null,
    eventAt: eventAt || now,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    photoUrl: photoUrl || null,
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

  // If photo is present, auto-add to Media Gallery
  if (photoUrl) {
    const site = db.getSites().find((s) => s.id === siteId);
    db.addMedia({
      id: `MED-${id}`,
      sourceModule: 'HANDOVER',
      sourceTable: 'shift_handovers',
      sourceId: id,
      siteId,
      userId: req.user!.id,
      shiftDate: shift.operationalDate,
      shiftCode: shift.code,
      category: 'SERAH TERIMA',
      subcategory: handover.handoverType,
      photoUrl,
      caption: `${handover.handoverType} • ${site?.name || siteId} • Kondisi: ${handover.conditionStatus}`,
      eventAt: handover.eventAt,
      latitude: handover.latitude,
      longitude: handover.longitude,
      handoverId: id,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: req.user!.id,
    });
  }

  db.addAuditLog({
    actorUserId: req.user!.id,
    action: 'HANDOVER_CREATE',
    entityType: 'shift_handover',
    entityId: id,
    newValue: {
      handoverType: handover.handoverType,
      siteId,
      shiftCode: shift.code,
      conditionStatus: handover.conditionStatus,
    },
    reason: `Input serah terima jaga ${handover.handoverType}`,
  });

  res.json({ success: true, handover });
});

apiRouter.post('/handover/:id/ack', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
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
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
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

apiRouter.post('/incidents', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const {
    category,
    severity,
    title,
    locationText,
    latitude,
    longitude,
    photoUrl,
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
  } = req.body;

  if (!title || !chronology || !initialAction) {
    return res.status(400).json({
      success: false,
      error: 'Judul, kronologi, dan tindakan awal wajib diisi.',
    });
  }

  const siteId = req.user!.siteId || 'BB92';
  const shift = resolveShift();
  const now = new Date().toISOString();
  const id = `INC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const incident: IncidentReport = {
    id,
    siteId,
    userId: req.user!.id,
    incidentAt: now,
    shiftCode: shift.code,
    shiftDate: shift.operationalDate,
    category: category || 'INSIDENTIL',
    severity: severity || 'RENDAH',
    title,
    locationText: locationText || 'Area Site BB92',
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    photoUrl: photoUrl || null,
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

  // Auto-register in Media Gallery if photo exists
  if (photoUrl) {
    db.addMedia({
      id: `MED-${id}`,
      sourceModule: 'INCIDENT',
      sourceTable: 'incident_reports',
      sourceId: id,
      siteId,
      userId: req.user!.id,
      shiftDate: shift.operationalDate,
      shiftCode: shift.code,
      category: 'KEJADIAN',
      subcategory: incident.category,
      photoUrl,
      caption: `${incident.category} • ${incident.title} [${incident.severity}]`,
      eventAt: incident.incidentAt,
      latitude: incident.latitude,
      longitude: incident.longitude,
      incidentId: id,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: req.user!.id,
    });
  }

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

apiRouter.patch('/incidents/:id/status', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
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
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const filter: any = {};

  if (!isSuperAdmin) {
    filter.siteId = req.user!.siteId;
  } else {
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    if (req.query.shiftCode) filter.shiftCode = String(req.query.shiftCode);
    if (req.query.sourceModule) filter.sourceModule = String(req.query.sourceModule);
  }

  const media = db.getMedia(filter).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ success: true, media });
});

// -------------------------------------------------------------
// SUPER ADMIN COMMAND CENTER & MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/admin/command-center', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
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

  // 1. Patroli Aktif (Sessions with status == OPEN)
  const allSessions = db.getPatrolSessions();
  const activePatrols = allSessions.filter((s) => {
    if (s.status !== 'OPEN') return false;
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
  const validationAlerts = allLogs
    .filter((l) => l.validationStatus === 'REJECTED' || l.validationStatus === 'REVIEW')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Critical Incidents
  const criticalIncidents = allIncidents
    .filter((i) => i.severity === 'TINGGI' || i.severity === 'KRITIS' || i.category === 'MENONJOL' || i.status !== 'CLOSED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  // Recent Media
  const recentMedia = db.getMedia().slice(0, 12);

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

apiRouter.post('/admin/filter-state', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { siteId, shiftCode, memberUserId } = req.body;
  const updated = db.setAdminFilterState(req.user!.id, {
    siteId: siteId === '' ? null : siteId,
    shiftCode: shiftCode === '' ? null : shiftCode,
    memberUserId: memberUserId === '' ? null : memberUserId,
  });
  res.json({ success: true, filterState: updated });
});

apiRouter.post('/admin/filter-state/reset', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const updated = db.setAdminFilterState(req.user!.id, {
    siteId: null,
    shiftCode: null,
    memberUserId: null,
  });
  res.json({ success: true, filterState: updated });
});

// Admin User Management
apiRouter.get('/admin/users', authMiddleware, requireAdmin, (_req: Request, res: Response) => {
  const users = db.getUsers().map(({ passwordHash, ...u }) => u);
  res.json({ success: true, users });
});

apiRouter.post('/admin/users', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, npk, email, role, siteId } = req.body;
  if (!name || !npk) {
    return res.status(400).json({ success: false, error: 'Nama dan NPK wajib diisi.' });
  }

  const existing = db.findUserByNpk(String(npk).trim());
  if (existing) {
    return res.status(400).json({ success: false, error: 'NPK sudah terdaftar.' });
  }

  const cleanNpk = String(npk).trim();
  const now = new Date().toISOString();
  const newUser: User = {
    id: `USR-${siteId || 'GEN'}-${Date.now().toString().slice(-4)}`,
    name: name.trim(),
    npk: cleanNpk,
    email: email ? email.trim() : `${cleanNpk}@sigap.local`,
    role: role || 'ANGGOTA',
    siteId: role === 'SUPER_ADMIN' ? null : (siteId || 'BB92'),
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
  const { name, email, role, siteId, status } = req.body;
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  }

  const oldValues = { name: user.name, role: user.role, siteId: user.siteId, status: user.status };
  const updates: Partial<User> = {};
  if (name !== undefined) updates.name = name.trim();
  if (email !== undefined) updates.email = email.trim();
  if (role !== undefined) updates.role = role;
  if (siteId !== undefined) updates.siteId = siteId;
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
  const { siteId, code, name, latitude, longitude, radiusMeters } = req.body;
  if (!code || !name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, error: 'Semua data checkpoint wajib diisi.' });
  }

  const now = new Date().toISOString();
  const token = `${siteId || 'SITE'}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const cp = db.addCheckpoint({
    id: `${siteId || 'BB92'}-${code.toUpperCase()}`,
    siteId: siteId || 'BB92',
    code: code.toUpperCase(),
    name: name.trim(),
    latitude: Number(latitude),
    longitude: Number(longitude),
    radiusMeters: Number(radiusMeters) || 15,
    qrToken: token,
    status: 'ACTIVE',
    qrStatus: 'ACTIVE',
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

apiRouter.get('/health', (_req: Request, res: Response) => {
  const { dateString, timeString } = getJakartaDateParts();
  const shift = resolveShift();
  res.json({
    status: 'OK',
    service: 'OPS SIGAP Security Operations System',
    timestamp: new Date().toISOString(),
    serverTimeJakarta: `${dateString} ${timeString} WIB`,
    activeShift: shift,
    database: {
      status: 'CONNECTED',
      usersCount: db.getUsers().length,
      sitesCount: db.getSites().length,
      checkpointsCount: db.getCheckpoints().length,
      patrolSessionsCount: db.getPatrolSessions().length,
      patrolLogsCount: db.getPatrolLogs().length,
    },
  });
});
