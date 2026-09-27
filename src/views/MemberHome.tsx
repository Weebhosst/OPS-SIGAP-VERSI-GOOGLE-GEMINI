/**
 * OPS SIGAP - Member Home / Beranda Anggota
 * Mobile-first operational command surface for field members.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  MapPin,
  Play,
  Radio,
  RefreshCw,
  Shield,
  User as UserIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { offlineQueue } from '../lib/offlineQueue';
import {
  MediaGalleryItem,
  PatrolSession,
  ShiftHandover,
  ShiftInfo,
  Site,
} from '../types/ops';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface MemberHomeProps {
  onNavigate: (tab: 'home' | 'patrol' | 'handover' | 'incidents' | 'gallery' | 'profile') => void;
}

type RoundSummary = {
  roundNumber: number;
  completed: number;
  required: number;
  checkpointIds: string[];
};

export const MemberHome: React.FC<MemberHomeProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(null);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [targetRounds, setTargetRounds] = useState(1);
  const [isTargetAchieved, setIsTargetAchieved] = useState(false);
  const [activeSession, setActiveSession] = useState<PatrolSession | null>(null);
  const [siteInfo, setSiteInfo] = useState<Site | null>(null);
  const [recentMedia, setRecentMedia] = useState<MediaGalleryItem[]>([]);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentRoundCompleted, setCurrentRoundCompleted] = useState(0);
  const [currentRoundRequired, setCurrentRoundRequired] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingPatrol, setStartingPatrol] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadOfflineState = useCallback(async () => {
    const count = await offlineQueue.getPendingCount();
    setPendingSyncCount(count);
    setIsSyncing(offlineQueue.isCurrentlySyncing());
  }, []);

  const loadData = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      setErrorMsg(null);

      const [progressRes, currentRes, galleryRes, handoverRes] = await Promise.all([
        api.getShiftProgress(),
        api.getCurrentSession(),
        api.getGallery(),
        api.getHandovers(),
      ]);

      if (progressRes.success) {
        setShiftInfo(progressRes.shift);
        setSiteInfo(progressRes.site || currentRes.site || null);
        setCompletedRounds(progressRes.completedRounds);
        setTargetRounds(Math.max(1, progressRes.targetRounds || 1));
        setIsTargetAchieved(progressRes.isTargetAchieved);
      }

      if (currentRes.success && currentRes.hasOpenSession && currentRes.session) {
        setActiveSession(currentRes.session);
        setSiteInfo(currentRes.site || progressRes.site || null);

        const roundNumber = currentRes.currentRound || currentRes.session.roundNumber || 1;
        const rounds = (currentRes.rounds || []) as RoundSummary[];
        const activeRound = rounds.find((round) => round.roundNumber === roundNumber);

        setCurrentRound(roundNumber);
        setCurrentRoundCompleted(activeRound?.completed || 0);
        setCurrentRoundRequired(
          activeRound?.required
            || Math.max(0, currentRes.checkpoints?.length || 0),
        );
      } else {
        setActiveSession(null);
        setCurrentRound(1);
        setCurrentRoundCompleted(0);
        setCurrentRoundRequired(0);
      }

      if (galleryRes.success) {
        setRecentMedia(galleryRes.media.slice(0, 4));
      }

      if (handoverRes.success) {
        setHandovers(handoverRes.handovers);
      }

      await loadOfflineState();
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      console.warn('Error loading member home data:', err);
      setErrorMsg(err?.message || 'Data operasional belum dapat dimuat. Periksa koneksi lalu coba lagi.');
      await loadOfflineState();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadOfflineState]);

  useEffect(() => {
    void loadData();

    const unsubscribeQueue = offlineQueue.subscribe(() => {
      void loadOfflineState();
      if (!offlineQueue.isCurrentlySyncing()) {
        void loadData(true);
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      void loadData(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      void loadOfflineState();
    };
    const handleFocus = () => void loadData(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadData(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void loadData(true);
      }
    }, 30_000);

    return () => {
      unsubscribeQueue();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(refreshTimer);
    };
  }, [loadData, loadOfflineState]);

  const incomingHandoverCount = useMemo(
    () => handovers.filter(
      (handover) =>
        handover.toUserId === user?.id
        && handover.status !== 'ACKNOWLEDGED',
    ).length,
    [handovers, user?.id],
  );

  const needsStartDocumentation = !!activeSession && !activeSession.startDocumentationCompleted;
  const patrolTargetComplete = !!activeSession
    && (
      isTargetAchieved
      || activeSession.totalValid >= activeSession.totalRequired
    );

  const primaryAction = useMemo(() => {
    if (!activeSession) {
      return {
        label: isOnline ? 'MULAI SHIFT' : 'KONEKSI DIPERLUKAN',
        description: isOnline
          ? 'Buat sesi jaga dan lanjutkan dokumentasi Naik Jaga.'
          : 'Mulai Shift membutuhkan koneksi server.',
        tone: 'blue' as const,
        icon: Play,
      };
    }

    if (needsStartDocumentation) {
      return {
        label: 'LENGKAPI NAIK JAGA',
        description: 'Foto Sertigas wajib disimpan sebelum checkpoint dapat dipindai.',
        tone: 'amber' as const,
        icon: ClipboardCheck,
      };
    }

    if (patrolTargetComplete) {
      return {
        label: 'TURUN JAGA & SELESAIKAN SHIFT',
        description: 'Target patroli tercapai. Lengkapi dokumentasi Turun Jaga.',
        tone: 'emerald' as const,
        icon: CheckCircle2,
      };
    }

    return {
      label: `LANJUTKAN RONDE ${currentRound}`,
      description: `${currentRoundCompleted}/${currentRoundRequired || '?'} checkpoint ronde ini telah tervalidasi.`,
      tone: 'blue' as const,
      icon: Shield,
    };
  }, [
    activeSession,
    currentRound,
    currentRoundCompleted,
    currentRoundRequired,
    isOnline,
    needsStartDocumentation,
    patrolTargetComplete,
  ]);

  const handlePrimaryAction = async () => {
    if (activeSession) {
      if (needsStartDocumentation) {
        onNavigate('handover');
      } else {
        onNavigate('patrol');
      }
      return;
    }

    if (!isOnline) {
      setErrorMsg('Mulai Shift membutuhkan koneksi internet agar session dapat dibuat dengan aman.');
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
      setErrorMsg(err?.message || 'Gagal memulai shift.');
    } finally {
      setStartingPatrol(false);
    }
  };

  const roundPct = currentRoundRequired > 0
    ? Math.min(100, Math.round((currentRoundCompleted / currentRoundRequired) * 100))
    : 0;
  const shiftPct = Math.min(100, Math.round((completedRounds / Math.max(1, targetRounds)) * 100));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
        <div className="mx-auto max-w-md space-y-4 px-4 pt-6">
          <div className="h-14 animate-pulse rounded-2xl bg-slate-900" />
          <div className="h-32 animate-pulse rounded-3xl bg-slate-900" />
          <div className="h-72 animate-pulse rounded-3xl bg-slate-900" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 animate-pulse rounded-2xl bg-slate-900" />
            <div className="h-28 animate-pulse rounded-2xl bg-slate-900" />
          </div>
        </div>
      </div>
    );
  }

  const PrimaryIcon = primaryAction.icon;

  return (
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-600/15 text-blue-300 shadow-lg shadow-blue-950/20">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-white">OPS SIGAP</span>
                <span className="max-w-[110px] truncate rounded-md border border-blue-700/60 bg-blue-900/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-300">
                  {siteInfo?.code || siteInfo?.id || user?.siteId || 'SITE'}
                </span>
              </div>
              <p className="truncate text-[11px] font-medium text-slate-400">
                {siteInfo?.name || 'Site penugasan aktif'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Profil & Pengaturan"
              aria-label="Buka profil dan pengaturan"
            >
              <UserIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-lg shadow-black/10">
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                Petugas Jaga
              </p>
              <h1 className="mt-1 truncate text-lg font-black text-white">{user?.name}</h1>
              <p className="font-mono text-[11px] text-slate-400">NPK {user?.npk}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-[10px] font-black text-slate-300">
                <CircleDot className="h-3 w-3 text-blue-400" />
                {shiftInfo?.code || 'SHIFT'}
              </span>
              <p className="mt-1 font-mono text-[10px] text-slate-400">{shiftInfo?.timeRange || '-'}</p>
              <p className="font-mono text-[9px] text-slate-500">{shiftInfo?.operationalDate || '-'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 border-t border-slate-800">
            <div className="border-r border-slate-800 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Koneksi</p>
              <div className={`mt-1 flex items-center gap-1 text-[10px] font-black ${isOnline ? 'text-emerald-300' : 'text-amber-300'}`}>
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>
            <div className="border-r border-slate-800 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Sync</p>
              <p className={`mt-1 text-[10px] font-black ${pendingSyncCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {isSyncing ? 'SYNCING...' : pendingSyncCount > 0 ? `${pendingSyncCount} PENDING` : 'BERSIH'}
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Session</p>
              <p className={`mt-1 text-[10px] font-black ${activeSession ? 'text-blue-300' : 'text-slate-400'}`}>
                {activeSession ? 'AKTIF' : 'BELUM MULAI'}
              </p>
            </div>
          </div>
        </section>

        {errorMsg ? (
          <section className="rounded-2xl border border-red-800/80 bg-red-950/50 p-3.5 text-red-100">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black">DATA OPERASIONAL PERLU DIPERBARUI</p>
                <p className="mt-1 text-[11px] leading-5 text-red-200">{errorMsg}</p>
              </div>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void loadData(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-800 bg-red-950/80 text-red-200 disabled:opacity-50"
                aria-label="Coba muat ulang"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </section>
        ) : null}

        <section className={`relative overflow-hidden rounded-3xl border p-5 shadow-2xl ${
          primaryAction.tone === 'emerald'
            ? 'border-emerald-800/60 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 shadow-emerald-950/20'
            : primaryAction.tone === 'amber'
              ? 'border-amber-800/60 bg-gradient-to-br from-amber-950/55 via-slate-900 to-slate-900 shadow-amber-950/20'
              : 'border-blue-900/50 bg-gradient-to-br from-[#0f172a] via-[#0f172a] to-[#0c1d3a] shadow-blue-950/20'
        }`}>
          <div className="pointer-events-none absolute -bottom-16 -right-12 h-48 w-48 rounded-full border border-white/5" />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Radio className={`h-4 w-4 ${activeSession ? 'animate-pulse text-blue-400' : 'text-slate-500'}`} />
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                    Tindakan Berikutnya
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-black leading-tight text-white">
                  {primaryAction.label}
                </h2>
                <p className="mt-1 max-w-[290px] text-[11px] leading-5 text-slate-300">
                  {primaryAction.description}
                </p>
              </div>

              <button
                type="button"
                disabled={refreshing}
                onClick={() => void loadData(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/50 text-slate-400 transition hover:text-white disabled:opacity-50"
                aria-label="Refresh status dashboard"
                title="Refresh status"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {activeSession ? (
              <div className="my-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Ronde {currentRound}</p>
                    <span className="font-mono text-[9px] font-bold text-blue-300">{roundPct}%</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-black leading-none text-white">{currentRoundCompleted}</span>
                    <span className="font-mono text-[11px] text-slate-400">/ {currentRoundRequired || '?'} CP</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${roundPct}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Target Shift</p>
                    <span className="font-mono text-[9px] font-bold text-emerald-300">{shiftPct}%</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-black leading-none text-emerald-400">{completedRounds}</span>
                    <span className="font-mono text-[11px] text-slate-400">/ {targetRounds} Ronde</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${shiftPct}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="my-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Site</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
                    <MapPin className="h-3.5 w-3.5 text-blue-400" />
                    <span className="truncate">{siteInfo?.code || user?.siteId || '-'}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Target</p>
                  <p className="mt-1 text-[11px] font-bold text-slate-200">{targetRounds} ronde / shift</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handlePrimaryAction()}
              disabled={startingPatrol || (!activeSession && !isOnline)}
              className={`flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none ${
                primaryAction.tone === 'emerald'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                  : primaryAction.tone === 'amber'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/40'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-950/40'
              }`}
            >
              {startingPatrol ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <PrimaryIcon className="h-5 w-5" />
              )}
              <span>{startingPatrol ? 'MEMBUAT SESSION...' : primaryAction.label}</span>
            </button>

            <div className="mt-3 flex items-center justify-between gap-3 text-[9px] text-slate-500">
              <span>
                {lastUpdatedAt
                  ? `Update ${lastUpdatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Belum diperbarui'}
              </span>
              {pendingSyncCount > 0 ? (
                <span className="font-bold text-amber-300">{pendingSyncCount} data menunggu server</span>
              ) : (
                <span className="font-bold text-emerald-400">Data tersinkron</span>
              )}
            </div>
          </div>
        </section>

        {incomingHandoverCount > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate('handover')}
            className="flex w-full items-center gap-3 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-3.5 text-left transition hover:bg-amber-950/45"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-600/40 bg-amber-900/30 text-amber-300">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-amber-200">SERAH TERIMA MENUNGGU KONFIRMASI</p>
              <p className="mt-0.5 text-[11px] text-amber-100/70">
                {incomingHandoverCount} data ditujukan ke akun ini.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-amber-300" />
          </button>
        ) : null}

        <section>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Modul Operasional
            </h2>
            <span className="text-[9px] font-medium text-slate-600">Akses cepat lapangan</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('patrol')}
              className="group flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-blue-800 hover:bg-slate-800/90"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600/15 text-blue-300">
                  <Shield className="h-5 w-5" />
                </div>
                {activeSession && !needsStartDocumentation ? (
                  <span className="rounded-full border border-blue-800 bg-blue-950/60 px-2 py-0.5 font-mono text-[9px] font-black text-blue-300">
                    R{currentRound}
                  </span>
                ) : null}
              </div>
              <div>
                <div className="text-sm font-black text-white">Patroli QR</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  {activeSession
                    ? needsStartDocumentation
                      ? 'Selesaikan Naik Jaga dahulu'
                      : `${currentRoundCompleted}/${currentRoundRequired || '?'} CP ronde berjalan`
                    : 'Belum ada session aktif'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('handover')}
              className="group flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-emerald-800 hover:bg-slate-800/90"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600/15 text-emerald-300">
                  <FileText className="h-5 w-5" />
                </div>
                {incomingHandoverCount > 0 ? (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-slate-950">
                    {incomingHandoverCount}
                  </span>
                ) : null}
              </div>
              <div>
                <div className="text-sm font-black text-white">Serah Terima</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  Naik Jaga, barang, TARUNA, penerimaan
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('incidents')}
              className="group flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-amber-800 hover:bg-slate-800/90"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-600/15 text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">Lapor Kejadian</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  {activeSession ? 'Insiden dan temuan saat shift' : 'Memerlukan shift aktif'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('gallery')}
              className="group flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-violet-800 hover:bg-slate-800/90"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-600/15 text-violet-300">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">Galeri Media</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Riwayat bukti operasional</p>
              </div>
            </button>
          </div>
        </section>

        {recentMedia.length > 0 ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Dokumentasi Terbaru
                </h3>
                <p className="mt-0.5 text-[9px] text-slate-600">Bukti terbaru dari Site penugasan</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('gallery')}
                className="flex items-center gap-0.5 text-xs font-semibold text-blue-400 transition hover:text-blue-300"
              >
                <span>Lihat Semua</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {recentMedia.map((media) => (
                <button
                  type="button"
                  key={media.id}
                  onClick={() => onNavigate('gallery')}
                  className="group relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-left"
                >
                  <img
                    src={media.photoUrl}
                    alt={media.caption}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-transparent to-transparent p-2">
                    <span className="truncate font-mono text-[9px] text-slate-200">
                      {media.caption || media.documentType || 'Dokumentasi'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-5 text-center">
            <ImageIcon className="mx-auto h-6 w-6 text-slate-600" />
            <p className="mt-2 text-xs font-bold text-slate-400">Belum ada dokumentasi terbaru</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              Bukti patroli, serah terima, dan kejadian akan muncul di sini.
            </p>
          </section>
        )}
      </main>
    </div>
  );
};
