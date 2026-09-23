/**
 * OPS SIGAP — IndexedDB Offline Queue Manager
 * Reliable, idempotent offline-first sync for guards in low-connectivity areas
 */

import { api } from './api';

export interface OfflineQueueItem {
  idempotencyId: string;
  type: 'PATROL_SCAN';
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
  createdAt: number;
}

const DB_NAME = 'ops_sigap_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class OfflineQueueManager {
  private listeners: Set<() => void> = new Set();
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[OPS SIGAP Offline] Connection restored, auto-syncing queue...');
        this.syncNow();
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

  public async enqueuePatrolScan(item: Omit<OfflineQueueItem, 'syncStatus' | 'createdAt'>): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: OfflineQueueItem = {
        ...item,
        syncStatus: 'PENDING_SYNC',
        createdAt: Date.now(),
      };

      store.put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      this.notify();

      // If currently online, attempt immediate background sync
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.syncNow().catch(() => {});
      }
    } catch (err) {
      console.error('[OPS SIGAP Offline] Failed to enqueue item:', err);
    }
  }

  public async getQueueItems(): Promise<OfflineQueueItem[]> {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public async getPendingCount(): Promise<number> {
    const items = await this.getQueueItems();
    return items.filter((i) => i.syncStatus === 'PENDING_SYNC' || i.syncStatus === 'SYNC_FAILED').length;
  }

  public async getPendingForSession(sessionId: string): Promise<OfflineQueueItem[]> {
    const items = await this.getQueueItems();
    return items.filter(
      (i) => i.sessionId === sessionId && (i.syncStatus === 'PENDING_SYNC' || i.syncStatus === 'SYNC_FAILED')
    );
  }

  public async syncNow(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.notify();

    let synced = 0;
    let failed = 0;

    try {
      const items = await this.getQueueItems();
      const pending = items.filter((i) => i.syncStatus === 'PENDING_SYNC' || i.syncStatus === 'SYNC_FAILED');

      if (pending.length === 0) {
        this.isSyncing = false;
        this.notify();
        return { synced: 0, failed: 0 };
      }

      // Mark as syncing in DB
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      pending.forEach((p) => {
        p.syncStatus = 'SYNCING';
        store.put(p);
      });
      await new Promise<void>((res) => (tx.oncomplete = () => res()));

      // Send to server
      const response = await api.syncQueue(pending);

      // Process results
      const tx2 = db.transaction(STORE_NAME, 'readwrite');
      const store2 = tx2.objectStore(STORE_NAME);

      if (response.success && response.results) {
        for (const res of response.results) {
          if (res.status === 'SYNCED') {
            store2.delete(res.idempotencyId);
            synced++;
          } else {
            const item = pending.find((p) => p.idempotencyId === res.idempotencyId);
            if (item) {
              item.syncStatus = 'SYNC_FAILED';
              item.errorMessage = res.message || res.error;
              store2.put(item);
            }
            failed++;
          }
        }
      }

      await new Promise<void>((res) => (tx2.oncomplete = () => res()));
    } catch (err: any) {
      console.error('[OPS SIGAP Offline] Sync batch error:', err);
      // Revert syncing items to PENDING_SYNC
      try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const all = await this.getQueueItems();
        all.filter((i) => i.syncStatus === 'SYNCING').forEach((i) => {
          i.syncStatus = 'PENDING_SYNC';
          store.put(i);
        });
      } catch {}
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
