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
  const { user, logout, quickLogin } = useAuth();
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(null);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [targetRounds, setTargetRounds] = useState(5);
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
        setTargetRounds(progressRes.targetRounds || 5);
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
      onNavigate('patrol');
      return;
    }
    setStartingPatrol(true);
    setErrorMsg(null);
    try {
      const res = await api.startPatrolSession();
      if (res.success && res.session) {
        setActiveSession(res.session);
        onNavigate('patrol');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memulai patroli');
    } finally {
      setStartingPatrol(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Top Tactical App Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-white text-base">OPS SIGAP</span>
                <span className="text-[10px] bg-blue-900/60 border border-blue-700/60 text-blue-300 font-mono px-1.5 py-0.2 rounded">
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
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 transition"
              title="Profil & Pengaturan"
            >
              <UserIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Guard Profile & Active Shift Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Petugas Jaga:</div>
              <div className="text-base font-bold text-white mt-0.5">{user?.name}</div>
              <div className="text-xs text-slate-400 font-mono">NPK: {user?.npk}</div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-blue-900/40 rounded-3xl p-5 shadow-xl shadow-blue-950/20 relative overflow-hidden">
          {/* Subtle radar background ring */}
          <div className="absolute -right-12 -bottom-12 w-44 h-44 rounded-full border border-blue-500/10 pointer-events-none" />

          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
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
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
              <div className="text-[11px] font-medium text-slate-400">Ronde Berjalan:</div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-white">
                  {activeSession ? activeSession.totalValid : 0}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  / {activeSession ? activeSession.totalRequired : 5} CP
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
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
              <div className="text-[11px] font-medium text-slate-400">Target Shift:</div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-emerald-400">
                  {completedRounds}
                </span>
                <span className="text-xs text-slate-400 font-mono">
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
            className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${
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
                <span>MULAI PATROLI (RONDE #{completedRounds + 1})</span>
              </>
            )}
          </button>
        </div>

        {/* Operational Modules Grid */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1 mb-2.5">
            Modul Operasional
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {/* Patroli */}
            <button
              onClick={() => onNavigate('patrol')}
              className="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 p-4 rounded-2xl text-left transition flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-105 transition">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Patroli QR</div>
                <p className="text-[11px] text-slate-400 mt-0.5">5 Checkpoint BB92</p>
              </div>
            </button>

            {/* Serah Terima Jaga */}
            <button
              onClick={() => onNavigate('handover')}
              className="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 p-4 rounded-2xl text-left transition flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Serah Terima</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Naik / Turun Jaga</p>
              </div>
            </button>

            {/* Lapor Kejadian */}
            <button
              onClick={() => onNavigate('incidents')}
              className="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 p-4 rounded-2xl text-left transition flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-600/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Lapor Kejadian</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Insiden & Temuan</p>
              </div>
            </button>

            {/* Galeri Dokumentasi */}
            <button
              onClick={() => onNavigate('gallery')}
              className="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 p-4 rounded-2xl text-left transition flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-105 transition">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Galeri Media</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Bukti Foto Terpusat</p>
              </div>
            </button>
          </div>
        </div>

        {/* Latest Documentation Preview */}
        {recentMedia.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
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

        {/* Switch Account Quick Helper (Ahmad Sopyan, Arif, Ayo, Deni, Super Admin) */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 text-xs text-slate-400">
          <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Ganti Cepat Petugas (Demo Evaluasi)
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => quickLogin('234378', '234378')}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-left font-mono truncate"
            >
              Ahmad (234378)
            </button>
            <button
              onClick={() => quickLogin('305464', '305464')}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-left font-mono truncate"
            >
              Arif (305464)
            </button>
            <button
              onClick={() => quickLogin('237129', '237129')}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-left font-mono truncate"
            >
              Ayo (237129)
            </button>
            <button
              onClick={() => quickLogin('230557', '230557')}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-left font-mono truncate"
            >
              Deni (230557)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
