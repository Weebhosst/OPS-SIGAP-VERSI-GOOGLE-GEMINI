import { db } from '../db';
import { normalizeDocumentType } from '../mediaTypes';
import {
  RepositoryBundle,
  RepositoryError,
  normalizePage,
  toPage,
  type AuthSessionRecord,
  type MediaFilters,
  type PageRequest,
  type SessionFilter,
} from './contracts';
import type {
  MediaGalleryItem,
  PatrolLog,
  PatrolSession,
  ValidationAlertStatus,
} from '../../src/types/ops';

const paginate = <T>(items: T[], request: PageRequest) => {
  const page = normalizePage(request);
  return toPage(items.slice(page.offset, page.offset + page.limit), items.length, page);
};

function sessionMatches(session: PatrolSession, filter: SessionFilter) {
  if (filter.userId && session.userId !== filter.userId) return false;
  if (filter.siteId && session.siteId !== filter.siteId) return false;
  if (filter.shiftCode && session.shiftCode !== filter.shiftCode) return false;
  if (filter.status && session.status !== filter.status) return false;
  if (filter.operationalDate && session.shiftDate !== filter.operationalDate) return false;
  return true;
}

function mediaMatches(item: MediaGalleryItem & { documentType: string }, filters: MediaFilters): boolean {
  const site = db.findSiteById(item.siteId);
  if (filters.customerId && site?.customerId !== filters.customerId) return false;
  if (filters.siteId && item.siteId !== filters.siteId) return false;
  if (filters.userId && item.userId !== filters.userId) return false;
  if (filters.shiftCode && item.shiftCode !== filters.shiftCode) return false;
  if (filters.operationalDate && item.shiftDate !== filters.operationalDate) return false;
  if (filters.from && item.shiftDate < filters.from) return false;
  if (filters.to && item.shiftDate >= filters.to) return false;
  if (filters.documentType && item.documentType !== filters.documentType && !(filters.documentType === 'SERTIGAS' && item.documentType.startsWith('SERTIGAS_'))) return false;
  if (filters.sessionId) {
    const linkedSessionId = item.sourceModule === 'PATROL'
      ? db.findPatrolLogById(item.sourceId)?.sessionId
      : item.sourceModule === 'HANDOVER'
        ? db.findHandoverById(item.handoverId || item.sourceId)?.sessionId
        : db.findIncidentById(item.incidentId || item.sourceId)?.sessionId;
    if (linkedSessionId !== filters.sessionId) return false;
  }
  return true;
}

const jsonAuthSessions = new Map<string, AuthSessionRecord>();

function normalizedMedia(filters: MediaFilters = {}) {
  return db.getMedia()
    .map((item) => ({ ...item, documentType: normalizeDocumentType(item) }))
    .filter((item) => mediaMatches(item, filters))
    .sort((a, b) => new Date(b.eventAt || b.createdAt).getTime() - new Date(a.eventAt || a.createdAt).getTime());
}

