import { db } from '../db';
import { getOperationalMedia } from '../mediaService';
import { RepositoryBundle, RepositoryError, normalizePage, toPage, type PageRequest } from './contracts';
import type { PatrolLog, PatrolSession, ValidationAlertStatus } from '../../src/types/ops';

const paginate = <T>(items: T[], request: PageRequest) => { const page = normalizePage(request); return toPage(items.slice(page.offset, page.offset + page.limit), items.length, page); };

export const jsonRepositories: RepositoryBundle = {
  provider: 'json',
  health: async () => ({ provider: 'json', database: 'connected' }),
  users: {
    findById: async (id) => db.findUserById(id), findByNpk: async (npk) => db.findUserByNpk(npk),
    list: async (page) => paginate(db.getUsers(), page),
  },
  customers: { findById: async (id) => db.findCustomerById(id), list: async (page) => paginate(db.getCustomers(), page) },
  sites: { findById: async (id) => db.findSiteById(id), list: async (page) => paginate(db.getSites(), page) },
  checkpoints: { findById: async (id) => db.findCheckpointById(id), findByToken: async (token) => db.findCheckpointByToken(token), listBySite: async (siteId) => db.getCheckpoints(siteId) },
  sessions: {
    findById: async (id) => db.findSessionById(id), getActiveByUser: async (userId) => db.getActiveSessionForUser(userId),
    startAtomic: async ({ session, personnelCapacity }) => {
      if (db.getActiveSessionForUser(session.userId)) throw new RepositoryError('USER_ALREADY_HAS_ACTIVE_SESSION', 'Petugas masih memiliki sesi aktif.');
      if (db.getActiveSessionsForSite(session.siteId).length >= personnelCapacity) throw new RepositoryError('SITE_CAPACITY_FULL', 'Kapasitas petugas aktif pada site telah penuh.');
      return db.createPatrolSession(session);
    },
    update: async (id, updates) => db.updatePatrolSession(id, updates),
    list: async (page) => paginate(db.getPatrolSessions(), page),
  },
  patrol: {
    addLogAtomic: async (log: PatrolLog) => {
      const duplicate = log.validationStatus === 'VALID' && db.getPatrolLogs(log.sessionId).some((item) => item.validationStatus === 'VALID' && item.checkpointId === log.checkpointId && (item.roundNumber || 1) === (log.roundNumber || 1));
      if (duplicate) throw new RepositoryError('DUPLICATE_CHECKPOINT', 'Checkpoint sudah valid pada ronde ini.');
      return db.addPatrolLog(log);
    },
    listBySession: async (sessionId, page) => paginate(db.getPatrolLogs(sessionId), page),
  },
  alerts: {
    findById: async (id) => db.findValidationAlertById(id),
    list: async (status: ValidationAlertStatus | undefined, page) => paginate(db.getValidationAlerts().filter((item) => !status || item.status === status), page),
    transition: async (id, action, actorUserId, closeNote) => {
      const alert = db.findValidationAlertById(id); if (!alert) throw new RepositoryError('ALERT_NOT_FOUND', 'Validation alert tidak ditemukan.', 404);
      const now = new Date().toISOString(); let updates: any;
      if (action === 'REVIEW' && alert.status === 'OPEN') updates = { status: 'UNDER_REVIEW', reviewedBy: actorUserId, reviewedAt: now };
      else if (action === 'CLOSE' && alert.status !== 'CLOSED' && closeNote?.trim()) updates = { status: 'CLOSED', closedBy: actorUserId, closedAt: now, closeNote: closeNote.trim() };
      else if (action === 'REOPEN' && alert.status === 'CLOSED') updates = { status: 'OPEN', reopenedBy: actorUserId, reopenedAt: now, closedBy: null, closedAt: null, closeNote: null };
      else throw new RepositoryError('INVALID_ALERT_TRANSITION', action === 'CLOSE' ? 'Catatan penyelesaian wajib diisi.' : 'Transisi status alert tidak valid.', 400);
      return db.updateValidationAlert(id, updates)!;
    },
  },
  media: {
    list: async (filters, pageRequest) => { const page = normalizePage(pageRequest); const all = getOperationalMedia({ siteId: filters.siteId, documentType: filters.documentType }).filter((item) => (!filters.from || item.shiftDate >= filters.from) && (!filters.to || item.shiftDate < filters.to)); return toPage(all.slice(page.offset, page.offset + page.limit), all.length, page); },
  },
  audit: {
    append: async (entry) => db.addAuditLog(entry), list: async (page) => paginate(db.getAuditLogs(), page),
  },
};
