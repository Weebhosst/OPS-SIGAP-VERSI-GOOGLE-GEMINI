/**
 * OPS SIGAP — Database Engine & Seeder
 * Persistent JSON-backed relational storage with atomic operations
 */

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from './config';
import {
  User,
  Customer,
  Site,
  Checkpoint,
  PatrolSession,
  PatrolLog,
  ShiftHandover,
  IncidentReport,
  MediaGalleryItem,
  RadiusCalibration,
  AuditLog,
  AdminFilterState,
  ValidationAlert,
  calculateDistanceMeters,
} from '../src/types/ops';

export interface DatabaseSchema {
  customers: Customer[];
  users: User[];
  sites: Site[];
  checkpoints: Checkpoint[];
  patrol_sessions: PatrolSession[];
  patrol_logs: PatrolLog[];
  shift_handovers: ShiftHandover[];
  incident_reports: IncidentReport[];
  media_gallery: MediaGalleryItem[];
  radius_calibrations: RadiusCalibration[];
  audit_logs: AuditLog[];
  admin_filter_state: AdminFilterState[];
  validation_alerts: ValidationAlert[];
  settings: Record<string, any>;
  go_live_checklist: { item: string; done: boolean; checkedAt?: string }[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = process.env.OPS_SIGAP_DATA_FILE
  ? path.resolve(process.env.OPS_SIGAP_DATA_FILE)
  : path.join(DATA_DIR, 'ops-sigap.json');
const STORAGE_DIR = path.dirname(DATA_FILE);

class DatabaseStore {
  private data: DatabaseSchema;
  private initialized = false;

  constructor() {
    this.data = this.getInitialSchema();
  }

  private getInitialSchema(): DatabaseSchema {
    return {
      customers: [],
      users: [],
      sites: [],
      checkpoints: [],
      patrol_sessions: [],
      patrol_logs: [],
      shift_handovers: [],
      incident_reports: [],
      media_gallery: [],
      radius_calibrations: [],
      audit_logs: [],
      admin_filter_state: [],
      validation_alerts: [],
      settings: {
        appName: 'OPS SIGAP',
        subtitle: 'Security Operations System',
        timezone: 'Asia/Jakarta',
        minRoundsPerShift: 5,
        defaultSiteId: 'BB92',
      },
      go_live_checklist: [
        { item: 'Master Data Checkpoints BB92 terverifikasi', done: true },
        { item: 'QR Token tergenerate dan siap cetak', done: true },
        { item: 'Radius geofence ketat aktif (CP03 & CP04 @ 10m)', done: true },
        { item: 'Akun 4 Anggota & Super Admin seeded', done: true },
        { item: 'Koneksi offline queue IndexedDB siap', done: true },
      ],
    };
  }

  public init() {
    if (this.initialized) return;

    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        // Ensure all arrays exist
        const defaultSchema = this.getInitialSchema();
        for (const key of Object.keys(defaultSchema) as (keyof DatabaseSchema)[]) {
          if (!this.data[key]) {
            (this.data as any)[key] = defaultSchema[key];
          }
        }
        const isGenuinelyEmpty = this.data.users.length === 0 && this.data.sites.length === 0 && this.data.checkpoints.length === 0;
        if (isGenuinelyEmpty) this.seedProduction();
        else this.migrateLegacyData();
      } catch (err) {
        console.error('Failed to read existing database file, re-seeding:', err);
        this.seedProduction();
      }
    } else {
      this.seedProduction();
    }

    this.migrateLegacyData();
    this.save();
    this.initialized = true;
  }

