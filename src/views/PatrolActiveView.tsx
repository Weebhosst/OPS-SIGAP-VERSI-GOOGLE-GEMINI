/**
 * OPS SIGAP — Active Patrol Round View
 * Complete patrol flow: QR scan + GPS geofence + live camera evidence photo + server-authoritative validation
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Shield,
  ArrowLeft,
  QrCode,
  MapPin,
  Camera,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Sparkles,
  LocateFixed,
  AlertTriangle,
  Lock,
  Navigation,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PatrolSession, Checkpoint, PatrolLog, Site, calculateDistanceMeters } from '../types/ops';
import { QRScannerModal } from '../components/QRScannerModal';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { offlineQueue } from '../lib/offlineQueue';

interface PatrolActiveViewProps {
  onBack: () => void;
}

export const PatrolActiveView: React.FC<PatrolActiveViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [session, setSession] = useState<PatrolSession | null>(null);
  const [siteInfo, setSiteInfo] = useState<Site | null>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [logs, setLogs] = useState<PatrolLog[]>([]);
  const [rounds, setRounds] = useState<Array<{ roundNumber: number; completed: number; required: number; checkpointIds: string[] }>>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(true);

  // GPS state
  const [currentGps, setCurrentGps] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Flow Modals & Steps
  const [activeCpForScan, setActiveCpForScan] = useState<any | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [observationStatus, setObservationStatus] = useState<'AMAN' | 'TEMUAN' | 'INSIDEN'>('AMAN');
  const [observationNotes, setObservationNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [hasSpecialHandover, setHasSpecialHandover] = useState(false);
  const [specialNotes, setSpecialNotes] = useState('');
  const [specialPhotoUrls, setSpecialPhotoUrls] = useState<string[]>([]);
  const [specialToUserId, setSpecialToUserId] = useState('');
  const [closeSiteMembers, setCloseSiteMembers] = useState<Array<{ id: string; name: string; npk: string }>>([]);
  const [endPhotoUrl, setEndPhotoUrl] = useState<string | null>(null);
  const [completedSession, setCompletedSession] = useState<PatrolSession | null>(null);
  const [cameraMode, setCameraMode] = useState<'CHECKPOINT' | 'SPECIAL' | 'END'>('CHECKPOINT');
  const [validationAlert, setValidationAlert] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);
  const celebratedSessionRef = useRef<string | null>(null);

  // Load active session and checkpoints
  const loadSession = async () => {
    try {
      const res = await api.getCurrentSession();
      if (res.success && res.hasOpenSession && res.session) {
        setSession(res.session);
        setCompletedSession(null);
        setSiteInfo(res.site || null);
        const pendingOffline = await offlineQueue.getPendingForSession(res.session.id);
        const pendingCodes = new Set(
          pendingOffline
            .map((item) => item.checkpointCode)
            .filter((code): code is string => !!code),
        );
        setCheckpoints(
          res.checkpoints.map((checkpoint: any) =>
            checkpoint.statusInRound !== 'VALID' && pendingCodes.has(checkpoint.code)
              ? { ...checkpoint, statusInRound: 'PENDING_SYNC', isOfflinePending: true }
              : checkpoint,
          ),
        );
        if (res.logs) setLogs(res.logs);
        setRounds(res.rounds || []);
        setCurrentRound(res.currentRound || 1);

        if (
          res.session.totalValid >= res.session.totalRequired
          && celebratedSessionRef.current !== res.session.id
        ) {
          celebratedSessionRef.current = res.session.id;
          triggerConfetti();
        }
      } else {
        setSession(null);
        setSiteInfo(res.site || null);
        celebratedSessionRef.current = null;
      }
    } catch (err: any) {
      console.warn('Error loading patrol session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();

    const unsubscribeQueue = offlineQueue.subscribe(() => {
      if (!offlineQueue.isCurrentlySyncing()) {
        void loadSession();
      }
    });

    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCurrentGps({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          setGpsError(null);
        },
        (err) => {
          console.warn('[GPS] Geolocation warning:', err.message);
          setCurrentGps(null);
          setGpsError('GPS belum tersedia. Aktifkan izin lokasi dan tunggu posisi perangkat diperoleh sebelum melakukan scan checkpoint.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } else {
      setCurrentGps(null);
      setGpsError('Perangkat atau browser ini tidak menyediakan GPS. Scan checkpoint tidak dapat dilakukan.');
    }

    return () => {
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      unsubscribeQueue();
    };
  }, []);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
      });
    } catch {}
  };

  const activeCheckpoints = useMemo(
    () =>
      checkpoints
        .filter((checkpoint) => checkpoint.status === 'ACTIVE')
        .sort((a, b) =>
          String(a.code).localeCompare(String(b.code), undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        ),
    [checkpoints],
  );

  const activeRound = useMemo(
    () => rounds.find((round) => round.roundNumber === currentRound) || null,
    [currentRound, rounds],
  );

  const roundCompleted = activeRound?.completed
    ?? activeCheckpoints.filter((checkpoint) => checkpoint.statusInRound === 'VALID').length;
  const roundRequired = activeRound?.required || activeCheckpoints.length;
  const roundPct = roundRequired > 0
    ? Math.min(100, Math.round((roundCompleted / roundRequired) * 100))
    : 0;

  const nextCheckpoint = useMemo(
    () => activeCheckpoints.find((checkpoint) => checkpoint.statusInRound !== 'VALID') || null,
    [activeCheckpoints],
  );

  const nextCheckpointIndex = nextCheckpoint
    ? activeCheckpoints.findIndex((checkpoint) => checkpoint.id === nextCheckpoint.id)
    : -1;

  const nextDistanceM = currentGps && nextCheckpoint
    ? calculateDistanceMeters(
        currentGps.latitude,
        currentGps.longitude,
        nextCheckpoint.latitude,
        nextCheckpoint.longitude,
      )
    : null;

  const nextWithinRadius = nextCheckpoint && nextDistanceM !== null
    ? nextDistanceM <= nextCheckpoint.radiusMeters
    : false;

  const nextPendingSync = !!nextCheckpoint
    && (nextCheckpoint.statusInRound === 'PENDING_SYNC' || nextCheckpoint.isOfflinePending === true);

  const patrolComplete = !!session && session.totalValid >= session.totalRequired;
  const startDocumentationReady = !!session?.startDocumentationCompleted;

  const scanLockReason = !session
    ? 'Session patroli belum aktif.'
    : !startDocumentationReady
      ? 'Naik Jaga wajib diselesaikan terlebih dahulu.'
      : patrolComplete
        ? 'Target patroli shift sudah tercapai.'
        : nextPendingSync
          ? 'Checkpoint ini menunggu validasi server dari antrean offline.'
          : !currentGps
            ? 'Menunggu GPS perangkat.'
            : !nextWithinRadius
              ? 'Datangi titik checkpoint hingga berada di dalam radius.'
              : null;

  // Step 1: Guard clicks Scan on a checkpoint
  const handleInitiateScan = (cp: any) => {
    if (cp.statusInRound === 'VALID') return;
    if (!nextCheckpoint || cp.id !== nextCheckpoint.id) {
      setValidationAlert({
        type: 'warning',
        title: 'CHECKPOINT TERKUNCI',
        message: nextCheckpoint
          ? `Urutan patroli berikutnya adalah ${nextCheckpoint.code} - ${nextCheckpoint.name}.`
          : 'Tidak ada checkpoint yang dapat dipindai saat ini.',
      });
      return;
    }
    if (!currentGps) {
      setValidationAlert({
        type: 'error',
        title: 'GPS BELUM SIAP',
        message: 'Scan checkpoint dikunci sampai lokasi GPS perangkat berhasil diperoleh.',
      });
      return;
    }
    setActiveCpForScan(cp);
    setScannedToken(null);
    setCapturedPhoto(null);
    setObservationStatus('AMAN');
    setObservationNotes('');
    setValidationAlert(null);
    setShowQrModal(true);
  };

  // Step 2: QR token detected
  const handleQrDetected = (token: string) => {
    setScannedToken(token);
    setShowQrModal(false);
    // Proceed to Step 3: Photo evidence capture
    setCameraMode('CHECKPOINT');
    setShowCameraModal(true);
  };

  // Step 3: Photo captured
  const handlePhotoCaptured = (photoBase64: string) => {
    if (cameraMode === 'SPECIAL') setSpecialPhotoUrls((items) => items.length < 5 ? [...items, photoBase64] : items);
    else if (cameraMode === 'END') setEndPhotoUrl(photoBase64);
    else setCapturedPhoto(photoBase64);
    setShowCameraModal(false);
  };

  const handleOpenCloseShift = async () => {
    if (!session) return;
    if (!session.startDocumentationCompleted) {
      setValidationAlert({
        type: 'error',
        title: 'NAIK JAGA BELUM SELESAI',
        message: 'Sertigas Naik Jaga wajib diselesaikan sebelum Turun Jaga.',
      });
      return;
    }
    if (session.totalValid < session.totalRequired) {
      const missing = checkpoints
        .filter((checkpoint) => checkpoint.statusInRound !== 'VALID')
        .map((checkpoint) => `${checkpoint.code} ${checkpoint.name}`)
        .join(', ');
      setValidationAlert({
        type: 'error',
        title: 'CLOSE SHIFT DITOLAK',
        message: `Patroli belum selesai. Checkpoint ${session.totalValid}/${session.totalRequired}. Belum selesai: ${missing}.`,
      });
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setValidationAlert({
        type: 'warning',
        title: 'KONEKSI DIPERLUKAN',
        message: 'Turun Jaga adalah penutupan final session dan harus disimpan langsung ke server.',
      });
      return;
    }

    try {
      const membersRes = await api.getFieldSiteMembers();
      setCloseSiteMembers(membersRes.success ? membersRes.members : []);
    } catch {
      setCloseSiteMembers([]);
    }
    setShowCloseModal(true);
  };

  const handleCloseShift = async () => {
    if (!session || !endPhotoUrl) return;
    if (hasSpecialHandover && !specialToUserId) {
      setValidationAlert({
        type: 'warning',
        title: 'PENERIMA WAJIB DIPILIH',
        message: 'Pilih Anggota penerima TARUNA / serah terima khusus sebelum menutup shift.',
      });
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setValidationAlert({
        type: 'warning',
        title: 'KONEKSI DIPERLUKAN',
        message: 'Shift belum ditutup. Sambungkan internet lalu kirim Turun Jaga kembali.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.closePatrolSession(session.id, {
        endPhotoUrl,
        hasSpecialHandover,
        specialNotes,
        specialPhotoUrls,
        specialToUserId: hasSpecialHandover ? specialToUserId : undefined,
      });
      setCompletedSession(res.session);
      setShowCloseModal(false);
      setHasSpecialHandover(false);
      setSpecialNotes('');
      setSpecialPhotoUrls([]);
      setSpecialToUserId('');
      setEndPhotoUrl(null);
      await loadSession();
      setValidationAlert({
        type: 'success',
        title: 'SHIFT SELESAI',
        message: 'Turun Jaga tersimpan. Session telah ditutup dengan status COMPLETED.',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      setValidationAlert({
        type: 'error',
        title: 'CLOSE SHIFT DITOLAK',
        message: error.message || 'Shift belum dapat ditutup.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Step 4: Final submission with observation status
  const handleSubmitScan = async () => {
    if (!session || !activeCpForScan || !scannedToken) return;
    if (!currentGps) {
      setValidationAlert({
        type: 'error',
        title: 'GPS TIDAK TERSEDIA',
        message: 'Validasi checkpoint dibatalkan karena posisi GPS perangkat tidak tersedia.',
      });
      return;
    }

    setSubmitting(true);
    setValidationAlert(null);

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const clientCapturedAt = new Date().toISOString();
    const idempotencyId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Prepare payload
    const payload = {
      sessionId: session.id,
      qrToken: scannedToken,
      latitude: currentGps.latitude,
      longitude: currentGps.longitude,
      gpsAccuracyM: currentGps.accuracy,
      photoUrl: capturedPhoto || undefined,
      observationStatus,
      notes: observationNotes,
      clientCapturedAt,
      idempotencyId,
    };

    if (!isOnline) {
      try {
        await offlineQueue.enqueuePatrolScan({
          idempotencyId,
          type: 'PATROL_SCAN',
          sessionId: session.id,
          qrToken: scannedToken,
          checkpointCode: activeCpForScan.code,
          checkpointName: activeCpForScan.name,
          latitude: currentGps.latitude,
          longitude: currentGps.longitude,
          gpsAccuracyM: currentGps.accuracy,
          photoUrl: capturedPhoto || undefined,
          observationStatus,
          notes: observationNotes,
          clientCapturedAt,
        });

        setCheckpoints((prev) =>
          prev.map((checkpoint) =>
            checkpoint.id === activeCpForScan.id
              ? { ...checkpoint, statusInRound: 'PENDING_SYNC', isOfflinePending: true }
              : checkpoint
          )
        );

        setValidationAlert({
          type: 'warning',
          title: 'PENDING SYNC',
          message: `Scan ${activeCpForScan.code} tersimpan di perangkat dan BELUM VALID. Jangan lanjut ke checkpoint berikutnya sampai server menyelesaikan validasi.`,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error: any) {
        setValidationAlert({
          type: 'error',
          title: 'PENYIMPANAN OFFLINE GAGAL',
          message: error?.message || 'Data checkpoint tidak tersimpan. Jangan meninggalkan lokasi sebelum mencoba kembali.',
        });
      } finally {
        setActiveCpForScan(null);
        setScannedToken(null);
        setCapturedPhoto(null);
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await api.submitPatrolScan(payload);

      if (res.status === 'VALID') {
        setValidationAlert({
          type: 'success',
          title: 'CHECKPOINT VALID',
          message: res.sessionCompleted
            ? `${res.checkpointCode || activeCpForScan.code} valid. Target patroli shift selesai, lanjutkan Turun Jaga.`
            : `${res.checkpointCode || activeCpForScan.code} valid pada jarak ${res.calculatedDistanceM.toFixed(1)}m. Lanjutkan ke checkpoint berikutnya.`,
        });

        if (res.sessionCompleted) {
          triggerConfetti();
        }

        await loadSession();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (res.status === 'REJECTED') {
        setValidationAlert({
          type: 'error',
          title: 'Scan DITOLAK (REJECTED)',
          message: res.rejectionMessage || 'Scan tidak memenuhi kriteria validasi.',
        });
        await loadSession();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setValidationAlert({
          type: 'warning',
          title: 'Perlu Review (REVIEW)',
          message: res.rejectionMessage || 'Bukti foto atau data belum lengkap.',
        });
        await loadSession();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      setValidationAlert({
        type: 'error',
        title: 'Kesalahan Sistem',
        message: err.message || 'Gagal memproses validasi patroli.',
      });
    } finally {
      setActiveCpForScan(null);
      setScannedToken(null);
      setCapturedPhoto(null);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      {/* Tactical Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white">Patroli Lapangan</h1>
                {session && (
                  <span className="rounded-md border border-blue-700/60 bg-blue-900/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-300">
                    Ronde #{session.roundNumber || 1}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {siteInfo?.name || session?.siteId || 'Site Penugasan'}
              </p>
            </div>
          </div>

          {session && (
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-emerald-400">
                {session.totalValid}/{session.totalRequired}
              </span>
              <p className="text-[10px] text-slate-400 font-mono">
                {session.completionPct}% Selesai
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4">
        {validationAlert && (
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 shadow-lg animate-fade-in ${
              validationAlert.type === 'success'
                ? 'border-emerald-700 bg-emerald-950/70 text-emerald-100'
                : validationAlert.type === 'error'
                  ? 'border-red-700 bg-red-950/70 text-red-100'
                  : 'border-amber-700 bg-amber-950/70 text-amber-100'
            }`}
          >
            {validationAlert.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            ) : validationAlert.type === 'error' ? (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-black">{validationAlert.title}</h4>
              <p className="mt-0.5 text-xs leading-5 opacity-90">{validationAlert.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setValidationAlert(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold opacity-60 transition hover:bg-white/5 hover:opacity-100"
              aria-label="Tutup notifikasi"
            >
              ✕
            </button>
          </div>
        )}

        {!session ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 text-center shadow-xl shadow-black/10">
            <Shield className="mx-auto h-9 w-9 text-slate-500" />
            <h2 className="mt-3 text-base font-black text-white">BELUM ADA SESSION PATROLI</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Mulai Shift dari Beranda terlebih dahulu agar urutan checkpoint dapat dibuka.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white"
            >
              KEMBALI KE BERANDA
            </button>
          </section>
        ) : !session.startDocumentationCompleted ? (
          <section className="rounded-3xl border border-amber-700/70 bg-amber-950/35 p-5 shadow-xl shadow-amber-950/10">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">Patroli Dikunci</p>
                <h2 className="mt-1 text-base font-black text-white">LENGKAPI NAIK JAGA</h2>
                <p className="mt-1 text-xs leading-5 text-amber-100/80">
                  Foto Sertigas Naik Jaga wajib disimpan sebelum CP pertama dapat dipindai.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 min-h-11 w-full rounded-xl bg-amber-600 px-4 py-3 text-xs font-black text-white"
            >
              KEMBALI KE BERANDA
            </button>
          </section>
        ) : patrolComplete ? (
          <section className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 p-5 text-center shadow-2xl shadow-emerald-950/30">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Patroli Shift Selesai</p>
            <h2 className="mt-1 text-lg font-black text-white">SEMUA CHECKPOINT VALID</h2>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {session.totalValid}/{session.totalRequired} validasi tersimpan. Session tetap ACTIVE sampai dokumentasi Turun Jaga selesai.
            </p>
            <button
              type="button"
              onClick={handleOpenCloseShift}
              className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500"
            >
              <CheckCircle2 className="h-4 w-4" />
              TURUN JAGA & SELESAIKAN SHIFT
            </button>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border border-blue-800/60 bg-gradient-to-br from-blue-950/55 via-slate-900 to-slate-900 shadow-2xl shadow-blue-950/20">
              <div className="border-b border-slate-800/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Checkpoint Berikutnya</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-3xl font-black text-white">{nextCheckpoint?.code || '-'}</span>
                      <span className="text-sm font-black text-slate-200">{nextCheckpoint?.name || 'Menunggu data'}</span>
                    </div>
                  </div>
                  <span className="rounded-full border border-blue-700/60 bg-blue-950/70 px-2.5 py-1 text-[10px] font-black text-blue-300">
                    RONDE {currentRound}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 border-b border-slate-800/80">
                <div className="border-r border-slate-800 px-3 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">GPS</p>
                  <p className={`mt-1 text-[10px] font-black ${currentGps ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {currentGps ? `±${currentGps.accuracy.toFixed(0)}m` : 'BELUM SIAP'}
                  </p>
                </div>
                <div className="border-r border-slate-800 px-3 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Jarak</p>
                  <p className={`mt-1 font-mono text-[10px] font-black ${nextWithinRadius ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {nextDistanceM === null ? '-' : `${nextDistanceM.toFixed(1)}m`}
                  </p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Radius</p>
                  <p className="mt-1 font-mono text-[10px] font-black text-slate-200">
                    {nextCheckpoint ? `${nextCheckpoint.radiusMeters}m` : '-'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-4">
                {gpsError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-800/70 bg-amber-950/35 p-3 text-[11px] leading-5 text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <span>{gpsError}</span>
                  </div>
                ) : null}

                {scanLockReason ? (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-[11px] leading-5 text-slate-300">
                    {nextPendingSync ? (
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                    ) : (
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    )}
                    <span>{scanLockReason}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/25 p-3 text-[11px] font-bold text-emerald-200">
                    <LocateFixed className="h-4 w-4 shrink-0" />
                    Anda berada di dalam radius. Scan QR checkpoint fisik sekarang.
                  </div>
                )}

                <button
                  type="button"
                  disabled={!!scanLockReason || !nextCheckpoint}
                  onClick={() => nextCheckpoint && handleInitiateScan(nextCheckpoint)}
                  className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  <QrCode className="h-5 w-5" />
                  {nextCheckpoint?.statusInRound === 'REJECTED' || nextCheckpoint?.statusInRound === 'REVIEW'
                    ? `SCAN ULANG ${nextCheckpoint?.code || ''}`
                    : `SCAN ${nextCheckpoint?.code || 'CHECKPOINT'}`}
                </button>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-2 py-2">
                    <p className="text-[9px] font-black text-blue-300">1. QR</p>
                    <p className="mt-0.5 text-[8px] text-slate-500">Scan fisik</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-2 py-2">
                    <p className="text-[9px] font-black text-emerald-300">2. FOTO</p>
                    <p className="mt-0.5 text-[8px] text-slate-500">Kamera live</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-2 py-2">
                    <p className="text-[9px] font-black text-violet-300">3. VALIDASI</p>
                    <p className="mt-0.5 text-[8px] text-slate-500">Server</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Progress Ronde</p>
                  <h2 className="mt-1 text-sm font-black text-white">RONDE {currentRound}</h2>
                </div>
                <span className="font-mono text-xs font-black text-blue-300">{roundCompleted}/{roundRequired} CP</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${roundPct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
                <span>{roundPct}% ronde selesai</span>
                <span>Shift {session.totalValid}/{session.totalRequired}</span>
              </div>
            </section>

            <section>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Rute Patroli</p>
                  <h2 className="mt-0.5 text-xs font-black text-slate-300">Urutan checkpoint wajib</h2>
                </div>
                <span className="text-[9px] font-mono text-slate-600">{activeCheckpoints.length} TITIK</span>
              </div>

              <div className="space-y-2">
                {activeCheckpoints.map((checkpoint, index) => {
                  const isValid = checkpoint.statusInRound === 'VALID';
                  const isCurrent = nextCheckpoint?.id === checkpoint.id;
                  const isPending = checkpoint.statusInRound === 'PENDING_SYNC' || checkpoint.isOfflinePending === true;
                  const isRejected = checkpoint.statusInRound === 'REJECTED';
                  const isReview = checkpoint.statusInRound === 'REVIEW';
                  const locked = !isValid && !isCurrent;

                  return (
                    <div
                      key={checkpoint.id}
                      className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                        isValid
                          ? 'border-emerald-800/60 bg-emerald-950/20'
                          : isCurrent
                            ? 'border-blue-700/70 bg-blue-950/25 shadow-lg shadow-blue-950/10'
                            : 'border-slate-800 bg-slate-900/70'
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono text-[11px] font-black ${
                        isValid
                          ? 'border-emerald-600/50 bg-emerald-600/15 text-emerald-300'
                          : isCurrent
                            ? 'border-blue-500/50 bg-blue-600/15 text-blue-300'
                            : 'border-slate-700 bg-slate-800 text-slate-500'
                      }`}>
                        {isValid ? <CheckCircle2 className="h-4 w-4" /> : locked ? <Lock className="h-4 w-4" /> : checkpoint.code}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-black text-slate-400">{checkpoint.code}</span>
                          <h3 className={`truncate text-xs font-black ${locked ? 'text-slate-500' : 'text-white'}`}>
                            {checkpoint.name}
                          </h3>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {isValid
                            ? 'Sudah tervalidasi'
                            : isPending
                              ? 'Menunggu sinkronisasi server'
                              : isRejected
                                ? checkpoint.lastScanLog?.rejectionMessage || 'Scan terakhir ditolak, ulangi checkpoint ini'
                                : isReview
                                  ? 'Perlu scan ulang setelah review'
                                  : isCurrent
                                    ? 'Checkpoint yang harus dikunjungi sekarang'
                                    : `Terbuka setelah ${activeCheckpoints[index - 1]?.code || 'checkpoint sebelumnya'} valid`}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {isValid ? (
                          <span className="rounded-full border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-[9px] font-black text-emerald-300">VALID</span>
                        ) : isPending ? (
                          <span className="rounded-full border border-blue-700/60 bg-blue-950/40 px-2 py-1 text-[9px] font-black text-blue-300">SYNC</span>
                        ) : isCurrent ? (
                          <ChevronRight className="h-4 w-4 text-blue-300" />
                        ) : (
                          <span className="text-[9px] font-black text-slate-600">LOCK</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {rounds.length > 1 ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Progress Seluruh Shift</p>
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {rounds.map((round) => {
                    const complete = round.completed >= round.required;
                    const active = round.roundNumber === currentRound;
                    return (
                      <div
                        key={round.roundNumber}
                        className={`rounded-xl border px-1 py-2 text-center ${
                          complete
                            ? 'border-emerald-800 bg-emerald-950/30'
                            : active
                              ? 'border-blue-700 bg-blue-950/30'
                              : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        <p className={`text-[9px] font-black ${complete ? 'text-emerald-300' : active ? 'text-blue-300' : 'text-slate-600'}`}>
                          R{round.roundNumber}
                        </p>
                        <p className="mt-0.5 font-mono text-[8px] text-slate-500">{round.completed}/{round.required}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}

        {/* Active Scan Review & Observation Dialog (After Photo is Taken) */}
        {activeCpForScan && scannedToken && capturedPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
            <div className="ops-dialog w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="checkpoint-review-title">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-[#08111f]/95 p-4 backdrop-blur">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-300">Review Bukti Patroli</p>
                  <h3 id="checkpoint-review-title" className="mt-1 text-sm font-black text-white">Konfirmasi Pengamatan</h3>
                  <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-400">
                    {activeCpForScan.code} — {activeCpForScan.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveCpForScan(null);
                    setScannedToken(null);
                    setCapturedPhoto(null);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  aria-label="Tutup konfirmasi checkpoint"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 p-5">
                {/* Photo Evidence Preview */}
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-inner">
                  <img
                    src={capturedPhoto}
                    alt={`Bukti foto checkpoint ${activeCpForScan.code}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-3 top-3 rounded-full border border-blue-400/30 bg-blue-600/90 px-2.5 py-1 text-[10px] font-black text-white shadow-lg">
                    BUKTI FOTO
                  </div>
                  <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-600/90 px-2.5 py-1 text-[10px] font-black text-white shadow-lg">
                    <CheckCircle2 className="h-3 w-3" />
                    FOTO VALID
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">QR</p>
                    <p className="mt-1 text-[11px] font-black text-emerald-300">TERBACA</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">GPS</p>
                    <p className="mt-1 text-[11px] font-black text-emerald-300">TERCATAT</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">AKURASI</p>
                    <p className="mt-1 font-mono text-[11px] font-black text-slate-200">{currentGps ? `±${currentGps.accuracy.toFixed(0)}m` : '-'}</p>
                  </div>
                </div>

                {/* Observation Status Options */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-slate-300">
                    Status Pengamatan Lapangan
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['AMAN', 'TEMUAN', 'INSIDEN'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setObservationStatus(status)}
                        aria-pressed={observationStatus === status}
                        className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${
                          observationStatus === status
                            ? status === 'AMAN'
                              ? 'border-emerald-500 bg-emerald-600/25 text-emerald-300'
                              : status === 'TEMUAN'
                              ? 'border-amber-500 bg-amber-600/25 text-amber-300'
                              : 'border-red-500 bg-red-600/25 text-red-300'
                            : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label className="text-xs font-bold text-slate-300">
                      Catatan Pengamatan
                    </label>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${observationStatus !== 'AMAN' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
                      {observationStatus !== 'AMAN' ? 'WAJIB' : 'OPSIONAL'}
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={observationNotes}
                    onChange={(e) => setObservationNotes(e.target.value)}
                    placeholder={
                      observationStatus === 'AMAN'
                        ? 'Kondisi pintu gembok terkunci, area steril aman...'
                        : 'Jelaskan temuan atau kondisi abnormal yang ditemui...'
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  disabled={submitting || (observationStatus !== 'AMAN' && !observationNotes.trim())}
                  onClick={handleSubmitScan}
                  className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <span>Memvalidasi Data...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>KIRIM & VALIDASI CHECKPOINT</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {showCloseModal && session ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-4"><div className="ops-dialog w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700 bg-[#0f172a] p-5 shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="close-shift-title"><div className="flex items-center justify-between"><div><h2 id="close-shift-title" className="font-black">CLOSE SHIFT</h2><p className="text-xs text-slate-400">Checkpoint {session.totalValid}/{session.totalRequired} lengkap</p></div><button type="button" onClick={() => setShowCloseModal(false)} aria-label="Tutup dialog close shift">✕</button></div><div><span className="text-xs font-bold">Apakah ada TARUNA / serah terima khusus?</span><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setHasSpecialHandover(false)} className={`rounded-xl p-2 text-xs font-bold ${!hasSpecialHandover ? 'bg-blue-600' : 'bg-slate-800'}`}>TIDAK</button><button onClick={() => setHasSpecialHandover(true)} className={`rounded-xl p-2 text-xs font-bold ${hasSpecialHandover ? 'bg-amber-600' : 'bg-slate-800'}`}>YA</button></div></div>{hasSpecialHandover ? <div className="space-y-2"><label className="block text-xs font-bold">Catatan TARUNA<textarea required value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 font-normal" /></label><div className="grid grid-cols-3 gap-2">{specialPhotoUrls.map((photo, index) => <div key={index} className="relative aspect-square overflow-hidden rounded-xl"><img src={photo} alt={`TARUNA ${index + 1}`} className="h-full w-full object-cover" /><button onClick={() => setSpecialPhotoUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1">✕</button></div>)}</div><button disabled={specialPhotoUrls.length >= 5} onClick={() => { setCameraMode('SPECIAL'); setShowCameraModal(true); }} className="w-full rounded-xl border border-dashed border-slate-600 p-2 text-xs font-bold disabled:opacity-40"><Camera className="mr-1 inline h-4 w-4" />DOKUMENTASI TARUNA ({specialPhotoUrls.length}/5)</button>{specialPhotoUrls.length < 3 ? <p className="text-xs text-amber-300">Minimal 3 foto.</p> : null}</div> : null}<div className="rounded-xl border border-blue-900 bg-blue-950/30 p-3"><h3 className="text-xs font-black text-blue-300">SERTIGAS / TURUN JAGA</h3><div className="mt-2 text-xs text-slate-300">Customer {session.customerId} • Site {session.siteId}<br />{session.shiftCode} • {session.shiftDate}<br />End Time otomatis saat konfirmasi</div>{endPhotoUrl ? <img src={endPhotoUrl} alt="Turun Jaga" className="mt-2 max-h-56 w-full rounded-xl object-cover" /> : <button onClick={() => { setCameraMode('END'); setShowCameraModal(true); }} className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-700 p-3 text-xs font-bold"><Camera className="mr-1 inline h-4 w-4" />AMBIL FOTO TURUN JAGA</button>}</div><button disabled={submitting || !endPhotoUrl || (hasSpecialHandover && (!specialNotes.trim() || specialPhotoUrls.length < 3 || specialPhotoUrls.length > 5))} onClick={() => void handleCloseShift()} className="sticky bottom-0 w-full rounded-xl bg-emerald-600 p-3 text-sm font-black tracking-wide disabled:opacity-40">KONFIRMASI & SELESAIKAN SHIFT</button></div></div> : null}

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        onScanSuccess={handleQrDetected}
        expectedCheckpointCode={activeCpForScan?.code}
        expectedCheckpointName={activeCpForScan?.name}
      />

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handlePhotoCaptured}
        checkpointCode={cameraMode === 'CHECKPOINT' ? activeCpForScan?.code : cameraMode === 'END' ? 'TURUN JAGA' : 'TARUNA'}
        checkpointName={cameraMode === 'CHECKPOINT' ? activeCpForScan?.name : 'Dokumentasi Shift'}
        latitude={currentGps?.latitude}
        longitude={currentGps?.longitude}
        gpsAccuracyM={currentGps?.accuracy}
        siteLabel={siteInfo?.code || siteInfo?.id || session?.siteId}
      />
    </div>
  );
};
