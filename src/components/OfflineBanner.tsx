/**
 * OPS SIGAP — Offline Status & Sync Queue Banner
 */

import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { offlineQueue } from '../lib/offlineQueue';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkPending();
    };
    const handleOffline = () => {
      setIsOnline(false);
      checkPending();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkPending = () => {
      offlineQueue.getPendingCount().then((count) => {
        setPendingCount(count);
        setIsSyncing(offlineQueue.isCurrentlySyncing());
      });
    };

    checkPending();
    const unsub = offlineQueue.subscribe(checkPending);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsub();
    };
  }, []);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback('Menyinkronkan data ke server...');
    const res = await offlineQueue.syncNow();
    if (res.synced > 0) {
      setSyncFeedback(`Berhasil menyinkronkan ${res.synced} data!`);
    } else if (res.failed > 0) {
      setSyncFeedback(`${res.failed} data gagal sinkron. Akan dicoba lagi.`);
    } else {
      setSyncFeedback('Semua data lokal telah tersinkronisasi.');
    }
    setTimeout(() => setSyncFeedback(null), 3500);
    setIsSyncing(false);
  };

  // If online and no pending items, show nothing
  if (isOnline && pendingCount === 0 && !syncFeedback) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 w-full transition-all">
      {!isOnline ? (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff className="w-4 h-4 animate-pulse" />
            <span>
              <strong>OFFLINE</strong> — DATA MENUNGGU SINKRONISASI ({pendingCount} pending)
            </span>
          </div>
          <span className="text-[10px] bg-amber-700/80 px-2 py-0.5 rounded font-mono">
            Tersimpan di HP
          </span>
        </div>
      ) : pendingCount > 0 ? (
        <div className="bg-blue-600 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{pendingCount} data siap disinkronkan ke server</span>
          </div>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-2.5 py-1 bg-white text-blue-700 rounded font-semibold text-[11px] hover:bg-blue-50 transition shadow-sm"
          >
            {isSyncing ? 'Sinkronisasi...' : 'Sinkronkan Sekarang'}
          </button>
        </div>
      ) : syncFeedback ? (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>{syncFeedback}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};
