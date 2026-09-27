/**
 * OPS SIGAP — Guard Profile & Offline Queue Diagnostics
 */

import React, { useEffect, useState } from 'react';
import {
  User,
  ArrowLeft,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Download,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { offlineQueue, OfflineQueueItem } from '../lib/offlineQueue';
import { PWAInstallButton } from '../components/PWAInstallButton';

export const ProfileView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user, logout } = useAuth();
  const isSuperAdminDesktop = user?.role === 'SUPER_ADMIN';
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const loadQueue = async () => {
    const items = await offlineQueue.getQueueItems();
    setQueueItems(items);
  };

  useEffect(() => {
    loadQueue();
    const unsub = offlineQueue.subscribe(loadQueue);
    return () => {
      unsub();
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg('Menyinkronkan antrean...');
    const res = await offlineQueue.syncNow();
    if (res.synced > 0) {
      setSyncStatusMsg(`Sukses menyinkronkan ${res.synced} data!`);
    } else if (res.failed > 0) {
      setSyncStatusMsg(`${res.failed} data gagal sinkron. Periksa jaringan.`);
    } else {
      setSyncStatusMsg('Tidak ada antrean pending.');
    }
    await loadQueue();
    setIsSyncing(false);
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className={`mx-auto flex items-center justify-between ${isSuperAdminDesktop ? 'max-w-5xl' : 'max-w-md'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-300">Account & Sync</p><h1 className="mt-0.5 text-base font-black tracking-tight text-white">Profil Petugas</h1></div>
              <p className="text-[11px] text-slate-400 font-medium">Informasi Akun & Sinkronisasi</p>
            </div>
          </div>
        </div>
      </header>

      <main className={`mx-auto space-y-4 px-4 pt-4 ${isSuperAdminDesktop ? 'max-w-5xl lg:px-6 lg:pt-6' : 'max-w-md'}`}>
        {/* Profile Card */}
        <div className={`space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-black/10 ${isSuperAdminDesktop ? 'lg:grid lg:grid-cols-[320px_1fr] lg:items-center lg:gap-6 lg:space-y-0' : ''}`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/40 bg-blue-600/15 text-lg font-black text-blue-300 shadow-lg shadow-blue-950/20">
              {user?.name.charAt(0) || 'U'}
            </div>
            <div>
              <h2 className="text-base font-black leading-tight text-white">{user?.name}</h2>
              <div className="mt-1 font-mono text-xs font-bold text-blue-300">
                NPK: {user?.npk}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                {user?.role} • Site: {user?.siteId || 'Global'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-t border-slate-800 pt-4 font-mono text-xs text-slate-400">
            <div>Email: {user?.email}</div>
            <div>Jabatan: {user?.position || user?.role}</div>
            <div>Customer: {user?.customerId || 'Global'}</div>
            <div>Status: <span className={user?.status === 'ACTIVE' ? 'text-emerald-400' : 'text-red-400'}>{user?.status}</span></div>
            <div>ID Sistem: {user?.id}</div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Riwayat Mutasi / Penugasan</h3>
          {(user?.assignmentHistory || []).length ? (user?.assignmentHistory || []).slice().reverse().map((item, index) => (
            <div key={`${item.effectiveAt}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
              <div className="font-black text-slate-200">{item.siteId || 'GLOBAL'}</div>
              <div className="text-slate-500">Customer {item.customerId || '-'} • {new Date(item.effectiveAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</div>
            </div>
          )) : <p className="text-xs text-slate-500">Belum ada riwayat mutasi.</p>}
        </div>

        {/* PWA Install Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Aplikasi Lapangan (PWA)
          </h3>
          <p className="text-xs leading-5 text-slate-300">
            Pasang OPS SIGAP ke layar utama HP agar dapat digunakan seperti aplikasi native saat patroli di titik tanpa sinyal.
          </p>
          <div className="pt-2">
            <PWAInstallButton />
          </div>
        </div>

        {/* Offline Queue Diagnostics */}
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                Antrean Sinkronisasi Lokal
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">IndexedDB Storage</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-black ${
                queueItems.length > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {queueItems.length} Data
            </span>
          </div>

          {syncStatusMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-800/70 bg-blue-950/40 p-3 text-xs text-blue-200">
              <Info className="w-4 h-4 shrink-0" />
              <span>{syncStatusMsg}</span>
            </div>
          )}

          {queueItems.length > 0 ? (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {queueItems.map((q) => (
                <div
                  key={q.idempotencyId}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs gap-3"
                >
                  <div>
                    <div className="font-bold text-white font-mono">{q.checkpointCode || 'SCAN'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(q.clientCapturedAt).toLocaleTimeString('id-ID')} WIB
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                      q.syncStatus === 'SYNCED'
                        ? 'bg-emerald-950 text-emerald-400'
                        : q.syncStatus === 'SYNC_FAILED'
                        ? 'bg-red-950 text-red-400'
                        : 'bg-amber-950 text-amber-400'
                    }`}
                  >
                    {q.syncStatus}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-slate-500">
              Semua data di HP telah sinkron dengan server.
            </p>
          )}

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sinkronisasi...' : 'Sinkronkan Sekarang'}</span>
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-xs font-black text-red-300 transition hover:bg-red-950/70 focus:outline-none focus:ring-2 focus:ring-red-800/60"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar (Logout)</span>
        </button>
      </main>
    </div>
  );
};
