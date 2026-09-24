import type { PoolClient } from 'pg';
import type { AuditLog, Checkpoint, Customer, MediaGalleryItem, PatrolLog, PatrolSession, Site, User, ValidationAlert, ValidationAlertStatus } from '../../src/types/ops';

export interface PageRequest { limit: number; offset: number }
export interface Page<T> { items: T[]; total: number; limit: number; offset: number; hasMore: boolean }
export interface RepositoryHealth { provider: 'json' | 'postgres'; database: 'connected' | 'disconnected' }

export interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  findByNpk(npk: string): Promise<User | undefined>;
  list(page: PageRequest): Promise<Page<User>>;
}
export interface CustomerRepository { findById(id: string): Promise<Customer | undefined>; list(page: PageRequest): Promise<Page<Customer>> }
export interface SiteRepository { findById(id: string): Promise<Site | undefined>; list(page: PageRequest): Promise<Page<Site>> }
export interface CheckpointRepository { findById(id: string): Promise<Checkpoint | undefined>; findByToken(token: string): Promise<Checkpoint | undefined>; listBySite(siteId: string): Promise<Checkpoint[]> }

export interface StartSessionInput { session: PatrolSession; personnelCapacity: number }
export interface SessionRepository {
  findById(id: string): Promise<PatrolSession | undefined>;
  getActiveByUser(userId: string): Promise<PatrolSession | undefined>;
  startAtomic(input: StartSessionInput): Promise<PatrolSession>;
  update(id: string, updates: Partial<PatrolSession>, client?: PoolClient): Promise<PatrolSession | undefined>;
  list(page: PageRequest): Promise<Page<PatrolSession>>;
}

export interface PatrolRepository {
  addLogAtomic(log: PatrolLog): Promise<PatrolLog>;
  listBySession(sessionId: string, page: PageRequest): Promise<Page<PatrolLog>>;
}
export interface AlertRepository {
  findById(id: string): Promise<ValidationAlert | undefined>;
  list(status: ValidationAlertStatus | undefined, page: PageRequest): Promise<Page<ValidationAlert>>;
  transition(id: string, action: 'REVIEW' | 'CLOSE' | 'REOPEN', actorUserId: string, closeNote?: string): Promise<ValidationAlert>;
}
export interface MediaRepository { list(filters: { siteId?: string; documentType?: string; from?: string; to?: string }, page: PageRequest): Promise<Page<MediaGalleryItem>> }
export interface AuditRepository { append(entry: Omit<AuditLog, 'id' | 'createdAt'> & { actorRole?: string; metadata?: unknown }): Promise<AuditLog>; list(page: PageRequest): Promise<Page<AuditLog>> }

export interface RepositoryBundle {
  provider: 'json' | 'postgres';
  health(): Promise<RepositoryHealth>;
  users: UserRepository;
  customers: CustomerRepository;
  sites: SiteRepository;
  checkpoints: CheckpointRepository;
  sessions: SessionRepository;
  patrol: PatrolRepository;
  alerts: AlertRepository;
  media: MediaRepository;
  audit: AuditRepository;
}

export class RepositoryError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); this.name = 'RepositoryError'; }
}

export function normalizePage(page: Partial<PageRequest>): PageRequest {
  return { limit: Math.min(100, Math.max(1, Number(page.limit) || 48)), offset: Math.max(0, Number(page.offset) || 0) };
}

export function toPage<T>(items: T[], total: number, page: PageRequest): Page<T> {
  return { items, total, ...page, hasMore: page.offset + items.length < total };
}
