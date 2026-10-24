/**
 * OPS SIGAP — IndexedDB Offline Queue Manager
 * Reliable, idempotent offline-first sync for field patrol scans.
 */

import { api } from './api';

export interface OfflineQueueItem {
  idempotencyId: string;
  type: 'PATROL_SCAN';
  userId?: string;
  sessionId: string;
  qrToken: string;
  checkpointCode?: string;
  checkpointName?: string;
  latitude: number;
  longitude: number;
  gpsAccuracyM?: number;
  photoUrl?: string;
  observationStatus?: 'AMAN' | 'TEMUAN' | 'INSIDEN';
  notes?: string;
  clientCapturedAt: string;
  syncStatus: 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'SYNC_FAILED';
  errorMessage?: string;
  attemptCount?: number;
  lastAttemptAt?: number;
  createdAt: number;
}

export interface OfflineQueueSummary {
  total: number;
  pending: number;
  failed: number;
  syncing: number;
}

const DB_NAME = 'ops_sigap_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'queue';
const SNAPSHOT_STORE_NAME = 'patrol_snapshots';

export interface PatrolOfflineSnapshot {
  userId: string;
  session: any;
  site: any | null;
  checkpoints: any[];
  logs: any[];
  rounds: Array<{ roundNumber: number; completed: number; required: number; checkpointIds: string[] }>;
  currentRound: number;
  targetRounds: number;
  capturedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak tersedia pada perangkat ini.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyId' });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB gagal dibuka.'));
  });
}

async function waitTransaction(tx: IDBTransaction): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transaksi IndexedDB gagal.'));
    tx.onabort = () => reject(tx.error || new Error('Transaksi IndexedDB dibatalkan.'));
  });
}

