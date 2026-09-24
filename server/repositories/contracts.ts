import type { PoolClient } from 'pg';
import type {
  AuditLog,
  Checkpoint,
  Customer,
  AdminFilterState,
  IncidentReport,
  MediaGalleryItem,
  PatrolLog,
  PatrolSession,
  ShiftCode,
  ShiftHandover,
  RadiusCalibration,
  Site,
  User,
  ValidationAlert,
  ValidationAlertStatus,
} from '../../src/types/ops';

export interface PageRequest { limit: number; offset: number }
export interface Page<T> { items: T[]; total: number; limit: number; offset: number; hasMore: boolean }
export interface RepositoryHealth { provider: 'json' | 'postgres'; database: 'connected' | 'disconnected' }

export interface UserAssignmentChange {
  customerId: string | null;
  siteId: string | null;
  effectiveAt: string;
  changedBy: string | null;
}
export interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  findByNpk(npk: string): Promise<User | undefined>;
  list(page: PageRequest): Promise<Page<User>>;
  create(user: User): Promise<User>;
  update(id: string, updates: Partial<User>, assignment?: UserAssignmentChange): Promise<User | undefined>;
  resetPassword(id: string, passwordHash: string, changedAt: string): Promise<User | undefined>;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | undefined>;
  list(page: PageRequest): Promise<Page<Customer>>;
  create(customer: Customer): Promise<Customer>;
  update(id: string, updates: Partial<Customer>): Promise<Customer | undefined>;
}

export interface SiteRepository {
  findById(id: string): Promise<Site | undefined>;
  list(page: PageRequest): Promise<Page<Site>>;
  create(site: Site): Promise<Site>;
  update(id: string, updates: Partial<Site>): Promise<Site | undefined>;
}

export interface CheckpointRepository {
  findById(id: string): Promise<Checkpoint | undefined>;
  findByToken(token: string): Promise<Checkpoint | undefined>;
  list(page: PageRequest): Promise<Page<Checkpoint>>;
  listBySite(siteId: string): Promise<Checkpoint[]>;
  create(checkpoint: Checkpoint): Promise<Checkpoint>;
  update(id: string, updates: Partial<Checkpoint>): Promise<Checkpoint | undefined>;
  replaceToken(id: string, token: string, actorUserId: string, activate: boolean): Promise<Checkpoint | undefined>;
}

export interface StartSessionInput { session: PatrolSession; personnelCapacity: number }
export interface SessionFilter {
  userId?: string;
  siteId?: string;
  shiftCode?: ShiftCode;
  status?: PatrolSession['status'];
  operationalDate?: string;
}
export interface SessionRepository {
  findById(id: string): Promise<PatrolSession | undefined>;
  getActiveByUser(userId: string): Promise<PatrolSession | undefined>;
  startAtomic(input: StartSessionInput): Promise<PatrolSession>;
  update(id: string, updates: Partial<PatrolSession>, client?: PoolClient): Promise<PatrolSession | undefined>;
  completeAtomic(id: string, userId: string, updates: Partial<PatrolSession>): Promise<PatrolSession>;
  forceCloseAtomic(id: string, actorUserId: string, actorRole: string, reason: string): Promise<PatrolSession>;
  countActiveBySite(siteId: string): Promise<number>;
  list(page: PageRequest): Promise<Page<PatrolSession>>;
  listFiltered(filter: SessionFilter, page: PageRequest): Promise<Page<PatrolSession>>;
}

export interface PatrolRepository {
  findById(id: string): Promise<PatrolLog | undefined>;
  addLogAtomic(log: PatrolLog): Promise<PatrolLog>;
  listBySession(sessionId: string, page: PageRequest): Promise<Page<PatrolLog>>;
  listAllBySession(sessionId: string): Promise<PatrolLog[]>;
  countAll(): Promise<number>;
  overrideValidation(id: string, newStatus: PatrolLog['validationStatus'], reason: string): Promise<PatrolLog | undefined>;
}

export interface HandoverFilter {
  siteId?: string;
  shiftCode?: ShiftCode;
  userId?: string;
}
export interface HandoverRepository {
  findById(id: string): Promise<ShiftHandover | undefined>;
  list(filter: HandoverFilter, page: PageRequest): Promise<Page<ShiftHandover>>;
  create(handover: ShiftHandover): Promise<ShiftHandover>;
  update(id: string, updates: Partial<ShiftHandover>): Promise<ShiftHandover | undefined>;
}

export interface IncidentFilter {
  siteId?: string;
  shiftCode?: ShiftCode;
  userId?: string;
  status?: string;
}
export interface IncidentRepository {
  findById(id: string): Promise<IncidentReport | undefined>;
  list(filter: IncidentFilter, page: PageRequest): Promise<Page<IncidentReport>>;
  create(incident: IncidentReport): Promise<IncidentReport>;
  update(id: string, updates: Partial<IncidentReport>): Promise<IncidentReport | undefined>;
}

export interface AlertRepository {
  findById(id: string): Promise<ValidationAlert | undefined>;
  list(status: ValidationAlertStatus | undefined, page: PageRequest): Promise<Page<ValidationAlert>>;
  transition(id: string, action: 'REVIEW' | 'CLOSE' | 'REOPEN', actorUserId: string, closeNote?: string): Promise<ValidationAlert>;
}

export interface AdminStateRepository {
  get(userId: string): Promise<AdminFilterState | undefined>;
  set(userId: string, updates: Partial<AdminFilterState>): Promise<AdminFilterState>;
}

export interface RadiusCalibrationRepository {
  list(page: PageRequest): Promise<Page<RadiusCalibration>>;
  create(entry: RadiusCalibration): Promise<RadiusCalibration>;
}

export interface MediaFilters {
  customerId?: string;
  siteId?: string;
  userId?: string;
  sessionId?: string;
  operationalDate?: string;
  shiftCode?: ShiftCode;
  documentType?: string;
  from?: string;
  to?: string;
}
export interface MediaRepository {
  list(filters: MediaFilters, page: PageRequest): Promise<Page<MediaGalleryItem>>;
  counts(filters: Omit<MediaFilters, 'documentType'>): Promise<Record<string, number>>;
  add(item: MediaGalleryItem, sessionId?: string | null, customerId?: string | null): Promise<MediaGalleryItem>;
}

export interface AuditRepository {
  append(entry: Omit<AuditLog, 'id' | 'createdAt'> & { actorRole?: string; metadata?: unknown }): Promise<AuditLog>;
  list(page: PageRequest): Promise<Page<AuditLog>>;
}

export interface RepositoryBundle {
  provider: 'json' | 'postgres';
  health(): Promise<RepositoryHealth>;
  users: UserRepository;
  customers: CustomerRepository;
  sites: SiteRepository;
  checkpoints: CheckpointRepository;
  sessions: SessionRepository;
  patrol: PatrolRepository;
  handovers: HandoverRepository;
  incidents: IncidentRepository;
  alerts: AlertRepository;
  adminState: AdminStateRepository;
  radiusCalibrations: RadiusCalibrationRepository;
  media: MediaRepository;
  audit: AuditRepository;
}

export class RepositoryError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export function normalizePage(page: Partial<PageRequest>): PageRequest {
  return {
    limit: Math.min(500, Math.max(1, Number(page.limit) || 48)),
    offset: Math.max(0, Number(page.offset) || 0),
  };
}

export function toPage<T>(items: T[], total: number, page: PageRequest): Page<T> {
  return { items, total, ...page, hasMore: page.offset + items.length < total };
}