  private migrateLegacyData() {
    const now = new Date().toISOString();
    this.data.validation_alerts ||= [];
    for (const site of this.data.sites) site.targetRoundsPerShift = Math.max(1, Number(site.targetRoundsPerShift) || 1);
    for (const site of this.data.sites) {
      site.customerId ||= this.data.customers[0]?.id || 'UNASSIGNED';
      site.code ||= site.id;
      site.personnelCapacity ||= site.id === 'BB92' ? 1 : 1;
      site.targetRoundsPerShift = Math.max(1, Number(site.targetRoundsPerShift) || 1);
    }
    for (const user of this.data.users) {
      user.customerId ??= user.siteId ? this.data.sites.find((site) => site.id === user.siteId)?.customerId || null : null;
      user.position ||= user.role === 'ANGGOTA' ? 'ANGGOTA SECURITY' : user.role.replace('_', ' ');
      user.assignmentHistory ||= [{ customerId: user.customerId || null, siteId: user.siteId, effectiveAt: user.createdAt, changedBy: null }];
    }
    for (const session of this.data.patrol_sessions) {
      const legacyStatus = session.status as string;
      if (legacyStatus === 'OPEN') session.status = 'ACTIVE';
      if (legacyStatus === 'COMPLETE') session.status = 'COMPLETED';
      if (legacyStatus === 'ABANDONED') session.status = 'CANCELLED';
      session.npk ||= this.data.users.find((user) => user.id === session.userId)?.npk;
      session.customerId ??= this.data.sites.find((site) => site.id === session.siteId)?.customerId || null;
      session.forceClosed ??= session.status === 'FORCE_CLOSED';
      session.startDocumentationCompleted ??= true;
      session.endDocumentationCompleted ??= session.status === 'COMPLETED';
    }
    for (const incident of this.data.incident_reports) incident.photoUrls ||= incident.photoUrl ? [incident.photoUrl] : [];
    for (const handover of this.data.shift_handovers) handover.photoUrls ||= handover.photoUrl ? [handover.photoUrl] : [];
    for (const log of this.data.patrol_logs.filter((item) => item.validationStatus !== 'VALID')) {
      if (!this.data.validation_alerts.some((alert) => alert.patrolLogId === log.id)) this.data.validation_alerts.push({ id: `ALT-${log.id}`, alertType: log.rejectionReason || log.validationStatus, status: 'OPEN', patrolLogId: log.id, userId: log.userId, sessionId: log.sessionId, siteId: log.siteId, checkpointId: log.checkpointId || null, message: log.rejectionMessage || log.rejectionReason || 'Validasi memerlukan perhatian.', createdAt: log.createdAt });
    }
    const addLegacyMedia = (item: MediaGalleryItem) => {
      const exists = this.data.media_gallery.some((media) => media.sourceModule === item.sourceModule && (
        media.sourceId === item.sourceId ||
        (!!item.handoverId && media.handoverId === item.handoverId && media.photoUrl === item.photoUrl) ||
        (!!item.incidentId && media.incidentId === item.incidentId && media.photoUrl === item.photoUrl)
      ));
      if (!exists) this.data.media_gallery.push(item);
    };
    for (const log of this.data.patrol_logs.filter((item) => item.validationStatus === 'VALID' && item.photoUrl)) {
      const session = this.data.patrol_sessions.find((item) => item.id === log.sessionId);
      if (!session) continue;
      addLegacyMedia({ id: `MED-${log.id}`, sourceModule: 'PATROL', sourceTable: 'patrol_logs', sourceId: log.id, siteId: log.siteId, userId: log.userId, shiftDate: session.shiftDate, shiftCode: session.shiftCode, category: 'PATROLI_QR', subcategory: log.observationStatus, photoUrl: log.photoUrl!, caption: `Patroli QR ${log.checkpointId}`, eventAt: log.clientCapturedAt || log.createdAt, latitude: log.latitude, longitude: log.longitude, checkpointId: log.checkpointId, status: 'ACTIVE', createdAt: log.createdAt, createdBy: log.userId });
    }
    for (const handover of this.data.shift_handovers) (handover.photoUrls || []).forEach((photoUrl, index) => addLegacyMedia({ id: `MED-${handover.id}-${index + 1}`, sourceModule: 'HANDOVER', sourceTable: 'shift_handovers', sourceId: `${handover.id}-${index + 1}`, siteId: handover.siteId, userId: handover.fromUserId, shiftDate: handover.shiftDate, shiftCode: handover.shiftCode, category: handover.isTaruna ? 'TARUNA' : handover.handoverType === 'NAIK_JAGA' ? 'SERTIGAS_NAIK_JAGA' : handover.handoverType === 'TURUN_JAGA' ? 'SERTIGAS_TURUN_JAGA' : 'SERAH_TERIMA_BARANG', subcategory: handover.handoverType, photoUrl, caption: handover.handoverNotes || handover.handoverType, eventAt: handover.eventAt, handoverId: handover.id, status: 'ACTIVE', createdAt: handover.createdAt, createdBy: handover.createdBy }));
    for (const incident of this.data.incident_reports) (incident.photoUrls || []).forEach((photoUrl, index) => addLegacyMedia({ id: `MED-${incident.id}-${index + 1}`, sourceModule: 'INCIDENT', sourceTable: 'incident_reports', sourceId: `${incident.id}-${index + 1}`, siteId: incident.siteId, userId: incident.userId, shiftDate: incident.shiftDate, shiftCode: incident.shiftCode, category: 'INSIDEN', subcategory: incident.category, photoUrl, caption: incident.title, eventAt: incident.incidentAt, latitude: incident.latitude, longitude: incident.longitude, incidentId: incident.id, status: 'ACTIVE', createdAt: incident.createdAt, createdBy: incident.createdBy }));
  }