class OfflineQueueManager {
  private listeners = new Set<() => void>();
  private isSyncing = false;
  private activeUserId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.activeUserId) return;
        console.log('[OPS SIGAP Offline] Connection restored, recovering queue...');
        void this.recoverInterruptedSync(this.activeUserId)
          .then(() => this.syncNow(this.activeUserId!))
          .catch((error) => {
            console.warn('[OPS SIGAP Offline] Auto recovery failed:', error);
          });
      });
    }
  }

  public subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public setActiveUser(userId: string | null) {
    this.activeUserId = userId;
  }

  public async enqueuePatrolScan(
    item: Omit<OfflineQueueItem, 'syncStatus' | 'createdAt' | 'attemptCount' | 'lastAttemptAt'>,
  ): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: OfflineQueueItem = {
        ...item,
        syncStatus: 'PENDING_SYNC',
        attemptCount: 0,
        createdAt: Date.now(),
      };

      store.put(record);
      await waitTransaction(tx);
      db.close();
      this.notify();

      if (
        typeof navigator !== 'undefined'
        && navigator.onLine
        && item.userId
        && item.userId === this.activeUserId
      ) {
        void this.syncNow(item.userId);
      }
    } catch (err) {
      console.error('[OPS SIGAP Offline] Failed to enqueue item:', err);
      throw err instanceof Error ? err : new Error('Data offline gagal disimpan ke perangkat.');
    }
  }

  public async getQueueItems(userId?: string): Promise<OfflineQueueItem[]> {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      const items = await new Promise<OfflineQueueItem[]>((resolve, reject) => {
        req.onsuccess = () => resolve((req.result || []) as OfflineQueueItem[]);
        req.onerror = () => reject(req.error || new Error('Antrean lokal gagal dibaca.'));
      });
      await waitTransaction(tx);
      db.close();

      const scoped = userId
        ? items.filter((item) => item.userId === userId)
        : items;

      return scoped.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      console.warn('[OPS SIGAP Offline] Failed to read queue:', error);
      return [];
    }
  }

  public async savePatrolSnapshot(
    userId: string,
    snapshot: Omit<PatrolOfflineSnapshot, 'userId' | 'capturedAt'>,
  ): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE_NAME).put({
        ...snapshot,
        userId,
        capturedAt: Date.now(),
      } satisfies PatrolOfflineSnapshot);
      await waitTransaction(tx);
      db.close();
    } catch (error) {
      console.warn('[OPS SIGAP Offline] Failed to save patrol snapshot:', error);
    }
  }

  public async getPatrolSnapshot(userId: string): Promise<PatrolOfflineSnapshot | null> {
    try {
      const db = await openDb();
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readonly');
      const request = tx.objectStore(SNAPSHOT_STORE_NAME).get(userId);
      const snapshot = await new Promise<PatrolOfflineSnapshot | null>((resolve, reject) => {
        request.onsuccess = () => resolve((request.result as PatrolOfflineSnapshot | undefined) || null);
        request.onerror = () => reject(request.error || new Error('Snapshot patroli gagal dibaca.'));
      });
      await waitTransaction(tx);
      db.close();
      return snapshot;
    } catch (error) {
      console.warn('[OPS SIGAP Offline] Failed to read patrol snapshot:', error);
      return null;
    }
  }

  public async clearPatrolSnapshot(userId: string): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE_NAME).delete(userId);
      await waitTransaction(tx);
      db.close();
    } catch (error) {
      console.warn('[OPS SIGAP Offline] Failed to clear patrol snapshot:', error);
    }
  }

  public async getSummary(userId?: string): Promise<OfflineQueueSummary> {
    const items = await this.getQueueItems(userId);
    return {
      total: items.length,
      pending: items.filter((item) => item.syncStatus === 'PENDING_SYNC').length,
      failed: items.filter((item) => item.syncStatus === 'SYNC_FAILED').length,
      syncing: items.filter((item) => item.syncStatus === 'SYNCING').length,
    };
  }

  public async getPendingCount(userId?: string): Promise<number> {
    const summary = await this.getSummary(userId);
    return summary.pending + summary.failed + summary.syncing;
  }

  public async getPendingForSession(sessionId: string, userId?: string): Promise<OfflineQueueItem[]> {
    const items = await this.getQueueItems(userId);
    return items.filter(
      (item) =>
        item.sessionId === sessionId
        && ['PENDING_SYNC', 'SYNC_FAILED', 'SYNCING'].includes(item.syncStatus),
    );
  }

  public async claimLegacyItemsForSession(sessionId: string, userId: string): Promise<number> {
    const all = await this.getQueueItems();
    const legacy = all.filter((item) => !item.userId && item.sessionId === sessionId);
    if (legacy.length === 0) return 0;

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    legacy.forEach((item) => {
      store.put({ ...item, userId });
    });
    await waitTransaction(tx);
    db.close();
    this.notify();
    return legacy.length;
  }

  public async recoverInterruptedSync(userId: string): Promise<number> {
    const items = await this.getQueueItems(userId);
    const interrupted = items.filter((item) => item.syncStatus === 'SYNCING');
    if (interrupted.length === 0) return 0;

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    interrupted.forEach((item) => {
      store.put({
        ...item,
        syncStatus: 'PENDING_SYNC',
        errorMessage: 'Sinkronisasi sebelumnya terputus. Data dipulihkan dan siap dicoba kembali.',
      });
    });
    await waitTransaction(tx);
    db.close();
    this.notify();
    return interrupted.length;
  }

  public async retryItem(idempotencyId: string, userId: string): Promise<{ synced: number; failed: number }> {
    const items = await this.getQueueItems(userId);
    const item = items.find((candidate) => candidate.idempotencyId === idempotencyId);
    if (!item) return { synced: 0, failed: 0 };

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      ...item,
      syncStatus: 'PENDING_SYNC',
      errorMessage: undefined,
    });
    await waitTransaction(tx);
    db.close();
    this.notify();

    return this.syncNow(userId, [idempotencyId]);
  }

  public async syncNow(
    userId: string | null = this.activeUserId,
    onlyIds?: string[],
  ): Promise<{ synced: number; failed: number }> {
    if (!userId) return { synced: 0, failed: 0 };
    if (this.isSyncing) return { synced: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.notify();

    let synced = 0;
    let failed = 0;

    try {
      await this.recoverInterruptedSync(userId);

      const items = await this.getQueueItems(userId);
      const targetIds = onlyIds ? new Set(onlyIds) : null;
      const pending = items
        .filter(
          (item) =>
            ['PENDING_SYNC', 'SYNC_FAILED'].includes(item.syncStatus)
            && (!targetIds || targetIds.has(item.idempotencyId)),
        )
        .sort((a, b) => a.createdAt - b.createdAt);

      if (pending.length === 0) {
        return { synced: 0, failed: 0 };
      }

      const attemptAt = Date.now();
      const db = await openDb();
      const markTx = db.transaction(STORE_NAME, 'readwrite');
      const markStore = markTx.objectStore(STORE_NAME);
      pending.forEach((item) => {
        markStore.put({
          ...item,
          syncStatus: 'SYNCING',
          errorMessage: undefined,
          attemptCount: (item.attemptCount || 0) + 1,
          lastAttemptAt: attemptAt,
        });
      });
      await waitTransaction(markTx);

      const response = await api.syncQueue(pending);
      const resultById = new Map(
        (response.results || []).map((result: any) => [String(result.idempotencyId), result]),
      );

      const resultTx = db.transaction(STORE_NAME, 'readwrite');
      const resultStore = resultTx.objectStore(STORE_NAME);

      for (const item of pending) {
        const result: any = resultById.get(item.idempotencyId);
        if (result?.status === 'SYNCED') {
          resultStore.delete(item.idempotencyId);
          synced += 1;
          continue;
        }

        resultStore.put({
          ...item,
          syncStatus: 'SYNC_FAILED',
          attemptCount: (item.attemptCount || 0) + 1,
          lastAttemptAt: attemptAt,
          errorMessage:
            result?.message
            || result?.error
            || 'Server tidak mengembalikan hasil sinkronisasi untuk data ini.',
        });
        failed += 1;
      }

      await waitTransaction(resultTx);
      db.close();
    } catch (err: any) {
      console.error('[OPS SIGAP Offline] Sync batch error:', err);
      const errorMessage = err?.message || 'Koneksi ke server terputus saat sinkronisasi.';

      try {
        const items = await this.getQueueItems(userId);
        const targetIds = onlyIds ? new Set(onlyIds) : null;
        const affected = items.filter(
          (item) =>
            item.syncStatus === 'SYNCING'
            && (!targetIds || targetIds.has(item.idempotencyId)),
        );

        if (affected.length > 0) {
          const db = await openDb();
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          affected.forEach((item) => {
            store.put({
              ...item,
              syncStatus: 'SYNC_FAILED',
              errorMessage,
              lastAttemptAt: Date.now(),
            });
          });
          await waitTransaction(tx);
          db.close();
          failed += affected.length;
        }
      } catch (recoveryError) {
        console.error('[OPS SIGAP Offline] Failed to persist sync error:', recoveryError);
      }
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { synced, failed };
  }

  public isCurrentlySyncing() {
    return this.isSyncing;
  }
}

export const offlineQueue = new OfflineQueueManager();
