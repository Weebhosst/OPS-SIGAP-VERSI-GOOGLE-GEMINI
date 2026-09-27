/**
 * OPS SIGAP — Member Home / Beranda Anggota
 * Professional, high-contrast, mobile-first operations hub
 */

import React, { useEffect, useState } from 'react';
import {
  Shield,
  Play,
  RotateCcw,
  Clock,
  MapPin,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Image as ImageIcon,
  ChevronRight,
  User as UserIcon,
  LogOut,
  Radio,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { ShiftInfo, PatrolSession, MediaGalleryItem, ShiftHandover } from '../types/ops';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface MemberHomeProps {
  onNavigate: (tab: 'home' | 'patrol' | 'handover' | 'incidents' | 'gallery' | 'profile') => void;
}

export const MemberHome: React.FC<MemberHomeProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(null);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [targetRounds, setTargetRounds] = useState(1);
  const [activeSession, setActiveSession] = useState<PatrolSession | null>(null);
  const [recentMedia, setRecentMedia] = useState<MediaGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingPatrol, setStartingPatrol] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setErrorMsg(null);
      const [progressRes, currentRes, galleryRes] = await Promise.all([
        api.getShiftProgress(),
        api.getCurrentSession(),
        api.getGallery(),
      ]);

      if (progressRes.success) {
        setShiftInfo(progressRes.shift);
        setCompletedRounds(progressRes.completedRounds);
        setTargetRounds(progressRes.targetRounds || 1);
      }

      if (currentRes.success && currentRes.hasOpenSession) {
        setActiveSession(currentRes.session);
      } else {
        setActiveSession(null);
      }

      if (galleryRes.success) {
        setRecentMedia(galleryRes.media.slice(0, 4));
      }
    } catch (err: any) {
      console.warn('Error loading home data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStartPatrol = async () => {
    if (activeSession) {
      onNavigate(activeSession.startDocumentationCompleted ? 'patrol' : 'handover');
      return;
    }
    setStartingPatrol(true);
    setErrorMsg(null);
    try {
      const res = await api.startPatrolSession();
      if (res.success && res.session) {
        setActiveSession(res.session);
        onNavigate('handover');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memulai patroli');
    } finally {
      setStartingPatrol(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] text-slate-100 pb-28">
      {/* Top Tactical App Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-600/15 text-blue-300 shadow-lg shadow-blue-950/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-white">OPS SIGAP</span>
                <span className="rounded-md border border-blue-700/60 bg-blue-900/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-300">
                  BB92
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Barang Bukti KM 92</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              onClick={() => onNavigate('profile')}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Profil & Pengaturan"
              aria-label="Buka profil dan pengaturan"
            >
              <UserIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4">
        {/* Guard Profile & Active Shift Card */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Petugas Jaga:</div>
              <div className="mt-1 text-lg font-black text-white">{user?.name}</div>
              <div className="font-mono text-[11px] text-slate-400">NPK: {user?.npk}</div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]" />
                {shiftInfo?.name.split(' ')[0] || 'Shift Aktif'}
              </span>
              <p className="text-[11px] text-slate-400 font-mono mt-1">
                {shiftInfo?.timeRange} WIB
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                Op. Date: {shiftInfo?.operationalDate}
              </p>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* PRIMARY HERO: Patrol Round & Progress */}
        <div className="relative overflow-hidden rounded-3xl border border-blue-900/50 bg-gradient-to-br from-[#0f172a] via-[#0f172a] to-[#0c1d3a] p-5 shadow-2xl shadow-blue-950/20">
          {/* Subtle radar background ring */}
          <div className="absolute -right-12 -bottom-12 w-44 h-44 rounded-full border border-blue-500/10 pointer-events-none" />

          <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-200">
                Status Patroli Lapangan
              </span>
            </div>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                activeSession
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {activeSession ? `Ronde #${activeSession.roundNumber || 1} Sedang Berjalan` : 'Siap Mulai Ronde'}
            </span>
          </div>

          {/* Progress Counters (2-Level: Checkpoint per round & Rounds per shift) */}
          <div className="grid grid-cols-2 gap-3 my-4">
            {/* Round Checkpoints */}
            <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ronde Berjalan:</div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black leading-none text-white">
                  {activeSession ? activeSession.totalValid : 0}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  / {activeSession ? activeSession.totalRequired : 0} CP
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${activeSession ? activeSession.completionPct : 0}%` }}
                />
              </div>
            </div>

            {/* Shift Rounds Target */}
            <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Shift:</div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black leading-none text-emerald-400">
                  {completedRounds}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  / {targetRounds} Ronde
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((completedRounds / targetRounds) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Big Action Button */}
          <button
            onClick={handleStartPatrol}
            disabled={startingPatrol}
            className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black text-white shadow-lg transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${
              activeSession
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/50'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-950/50'
            }`}
          >
            {activeSession ? (
              <>
                <RotateCcw className="w-5 h-5" />
                <span>LANJUTKAN PATROLI (RONDE #{activeSession.roundNumber || 1})</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>MULAI SHIFT</span>
              </>
            )}
          </button>
        </div>

        {/* Operational Modules Grid */}
        <div>
          <h2 className="mb-2.5 px-1 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
            Modul Operasional
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {/* Patroli */}
            <button
              onClick={() => onNavigate('patrol')}
              className="group flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-slate-700 hover:bg-slate-800/90"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600/15 text-blue-300 transition group-hover:scale-105">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">Patroli QR</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Target checkpoint sesuai Site</p>
              </div>
            </button>

            {/* Serah Terima Jaga */}
            <button
              onClick={() => onNavigate('handover')}
              className="group flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-slate-700 hover:bg-slate-800/90"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600/15 text-emerald-300 transition group-hover:scale-105">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">Serah Terima</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Naik / Turun Jaga</p>
              </div>
            </button>

            {/* Lapor Kejadian */}
            <button
              onClick={() => onNavigate('incidents')}
              className="group flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-slate-700 hover:bg-slate-800/90"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-600/15 text-amber-300 transition group-hover:scale-105">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">Lapor Kejadian</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Insiden & Temuan</p>
              </div>
            </button>

            {/* Galeri Dokumentasi */}
            <button
              onClick={() => onNavigate('gallery')}
              className="group flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-slate-700 hover:bg-slate-800/90"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-600/15 text-violet-300 transition group-hover:scale-105">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">Galeri Media</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Bukti Foto Terpusat</p>
              </div>
            </button>
          </div>
        </div>

        {/* Latest Documentation Preview */}
        {recentMedia.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Dokumentasi Terbaru
              </h3>
              <button
                onClick={() => onNavigate('gallery')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
              >
                <span>Lihat Semua</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {recentMedia.map((m) => (
                <div
                  key={m.id}
                  onClick={() => onNavigate('gallery')}
                  className="group cursor-pointer rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video relative"
                >
                  <img
                    src={m.photoUrl}
                    alt={m.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2">
                    <span className="text-[10px] text-slate-200 truncate font-mono">
                      {m.caption}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