export const jsonRepositories: RepositoryBundle = {
  provider: 'json',
  health: async () => ({ provider: 'json', database: 'connected' }),

  users: {
    findById: async (id) => db.findUserById(id),
    findByNpk: async (npk) => db.findUserByNpk(npk),
    list: async (page) => paginate(db.getUsers(), page),
    create: async (user) => db.addUser(user),
    update: async (id, updates, assignment) => {
      const current = db.findUserById(id);
      if (!current) return undefined;
      const next = assignment
        ? {
            ...updates,
            customerId: assignment.customerId,
            siteId: assignment.siteId,
            assignmentHistory: [
              ...(current.assignmentHistory || []),
              {
                customerId: assignment.customerId,
                siteId: assignment.siteId,
                effectiveAt: assignment.effectiveAt,
                changedBy: assignment.changedBy,
              },
            ],
          }
        : updates;
      return db.updateUser(id, next);
    },
    resetPassword: async (id, passwordHash, changedAt) => db.updateUser(id, {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: changedAt,
    }),
    changePassword: async (id, passwordHash, changedAt) => db.updateUser(id, {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
    }),
  },

  authSessions: {
    create: async (session) => {
      jsonAuthSessions.set(session.tokenHash, session);
      return session;
    },
    findActiveByTokenHash: async (tokenHash, now) => {
      const session = jsonAuthSessions.get(tokenHash);
      if (!session || session.revokedAt || session.expiresAt <= now) return undefined;
      return session;
    },
    touch: async (id, at) => {
      for (const [key, session] of jsonAuthSessions.entries()) {
        if (session.id === id) {
          jsonAuthSessions.set(key, { ...session, lastSeenAt: at });
          return;
        }
      }
    },
    revokeByTokenHash: async (tokenHash, revokedAt) => {
      const session = jsonAuthSessions.get(tokenHash);
      if (session) jsonAuthSessions.set(tokenHash, { ...session, revokedAt });
    },
    revokeAllForUser: async (userId, revokedAt, exceptTokenHash) => {
      for (const [key, session] of jsonAuthSessions.entries()) {
        if (session.userId === userId && key !== exceptTokenHash && !session.revokedAt) {
          jsonAuthSessions.set(key, { ...session, revokedAt });
        }
      }
    },
  },

  customers: {
    findById: async (id) => db.findCustomerById(id),
    list: async (page) => paginate(db.getCustomers(), page),
    create: async (customer) => db.addCustomer(customer),
    update: async (id, updates) => db.updateCustomer(id, updates),
  },

  sites: {
    findById: async (id) => db.findSiteById(id),
    list: async (page) => paginate(db.getSites(), page),
    create: async (site) => db.addSite(site),
    update: async (id, updates) => db.updateSite(id, updates),
  },

  checkpoints: {
    findById: async (id) => db.findCheckpointById(id),
    findByToken: async (token) => db.findCheckpointByToken(token),
    list: async (page) => paginate(db.getCheckpoints(), page),
    listBySite: async (siteId) => db.getCheckpoints(siteId),
    create: async (checkpoint) => db.addCheckpoint(checkpoint),
    update: async (id, updates) => db.updateCheckpoint(id, updates),
    replaceToken: async (id, token, _actorUserId, activate) => db.updateCheckpoint(id, {
      qrToken: token,
      qrStatus: activate ? 'ACTIVE' : 'INACTIVE',
    }),
  },

  sessions: {
    findById: async (id) => db.findSessionById(id),
    getActiveByUser: async (userId) => db.getActiveSessionForUser(userId),
    startAtomic: async ({ session, personnelCapacity }) => {
      if (db.getActiveSessionForUser(session.userId)) {
        throw new RepositoryError('USER_ALREADY_HAS_ACTIVE_SESSION', 'Petugas masih memiliki sesi aktif.');
      }
      if (db.getActiveSessionsForSite(session.siteId).length >= personnelCapacity) {
        throw new RepositoryError('SITE_CAPACITY_FULL', 'Kapasitas petugas aktif pada site telah penuh.');
      }
      return db.createPatrolSession(session);
    },
    update: async (id, updates) => db.updatePatrolSession(id, updates),
    completeAtomic: async (id, userId, updates) => {
      const session = db.findSessionById(id);
      if (!session || session.userId !== userId) throw new RepositoryError('SESSION_NOT_FOUND', 'Active session milik Anda tidak ditemukan.', 404);
      if (session.status !== 'ACTIVE') throw new RepositoryError('SESSION_NOT_ACTIVE', 'Session sudah tidak aktif.', 409);
      return db.updatePatrolSession(id, updates)!;
    },
    forceCloseAtomic: async (id, actorUserId, actorRole, reason) => {
      const session = db.findSessionById(id);
      if (!session) throw new RepositoryError('SESSION_NOT_FOUND', 'Session tidak ditemukan.', 404);
      if (session.status !== 'ACTIVE') throw new RepositoryError('SESSION_NOT_ACTIVE', 'Session sudah tidak aktif.', 409);
      const now = new Date().toISOString();
      return db.updatePatrolSession(id, {
        status: 'FORCE_CLOSED',
        endedAt: now,
        forceClosed: true,
        forceCloseBy: actorUserId,
        forceCloseRole: actorRole as any,
        forceCloseReason: reason,
        forceCloseAt: now,
      })!;
    },
    countActiveBySite: async (siteId) => db.getActiveSessionsForSite(siteId).length,
    list: async (page) => paginate(db.getPatrolSessions(), page),
    listFiltered: async (filter, page) => paginate(db.getPatrolSessions().filter((session) => sessionMatches(session as any, filter)), page),
  },

  patrol: {
    findById: async (id) => db.findPatrolLogById(id),
    addLogAtomic: async (log: PatrolLog) => {
      const existing = db.findPatrolLogById(log.id);
      if (existing) return existing;
      const duplicate = log.validationStatus === 'VALID' && db.getPatrolLogs(log.sessionId).some(
        (item) => item.validationStatus === 'VALID'
          && item.checkpointId === log.checkpointId
          && (item.roundNumber || 1) === (log.roundNumber || 1),
      );
      if (duplicate) {
        throw new RepositoryError('DUPLICATE_CHECKPOINT', 'Checkpoint sudah valid pada ronde ini.');
      }
      return db.addPatrolLog(log);
    },
    listBySession: async (sessionId, page) => paginate(db.getPatrolLogs(sessionId), page),
    listAllBySession: async (sessionId) => db.getPatrolLogs(sessionId),
    countAll: async () => db.getPatrolLogs().length,
    overrideValidation: async (id, newStatus, reason) => {
      const log = db.findPatrolLogById(id);
      if (!log) return undefined;
      log.validationStatus = newStatus;
      if (newStatus === 'VALID') {
        log.rejectionReason = null;
        log.rejectionMessage = `Status diubah menjadi VALID oleh Administrator (${reason})`;
      }
      return log;
    },
  },

  handovers: {
    findById: async (id) => db.findHandoverById(id),
    list: async (filter, page) => paginate(
      db.getHandovers({
        siteId: filter.siteId || null,
        shiftCode: filter.shiftCode || null,
        userId: filter.userId || null,
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      page,
    ),
    create: async (handover) => db.addHandover(handover),
    update: async (id, updates) => db.updateHandover(id, updates),
  },

  incidents: {
    findById: async (id) => db.findIncidentById(id),
    list: async (filter, page) => paginate(
      db.getIncidents({
        siteId: filter.siteId || null,
        shiftCode: filter.shiftCode || null,
        userId: filter.userId || null,
        status: filter.status || null,
      }).sort((a, b) => new Date(b.incidentAt).getTime() - new Date(a.incidentAt).getTime()),
      page,
    ),
    create: async (incident) => db.addIncident(incident),
    update: async (id, updates) => db.updateIncident(id, updates),
  },

  alerts: {
    findById: async (id) => db.findValidationAlertById(id),
    list: async (status: ValidationAlertStatus | undefined, page) => paginate(
      db.getValidationAlerts().filter((item) => !status || item.status === status),
      page,
    ),
    transition: async (id, action, actorUserId, closeNote) => {
      const alert = db.findValidationAlertById(id);
      if (!alert) throw new RepositoryError('ALERT_NOT_FOUND', 'Validation alert tidak ditemukan.', 404);
      const now = new Date().toISOString();
      let updates: any;
      if (action === 'REVIEW' && alert.status === 'OPEN') {
        updates = { status: 'UNDER_REVIEW', reviewedBy: actorUserId, reviewedAt: now };
      } else if (action === 'CLOSE' && alert.status !== 'CLOSED' && closeNote?.trim()) {
        updates = { status: 'CLOSED', closedBy: actorUserId, closedAt: now, closeNote: closeNote.trim() };
      } else if (action === 'REOPEN' && alert.status === 'CLOSED') {
        updates = { status: 'OPEN', reopenedBy: actorUserId, reopenedAt: now, closedBy: null, closedAt: null, closeNote: null };
      } else {
        throw new RepositoryError(
          'INVALID_ALERT_TRANSITION',
          action === 'CLOSE' ? 'Catatan penyelesaian wajib diisi.' : 'Transisi status alert tidak valid.',
          400,
        );
      }
      return db.updateValidationAlert(id, updates)!;
    },
    remove: async (id) => {
      const removed = db.deleteValidationAlert(id);
      if (!removed) throw new RepositoryError('ALERT_NOT_FOUND', 'Validation alert tidak ditemukan.', 404);
      return removed;
    },
  },

  adminState: {
    get: async (userId) => db.getAdminFilterState(userId),
    set: async (userId, updates) => db.setAdminFilterState(userId, updates),
  },

  radiusCalibrations: {
    list: async (page) => paginate(db.getRadiusCalibrations(), page),
    create: async (entry) => db.addRadiusCalibration(entry),
  },

  media: {
    list: async (filters, pageRequest) => {
      const page = normalizePage(pageRequest);
      const all = normalizedMedia(filters);
      return toPage(all.slice(page.offset, page.offset + page.limit), all.length, page);
    },
    counts: async (filters) => {
      const all = normalizedMedia(filters);
      const result: Record<string, number> = { SEMUA: all.length };
      for (const item of all) {
        const type = item.documentType || 'LAINNYA';
        result[type] = (result[type] || 0) + 1;
        if (type.startsWith('SERTIGAS_')) result.SERTIGAS = (result.SERTIGAS || 0) + 1;
      }
      return result;
    },
    findObjectRef: async (id) => {
      const item = db.getMedia().find((media) => media.id === id);
      if (!item) return undefined;
      return {
        id: item.id,
        siteId: item.siteId,
        userId: item.userId,
        storageProvider: item.photoUrl.startsWith('data:') ? 'inline_json' : 'external_url',
        storageKey: item.photoUrl,
        mimeType: item.photoUrl.startsWith('data:image/png') ? 'image/png' : item.photoUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg',
        fileName: `${item.id}.jpg`,
        fileSize: null,
      };
    },
    add: async (item) => db.addMedia(item),
  },

  audit: {
    append: async (entry) => db.addAuditLog(entry),
    list: async (page) => paginate(db.getAuditLogs(), page),
  },
};
