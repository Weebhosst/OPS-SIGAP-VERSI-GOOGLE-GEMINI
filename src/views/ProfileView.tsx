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
  const { user, logout, quickLogin } = useAuth();
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-extrabold text-white text-base">Profil Petugas</h1>
              <p className="text-[11px] text-slate-400 font-medium">Informasi Akun & Sinkronisasi</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Profile Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-black text-lg">
              {user?.name.charAt(0) || 'U'}
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{user?.name}</h2>
              <div className="text-xs text-blue-400 font-mono font-semibold mt-0.5">
                NPK: {user?.npk}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {user?.role} • Site: {user?.siteId || 'Global'}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-1 font-mono">
            <div>Email: {user?.email}</div>
            <div>ID Sistem: {user?.id}</div>
          </div>
        </div>

        {/* PWA Install Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Aplikasi Lapangan (PWA)
          </h3>
          <p className="text-xs text-slate-300">
            Pasang OPS SIGAP ke layar utama HP agar dapat digunakan seperti aplikasi native saat patroli di titik tanpa sinyal.
          </p>
          <div className="pt-2">
            <PWAInstallButton />
          </div>
        </div>

        {/* Offline Queue Diagnostics */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Antrean Sinkronisasi Lokal
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">IndexedDB Storage</p>
            </div>
            <span
              className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                queueItems.length > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {queueItems.length} Data
            </span>
          </div>

          {syncStatusMsg && (
            <div className="p-2.5 bg-blue-950/60 border border-blue-800 text-blue-300 text-xs rounded-xl flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{syncStatusMsg}</span>
            </div>
          )}

          {queueItems.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {queueItems.map((q) => (
                <div
                  key={q.idempotencyId}
                  className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex items-center justify-between"
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
            <p className="text-xs text-slate-500 italic">
              Semua data di HP telah sinkron dengan server.
            </p>
          )}

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sinkronisasi...' : 'Sinkronkan Sekarang'}</span>
          </button>
        </div>

        {/* Account Switcher for Evaluation */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-2">
          <div className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            Ganti Akun Cepat (Evaluasi Testing)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => quickLogin('234378', '234378')}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-left text-slate-300 font-mono"
            >
              <div className="font-bold text-white">Ahmad Sopyan</div>
              <div className="text-[10px] text-slate-400">NPK: 234378</div>
            </button>
            <button
              onClick={() => quickLogin('305464', '305464')}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-left text-slate-300 font-mono"
            >
              <div className="font-bold text-white">Arif Janwaripin</div>
              <div className="text-[10px] text-slate-400">NPK: 305464</div>
            </button>
            <button
              onClick={() => quickLogin('237129', '237129')}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-left text-slate-300 font-mono"
            >
              <div className="font-bold text-white">Ayo Sunaryo</div>
              <div className="text-[10px] text-slate-400">NPK: 237129</div>
            </button>
            <button
              onClick={() => quickLogin('230557', '230557')}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-left text-slate-300 font-mono"
            >
              <div className="font-bold text-white">Deni Winarya</div>
              <div className="text-[10px] text-slate-400">NPK: 230557</div>
            </button>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="w-full py-3 bg-red-950/40 hover:bg-red-950/70 border border-red-900/60 text-red-300 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar (Logout)</span>
        </button>
      </main>
    </div>
  );
};
