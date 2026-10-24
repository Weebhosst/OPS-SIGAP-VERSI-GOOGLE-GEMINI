/**
 * OPS SIGAP — Offline Status & Sync Queue Banner
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { offlineQueue, type OfflineQueueSummary } from '../lib/offlineQueue';

const EMPTY_SUMMARY: OfflineQueueSummary = {
  total: 0,
  pending: 0,
  failed: 0,
  syncing: 0,
};

export const OfflineBanner: React.FC = () => {
  const { user } = useAuth();
  const memberUserId = user?.role === 'ANGGOTA' ? user.id : null;
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [summary, setSummary] = useState<OfflineQueueSummary>(EMPTY_SUMMARY);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const refreshSummary = async () => {
      if (!memberUserId) {
        if (active) {
          setSummary(EMPTY_SUMMARY);
          setIsSyncing(false);
        }
        return;
      }

      const next = await offlineQueue.getSummary(memberUserId);
      if (!active) return;
      setSummary(next);
      setIsSyncing(offlineQueue.isCurrentlySyncing());
    };

    const recoverAndSync = async () => {
      if (!memberUserId) return;
      offlineQueue.setActiveUser(memberUserId);
      await offlineQueue.recoverInterruptedSync(memberUserId);
      await refreshSummary();

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await offlineQueue.syncNow(memberUserId);
        await refreshSummary();
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      void recoverAndSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      void refreshSummary();
    };

    offlineQueue.setActiveUser(memberUserId);
    void recoverAndSync();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribe = offlineQueue.subscribe(() => {
      void refreshSummary();
    });

    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      if (offlineQueue.isCurrentlySyncing() === false) {
        offlineQueue.setActiveUser(null);
      }
    };
  }, [memberUserId]);

  const handleManualSync = async () => {
    if (!memberUserId || isSyncing) return;

    setIsSyncing(true);
    setSyncFeedback('Menyinkronkan data lokal ke server...');

    const result = await offlineQueue.syncNow(memberUserId);
    const next = await offlineQueue.getSummary(memberUserId);
    setSummary(next);

    if (result.synced > 0 && next.failed === 0) {
      setSyncFeedback(`Berhasil menyinkronkan ${result.synced} data.`);
    } else if (next.failed > 0) {
      setSyncFeedback(`${next.failed} data masih gagal sinkron. Data tetap tersimpan di perangkat.`);
    } else if (next.total === 0) {
      setSyncFeedback('Semua data lokal telah tersinkronisasi.');
    } else {
      setSyncFeedback('Sinkronisasi belum selesai. Data tetap aman di antrean lokal.');
    }

    setIsSyncing(false);
    window.setTimeout(() => setSyncFeedback(null), 4500);
  };

  if (isOnline && summary.total === 0 && !syncFeedback) {
    return null;
  }

  if (!isOnline) {
    return (
      <div className="sticky top-0 z-40 w-full bg-amber-600 px-4 py-2 text-xs text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 font-semibold">
            <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
            <span className="truncate">
              <strong>OFFLINE</strong>
              {summary.total > 0
                ? ` • ${summary.total} data tersimpan di HP dan belum final di server`
                : ' • fitur yang memerlukan server sedang tidak tersedia'}
            </span>
          </div>
          {summary.total > 0 ? (
            <span className="shrink-0 rounded bg-amber-700/80 px-2 py-0.5 font-mono text-[10px]">
              LOKAL AMAN
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (summary.failed > 0) {
    return (
      <div className="sticky top-0 z-40 w-full bg-red-700 px-4 py-2 text-xs text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {summary.failed} data gagal sinkron. Data masih tersimpan di perangkat.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleManualSync()}
            disabled={isSyncing}
            className="shrink-0 rounded bg-white px-2.5 py-1 text-[11px] font-black text-red-700 disabled:opacity-50"
          >
            {isSyncing ? 'MENCOBA...' : 'COBA LAGI'}
          </button>
        </div>
      </div>
    );
  }

  if (summary.total > 0) {
    return (
      <div className="sticky top-0 z-40 w-full bg-blue-600 px-4 py-2 text-xs text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 font-semibold">
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isSyncing || summary.syncing > 0 ? 'animate-spin' : ''}`} />
            <span className="truncate">
              {isSyncing || summary.syncing > 0
                ? 'Menyinkronkan data lokal ke server...'
                : `${summary.total} data menunggu sinkronisasi`}
            </span>
          </div>
          {!isSyncing && summary.syncing === 0 ? (
            <button
              type="button"
              onClick={() => void handleManualSync()}
              className="shrink-0 rounded bg-white px-2.5 py-1 text-[11px] font-black text-blue-700"
            >
              SINKRONKAN
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return syncFeedback ? (
    <div className="sticky top-0 z-40 w-full bg-emerald-600 px-4 py-2 text-xs text-white shadow-md">
      <div className="mx-auto flex max-w-5xl items-center gap-2 font-semibold">
        <CheckCircle2 className="h-4 w-4" />
        <span>{syncFeedback}</span>
      </div>
    </div>
  ) : null;
};