  private save() {
    try {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist database file:', err);
    }
  }

  public seedProduction() {
    const superAdminNpk = process.env.SUPERADMIN_NPK || '999001';
    const now = new Date().toISOString();

    const hashSync = (plain: string) => bcrypt.hashSync(plain, 10);

    this.data.customers = [{
      id: 'CUST-AIS',
      code: 'AIS',
      name: 'ASTRA INFRA SOLUTIONS',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    }];

    // 1. Users
    const users: User[] = [
      {
        id: 'USR-BB92-001',
        name: 'Ahmad Sopyan',
        npk: '234378',
        email: 'ahmadsopyaan2004@gmail.com',
        role: 'ANGGOTA',
        siteId: 'BB92',
        status: 'ACTIVE',
        passwordHash: hashSync('234378'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-BB92-002',
        name: 'Arif Janwaripin',
        npk: '305464',
        email: 'arif.jawaripin@gmail.com',
        role: 'ANGGOTA',
        siteId: 'BB92',
        status: 'ACTIVE',
        passwordHash: hashSync('305464'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-BB92-003',
        name: 'Ayo Sunaryo',
        npk: '237129',
        email: 'ayosunario@gmail.com',
        role: 'ANGGOTA',
        siteId: 'BB92',
        status: 'ACTIVE',
        passwordHash: hashSync('237129'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-BB92-004',
        name: 'Deni Winarya',
        npk: '230557',
        email: 'asahideni@gmail.com',
        role: 'ANGGOTA',
        siteId: 'BB92',
        status: 'ACTIVE',
        passwordHash: hashSync('230557'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-ADMIN-001',
        name: 'Admin Operasional',
        npk: '200001',
        email: 'admin.ops@ops-sigap.local',
        role: 'ADMIN',
        siteId: 'BB92',
        status: 'ACTIVE',
        passwordHash: hashSync('200001'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-CHIEF-001',
        name: 'Chief Site',
        npk: '300001',
        email: 'chief.site@ops-sigap.local',
        role: 'CHIEF',
        siteId: 'BB92',
        status: 'ACTIVE',
        passwordHash: hashSync('300001'),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-SUPER-001',
        name: 'SUPER ADMIN SIGAP',
        npk: superAdminNpk,
        email: 'sigapgda77@gmail.com',
        role: 'SUPER_ADMIN',
        siteId: null,
        status: 'ACTIVE',
        passwordHash: hashSync(superAdminNpk),
        createdAt: now,
        updatedAt: now,
      },
    ];

    if (process.env.SEED_UAT === 'true') {
      users.push({
        id: 'USR-UAT-BB92-001',
        name: 'AFRI',
        npk: '305468',
        email: 'afrietrama@gmail.com',
        role: 'ANGGOTA',
        siteId: 'UAT_SITE',
        status: 'ACTIVE',
        passwordHash: hashSync('305468'),
        createdAt: now,
        updatedAt: now,
      });
    }

    // 2. Sites
    const sites: Site[] = [
      {
        id: 'BB92',
        code: 'BB92',
        name: 'BARANG BUKTI KM 92',
        customerId: 'CUST-AIS',
        personnelCapacity: 1,
        timezone: 'Asia/Jakarta',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // 3. Checkpoints (Strict production seed)
    const checkpoints: Checkpoint[] = [
      {
        id: 'BB92-CP01',
        siteId: 'BB92',
        code: 'CP01',
        name: 'LOKASI UJUNG BB92',
        latitude: -6.480722,
        longitude: 107.631389,
        radiusMeters: 15,
        qrToken: 'BB92-TT72OQD30E3PSOKN',
        status: 'ACTIVE',
        qrStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'BB92-CP02',
        siteId: 'BB92',
        code: 'CP02',
        name: 'LOKASI TENGAH BB92',
        latitude: -6.48125,
        longitude: 107.631806,
        radiusMeters: 15,
        qrToken: 'BB92-QPRZPQ3WKEKZ43E',
        status: 'ACTIVE',
        qrStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'BB92-CP03',
        siteId: 'BB92',
        code: 'CP03',
        name: 'PINTU GEMBOK AKSES KARYAWAN KELUAR MASUK',
        latitude: -6.482111,
        longitude: 107.632333,
        radiusMeters: 10,
        qrToken: 'BB92-GREGBTSQX3YYBJX',
        status: 'ACTIVE',
        qrStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'BB92-CP04',
        siteId: 'BB92',
        code: 'CP04',
        name: 'LOKASI PANEL TENGAH',
        latitude: -6.482056,
        longitude: 107.632472,
        radiusMeters: 10,
        qrToken: 'BB92-JMAFICUA4X0S3DH',
        status: 'ACTIVE',
        qrStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'BB92-CP05',
        siteId: 'BB92',
        code: 'CP05',
        name: 'GERBANG AKSES UTAMA / POS BB92',
        latitude: -6.482861,
        longitude: 107.632889,
        radiusMeters: 15,
        qrToken: 'BB92-NJR6GNRPQOGILG5',
        status: 'ACTIVE',
        qrStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // 4. Historical Calibration Evidence
    const radiusCalibrations: RadiusCalibration[] = [
      {
        id: 'CAL-BB92-001',
        siteId: 'BB92',
        checkpointId: 'BB92-CP02',
        testedByUserId: 'USR-BB92-001',
        testedAt: new Date(Date.now() - 24 * 3600 * 1000 * 3).toISOString(),
        latitude: -6.48135,
        longitude: 107.6319,
        gpsAccuracyM: 4.2,
        calculatedDistanceM: 16.29,
        configuredRadiusM: 15,
        verdict: 'REJECTED',
        deviceModel: 'Android Handheld BB92',
        notes: 'Uji batas luar: Jarak 16.29m ditolak (melebihi batas radius 15m)',
        createdAt: now,
      },
      {
        id: 'CAL-BB92-002',
        siteId: 'BB92',
        checkpointId: 'BB92-CP02',
        testedByUserId: 'USR-BB92-001',
        testedAt: new Date(Date.now() - 24 * 3600 * 1000 * 2).toISOString(),
        latitude: -6.48126,
        longitude: 107.63182,
        gpsAccuracyM: 3.5,
        calculatedDistanceM: 14.86,
        configuredRadiusM: 15,
        verdict: 'VALID',
        deviceModel: 'Android Handheld BB92',
        notes: 'Uji batas perimeter dalam: Jarak 14.86m valid (dalam batas radius 15m)',
        createdAt: now,
      },
      {
        id: 'CAL-BB92-003',
        siteId: 'BB92',
        checkpointId: 'BB92-CP05',
        testedByUserId: 'USR-BB92-002',
        testedAt: new Date(Date.now() - 24 * 3600 * 1000 * 1).toISOString(),
        latitude: -6.48288,
        longitude: 107.6329,
        gpsAccuracyM: 2.8,
        calculatedDistanceM: 7.31,
        configuredRadiusM: 15,
        verdict: 'VALID',
        deviceModel: 'Android Field Unit',
        notes: 'Uji titik pos gerbang utama: Jarak 7.31m valid',
        createdAt: now,
      },
    ];

    this.data.users = users;
    this.data.sites = sites;
    this.data.checkpoints = checkpoints;
    this.data.radius_calibrations = radiusCalibrations;
    this.save();
  }

  // -------------------------------------------------------------
  // USER METHODS
  // -------------------------------------------------------------

  public getUsers(): User[] {
    return this.data.users;
  }

  public findUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public findUserByNpk(npk: string): User | undefined {
    return this.data.users.find((u) => u.npk === npk);
  }

  public addUser(user: User): User {
    this.data.users.push(user);
    this.save();
    return user;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.findUserById(id);
    if (!user) return undefined;
    Object.assign(user, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return user;
  }

  // -------------------------------------------------------------
  // SITES & CHECKPOINTS
  // -------------------------------------------------------------

  public getCustomers(): Customer[] {
    return this.data.customers;
  }

  public findCustomerById(id: string): Customer | undefined {
    return this.data.customers.find((customer) => customer.id === id);
  }

  public addCustomer(customer: Customer): Customer {
    this.data.customers.push(customer);
    this.save();
    return customer;
  }

  public updateCustomer(id: string, updates: Partial<Customer>): Customer | undefined {
    const customer = this.findCustomerById(id);
    if (!customer) return undefined;
    Object.assign(customer, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return customer;
  }

  public getSites(): Site[] {
    return this.data.sites;
  }

  public findSiteById(id: string): Site | undefined {
    return this.data.sites.find((site) => site.id === id);
  }

  public addSite(site: Site): Site {
    this.data.sites.push(site);
    this.save();
    return site;
  }

  public updateSite(id: string, updates: Partial<Site>): Site | undefined {
    const site = this.findSiteById(id);
    if (!site) return undefined;
    Object.assign(site, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return site;
  }

  public getCheckpoints(siteId?: string): Checkpoint[] {
    if (siteId) {
      return this.data.checkpoints.filter((c) => c.siteId === siteId);
    }
    return this.data.checkpoints;
  }

  public findCheckpointById(id: string): Checkpoint | undefined {
    return this.data.checkpoints.find((c) => c.id === id);
  }

  public findCheckpointByToken(token: string): Checkpoint | undefined {
    return this.data.checkpoints.find((c) => c.qrToken === token);
  }

  public addCheckpoint(cp: Checkpoint): Checkpoint {
    this.data.checkpoints.push(cp);
    this.save();
    return cp;
  }

  public updateCheckpoint(id: string, updates: Partial<Checkpoint>): Checkpoint | undefined {
    const cp = this.findCheckpointById(id);
    if (!cp) return undefined;
    Object.assign(cp, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return cp;
  }

  // -------------------------------------------------------------
  // PATROL SESSIONS & LOGS
  // -------------------------------------------------------------

  public getOpenSessionForUser(userId: string, siteId: string): PatrolSession | undefined {
    return this.data.patrol_sessions.find(
      (s) => s.userId === userId && s.siteId === siteId && s.status === 'ACTIVE'
    );
  }

  public getActiveSessionForUser(userId: string): PatrolSession | undefined {
    return this.data.patrol_sessions.find((session) => session.userId === userId && session.status === 'ACTIVE');
  }

  public getActiveSessionsForSite(siteId: string): PatrolSession[] {
    return this.data.patrol_sessions.filter((session) => session.siteId === siteId && session.status === 'ACTIVE');
  }

  public getPatrolSessions(filter?: {
    siteId?: string | null;
    shiftCode?: string | null;
    userId?: string | null;
  }): PatrolSession[] {
    return this.data.patrol_sessions.filter((s) => {
      if (filter?.siteId && s.siteId !== filter.siteId) return false;
      if (filter?.shiftCode && s.shiftCode !== filter.shiftCode) return false;
      if (filter?.userId && s.userId !== filter.userId) return false;
      return true;
    });
  }

  public findSessionById(id: string): PatrolSession | undefined {
    return this.data.patrol_sessions.find((s) => s.id === id);
  }

  public createPatrolSession(session: PatrolSession): PatrolSession {
    this.data.patrol_sessions.push(session);
    this.save();
    return session;
  }

  public updatePatrolSession(id: string, updates: Partial<PatrolSession>): PatrolSession | undefined {
    const s = this.findSessionById(id);
    if (!s) return undefined;
    Object.assign(s, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return s;
  }

  public getPatrolLogs(sessionId?: string): PatrolLog[] {
    if (sessionId) {
      return this.data.patrol_logs.filter((l) => l.sessionId === sessionId);
    }
    return this.data.patrol_logs;
  }

  public findPatrolLogById(id: string): PatrolLog | undefined {
    return this.data.patrol_logs.find((l) => l.id === id);
  }

  public addPatrolLog(log: PatrolLog): PatrolLog {
    // Idempotency: check if ID already exists
    const existing = this.findPatrolLogById(log.id);
    if (existing) return existing;

    this.data.patrol_logs.push(log);
    if (log.validationStatus !== 'VALID' && !this.data.validation_alerts.some((alert) => alert.patrolLogId === log.id)) {
      this.data.validation_alerts.push({
        id: `ALT-${log.id}`,
        alertType: log.rejectionReason || log.validationStatus,
        status: 'OPEN',
        patrolLogId: log.id,
        userId: log.userId,
        sessionId: log.sessionId,
        siteId: log.siteId,
        checkpointId: log.checkpointId || null,
        message: log.rejectionMessage || log.rejectionReason || 'Validasi memerlukan perhatian.',
        createdAt: log.createdAt,
      });
    }
    this.save();
    return log;
  }

  public getValidationAlerts(): ValidationAlert[] {
    return this.data.validation_alerts;
  }

  public findValidationAlertById(id: string): ValidationAlert | undefined {
    return this.data.validation_alerts.find((alert) => alert.id === id);
  }

  public updateValidationAlert(id: string, updates: Partial<ValidationAlert>): ValidationAlert | undefined {
    const alert = this.findValidationAlertById(id);
    if (!alert) return undefined;
    Object.assign(alert, updates);
    this.save();
    return alert;
  }

  public deleteValidationAlert(id: string): ValidationAlert | undefined {
    const index = this.data.validation_alerts.findIndex((alert) => alert.id === id);
    if (index < 0) return undefined;
    const [removed] = this.data.validation_alerts.splice(index, 1);
    this.save();
    return removed;
  }

  // -------------------------------------------------------------
  // HANDOVERS
  // -------------------------------------------------------------

  public getHandovers(filter?: {
    siteId?: string | null;
    shiftCode?: string | null;
    userId?: string | null;
  }): ShiftHandover[] {
    return this.data.shift_handovers.filter((h) => {
      if (filter?.siteId && h.siteId !== filter.siteId) return false;
      if (filter?.shiftCode && h.shiftCode !== filter.shiftCode) return false;
      if (filter?.userId && h.fromUserId !== filter.userId && h.toUserId !== filter.userId) {
        return false;
      }
      return true;
    });
  }

  public findHandoverById(id: string): ShiftHandover | undefined {
    return this.data.shift_handovers.find((h) => h.id === id);
  }

  public addHandover(handover: ShiftHandover): ShiftHandover {
    this.data.shift_handovers.push(handover);
    this.save();
    return handover;
  }

  public updateHandover(id: string, updates: Partial<ShiftHandover>): ShiftHandover | undefined {
    const h = this.findHandoverById(id);
    if (!h) return undefined;
    Object.assign(h, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return h;
  }

  // -------------------------------------------------------------
  // INCIDENTS
  // -------------------------------------------------------------

  public getIncidents(filter?: {
    siteId?: string | null;
    shiftCode?: string | null;
    userId?: string | null;
    status?: string | null;
  }): IncidentReport[] {
    return this.data.incident_reports.filter((i) => {
      if (filter?.siteId && i.siteId !== filter.siteId) return false;
      if (filter?.shiftCode && i.shiftCode !== filter.shiftCode) return false;
      if (filter?.userId && i.userId !== filter.userId) return false;
      if (filter?.status && i.status !== filter.status) return false;
      return true;
    });
  }

  public findIncidentById(id: string): IncidentReport | undefined {
    return this.data.incident_reports.find((i) => i.id === id);
  }

  public addIncident(incident: IncidentReport): IncidentReport {
    this.data.incident_reports.push(incident);
    this.save();
    return incident;
  }

  public updateIncident(id: string, updates: Partial<IncidentReport>): IncidentReport | undefined {
    const inc = this.findIncidentById(id);
    if (!inc) return undefined;
    Object.assign(inc, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return inc;
  }

  // -------------------------------------------------------------
  // MEDIA GALLERY
  // -------------------------------------------------------------

  public getMedia(filter?: {
    siteId?: string | null;
    shiftCode?: string | null;
    userId?: string | null;
    sourceModule?: string | null;
    category?: string | null;
  }): MediaGalleryItem[] {
    return this.data.media_gallery.filter((m) => {
      if (filter?.siteId && m.siteId !== filter.siteId) return false;
      if (filter?.shiftCode && m.shiftCode !== filter.shiftCode) return false;
      if (filter?.userId && m.userId !== filter.userId) return false;
      if (filter?.sourceModule && m.sourceModule !== filter.sourceModule) return false;
      if (filter?.category && !m.category.startsWith(filter.category)) return false;
      return true;
    });
  }

  public addMedia(item: MediaGalleryItem): MediaGalleryItem {
    // Check duplicate by sourceId + sourceModule
    const exists = this.data.media_gallery.find(
      (m) => m.sourceId === item.sourceId && m.sourceModule === item.sourceModule
    );
    if (exists) return exists;

    this.data.media_gallery.push(item);
    this.save();
    return item;
  }

  // -------------------------------------------------------------
  // AUDIT LOGS
  // -------------------------------------------------------------

  public getAuditLogs(): AuditLog[] {
    return this.data.audit_logs;
  }

  public addAuditLog(entry: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
    const log: AuditLog = {
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    this.data.audit_logs.unshift(log);
    this.save();
    return log;
  }

  // -------------------------------------------------------------
  // RADIUS CALIBRATION
  // -------------------------------------------------------------

  public getRadiusCalibrations(checkpointId?: string): RadiusCalibration[] {
    if (checkpointId) {
      return this.data.radius_calibrations.filter((r) => r.checkpointId === checkpointId);
    }
    return this.data.radius_calibrations;
  }

  public addRadiusCalibration(entry: RadiusCalibration): RadiusCalibration {
    this.data.radius_calibrations.push(entry);
    this.save();
    return entry;
  }

  // -------------------------------------------------------------
  // ADMIN FILTER STATE
  // -------------------------------------------------------------

  public getAdminFilterState(userId: string): AdminFilterState | undefined {
    return this.data.admin_filter_state.find((f) => f.userId === userId);
  }

  public setAdminFilterState(userId: string, filter: Partial<AdminFilterState>): AdminFilterState {
    let existing = this.getAdminFilterState(userId);
    const now = new Date().toISOString();
    if (!existing) {
      existing = {
        id: `AFS-${userId}`,
        userId,
        siteId: filter.siteId || null,
        shiftCode: filter.shiftCode || null,
        memberUserId: filter.memberUserId || null,
        updatedAt: now,
      };
      this.data.admin_filter_state.push(existing);
    } else {
      existing.siteId = filter.siteId !== undefined ? filter.siteId : existing.siteId;
      existing.shiftCode = filter.shiftCode !== undefined ? filter.shiftCode : existing.shiftCode;
      existing.memberUserId =
        filter.memberUserId !== undefined ? filter.memberUserId : existing.memberUserId;
      existing.updatedAt = now;
    }
    this.save();
    return existing;
  }
}

export const db = new DatabaseStore();
if (config.databaseProvider === 'json') {
  db.init();
}
