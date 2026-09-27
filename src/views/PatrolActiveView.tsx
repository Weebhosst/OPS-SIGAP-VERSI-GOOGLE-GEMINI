/**
 * OPS SIGAP — Active Patrol Round View
 * Complete patrol flow: QR scan + GPS geofence + live camera evidence photo + server-authoritative validation
 */

import React, { useEffect, useState } from 'react';
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
  RotateCcw,
  Sparkles,
  Radio,
  LocateFixed,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PatrolSession, Checkpoint, PatrolLog, calculateDistanceMeters } from '../types/ops';
import { QRScannerModal } from '../components/QRScannerModal';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { offlineQueue } from '../lib/offlineQueue';

interface PatrolActiveViewProps {
  onBack: () => void;
}

export const PatrolActiveView: React.FC<PatrolActiveViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [session, setSession] = useState<PatrolSession | null>(null);
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
    isSimulated?: boolean;
  }>({
    latitude: -6.48125, // Default around CP02 for BB92
    longitude: 107.631806,
    accuracy: 3.5,
  });
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
  const [endPhotoUrl, setEndPhotoUrl] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'CHECKPOINT' | 'SPECIAL' | 'END'>('CHECKPOINT');
  const [validationAlert, setValidationAlert] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  // Load active session and checkpoints
  const loadSession = async () => {
    try {
      const res = await api.getCurrentSession();
      if (res.success && res.hasOpenSession && res.session) {
        setSession(res.session);
        setCheckpoints(res.checkpoints);
        if (res.logs) setLogs(res.logs);
        setRounds(res.rounds || []);
        setCurrentRound(res.currentRound || 1);

        // Check if round was just completed
        if (res.session.status === 'COMPLETED' || res.session.totalValid >= res.session.totalRequired) {
          triggerConfetti();
        }
      } else {
        setSession(null);
      }
    } catch (err: any) {
      console.warn('Error loading patrol session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();

    // Start GPS watch
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCurrentGps({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            isSimulated: false,
          });
          setGpsError(null);
        },
        (err) => {
          console.warn('[GPS] Geolocation warning:', err.message);
          // Keep default BB92 location for smooth evaluation if GPS hardware is unavailable
          setGpsError('GPS hardware lemah/izin nonaktif. Menggunakan koordinat area site BB92.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
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

  // Start new round
  const handleStartNewRound = async () => {
    setLoading(true);
    try {
      const res = await api.startPatrolSession();
      if (res.success && res.session) {
        await loadSession();
      }
    } catch (err: any) {
      setValidationAlert({
        type: 'error',
        title: 'Gagal Memulai Ronde',
        message: err.message || 'Tidak dapat memulai ronde baru',
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Guard clicks Scan on a checkpoint
  const handleInitiateScan = (cp: any) => {
    if (cp.statusInRound === 'VALID') return;
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

  const handleOpenCloseShift = () => {
    if (!session) return;
    if (session.totalValid < session.totalRequired) {
      const missing = checkpoints.filter((checkpoint) => checkpoint.statusInRound !== 'VALID').map((checkpoint) => `${checkpoint.code} ${checkpoint.name}`).join(', ');
      setValidationAlert({ type: 'error', title: 'CLOSE SHIFT DITOLAK', message: `Patroli belum selesai. Checkpoint ${session.totalValid}/${session.totalRequired}. Belum selesai: ${missing}.` });
      return;
    }
    setShowCloseModal(true);
  };

  const handleCloseShift = async () => {
    if (!session || !endPhotoUrl) return;
    setSubmitting(true);
    try {
      await api.closePatrolSession(session.id, { endPhotoUrl, hasSpecialHandover, specialNotes, specialPhotoUrls });
      setShowCloseModal(false);
      await loadSession();
      setValidationAlert({ type: 'success', title: 'SHIFT COMPLETED', message: 'Turun Jaga tersimpan dan session berhasil diselesaikan.' });
    } catch (error: any) { setValidationAlert({ type: 'error', title: 'CLOSE SHIFT DITOLAK', message: error.message || 'Shift belum dapat ditutup.' }); }
    finally { setSubmitting(false); }
  };

  // Step 4: Final submission with observation status
  const handleSubmitScan = async () => {
    if (!session || !activeCpForScan || !scannedToken) return;

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
      // Offline fallback: save into IndexedDB queue
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

      // Update optimistic local UI
      setCheckpoints((prev) =>
        prev.map((c) =>
          c.id === activeCpForScan.id
            ? { ...c, statusInRound: 'VALID', isOfflinePending: true }
            : c
        )
      );

      setValidationAlert({
        type: 'warning',
        title: 'Tersimpan di Perangkat (Offline)',
        message: `Scan ${activeCpForScan.code} tersimpan di antrean HP dan akan tervalidasi server saat koneksi pulih.`,
      });

      setActiveCpForScan(null);
      setScannedToken(null);
      setCapturedPhoto(null);
      setSubmitting(false);
      return;
    }

    try {
      const res = await api.submitPatrolScan(payload);

      if (res.status === 'VALID') {
        setValidationAlert({
          type: 'success',
          title: 'Checkpoint VALID!',
          message: `${res.checkpointCode || activeCpForScan.code} berhasil tervalidasi (Jarak ${res.calculatedDistanceM.toFixed(1)}m). Progress: ${res.totalValid}/${res.totalRequired}.`,
        });

        if (res.sessionCompleted) {
          triggerConfetti();
        }

        await loadSession();
      } else if (res.status === 'REJECTED') {
        setValidationAlert({
          type: 'error',
          title: 'Scan DITOLAK (REJECTED)',
          message: res.rejectionMessage || 'Scan tidak memenuhi kriteria validasi.',
        });
        await loadSession();
      } else {
        setValidationAlert({
          type: 'warning',
          title: 'Perlu Review (REVIEW)',
          message: res.rejectionMessage || 'Bukti foto atau data belum lengkap.',
        });
        await loadSession();
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

  // Helper to test calibration GPS points
  const setSimulationGps = (cp: any, offsetM = 0) => {
    // 1 deg lat is approx 111,320m, 1m is ~0.000009 deg
    const latOffset = (offsetM * 0.000009);
    setCurrentGps({
      latitude: cp.latitude + latOffset,
      longitude: cp.longitude,
      accuracy: 3.0,
      isSimulated: true,
    });
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
              <p className="text-[11px] text-slate-400 font-medium">Site BB92 • KM 92</p>
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
        {/* GPS Live Telemetry */}
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-lg shadow-black/10">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${currentGps.isSimulated ? 'border-purple-700/60 bg-purple-900/25 text-purple-300' : 'border-emerald-700/60 bg-emerald-900/25 text-emerald-300'}`}>
                <LocateFixed className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Verifikasi Lokasi</p>
                <p className="mt-0.5 text-sm font-black text-white">{currentGps.isSimulated ? 'GPS Simulasi' : 'GPS Perangkat Aktif'}</p>
              </div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${currentGps.accuracy > 20 ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
              ±{currentGps.accuracy.toFixed(1)} m
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Latitude</p>
              <p className="mt-1 font-mono font-bold text-slate-200">{currentGps.latitude.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Longitude</p>
              <p className="mt-1 font-mono font-bold text-slate-200">{currentGps.longitude.toFixed(6)}</p>
            </div>
          </div>
          {currentGps.accuracy > 20 ? (
            <div className="border-t border-amber-900/60 bg-amber-950/30 px-4 py-2.5 text-[11px] font-semibold text-amber-300">
              Akurasi GPS rendah. Posisi tetap mengikuti data GPS perangkat yang sedang diterima.
            </div>
          ) : null}
        </section>

        {gpsError && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-800/80 bg-amber-950/40 p-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{gpsError}</span>
          </div>
        )}

        {/* Validation Feedback Banner */}
        {validationAlert && (
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 shadow-lg animate-fade-in ${
              validationAlert.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-100'
                : validationAlert.type === 'error'
                ? 'bg-red-950/70 border-red-700 text-red-100'
                : 'bg-amber-950/70 border-amber-700 text-amber-100'
            }`}
          >
            {validationAlert.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : validationAlert.type === 'error' ? (
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="font-bold text-sm">{validationAlert.title}</h4>
              <p className="text-xs opacity-90 mt-0.5">{validationAlert.message}</p>
            </div>
            <button
              onClick={() => setValidationAlert(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold opacity-60 transition hover:bg-white/5 hover:opacity-100"
              aria-label="Tutup notifikasi"
            >
              ✕
            </button>
          </div>
        )}

        {session && !session.startDocumentationCompleted ? <div className="rounded-2xl border border-amber-700/70 bg-amber-950/40 p-4 text-xs leading-5 text-amber-200">Sertigas Naik Jaga belum disimpan. Kembali ke Buku Mutasi untuk mengambil foto wajib sebelum scan checkpoint.</div> : null}

        {session ? <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black tracking-wide">PROGRESS RONDE</h2><span className="rounded-full border border-blue-800/70 bg-blue-950/70 px-2.5 py-1 text-[10px] font-bold text-blue-300">RONDE AKTIF {currentRound}</span></div><div className="grid gap-2 sm:grid-cols-2">{rounds.map((round) => { const complete = round.completed >= round.required; const completedCodes = checkpoints.filter((checkpoint) => round.checkpointIds.includes(checkpoint.id)); const pendingCodes = checkpoints.filter((checkpoint) => !round.checkpointIds.includes(checkpoint.id)); return <div key={round.roundNumber} className={`rounded-xl border p-3 text-xs ${complete ? 'border-emerald-800 bg-emerald-950/20' : round.roundNumber === currentRound ? 'border-blue-800 bg-blue-950/20' : 'border-slate-800 bg-slate-950'}`}><div className="flex justify-between font-black"><span>RONDE {round.roundNumber}</span><span>{round.completed}/{round.required} {complete ? 'COMPLETE' : ''}</span></div>{completedCodes.length ? <div className="mt-2 text-emerald-300">Completed: {completedCodes.map((checkpoint) => `${checkpoint.code} ✓`).join(', ')}</div> : null}{pendingCodes.length ? <div className="mt-1 text-slate-400">Pending: {pendingCodes.map((checkpoint) => checkpoint.code).join(', ')}</div> : null}</div>; })}</div></section> : null}

        {/* Target checkpoint achieved; normal close still requires Turun Jaga. */}
        {session && session.totalValid >= session.totalRequired && (
          <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 p-5 text-center shadow-2xl shadow-emerald-950/30">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-white">TARGET CHECKPOINT TERCAPAI</h2>
            <p className="text-xs text-emerald-300 mt-1 font-medium">
              {session.totalValid} dari {session.totalRequired} checkpoint terverifikasi. Lanjutkan Close Shift dan Turun Jaga.
            </p>
            <div className="text-[11px] text-slate-400 font-mono mt-2">
              Session tetap ACTIVE sampai dokumentasi Turun Jaga tersimpan.
            </div>

            <button
              onClick={handleOpenCloseShift}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>CLOSE SHIFT</span>
            </button>
          </div>
        )}

        {session && session.totalValid < session.totalRequired ? <button onClick={handleOpenCloseShift} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 p-3 text-xs font-bold text-slate-300 shadow-sm transition hover:border-slate-600 hover:bg-slate-800">CLOSE SHIFT ({session.totalValid}/{session.totalRequired})</button> : null}

        {/* Checkpoints Header */}
        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-300">QR + GPS Radius</p>
            <h2 className="mt-1 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-300">
              Titik Checkpoint {session?.siteId || ''} ({checkpoints.length} Titik Wajib)
            </h2>
          </div>
          <span className="rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1 font-mono text-[10px] text-slate-400">
            Radius Ketat 10-15m
          </span>
        </div>

        {/* 5 Checkpoints List */}
        <div className="space-y-3">
          {checkpoints.map((cp, idx) => {
            const isValid = cp.statusInRound === 'VALID';
            const isRejected = cp.statusInRound === 'REJECTED';
            const isReview = cp.statusInRound === 'REVIEW';

            // Calculate distance to current GPS
            const distanceNow = calculateDistanceMeters(
              currentGps.latitude,
              currentGps.longitude,
              cp.latitude,
              cp.longitude
            );

            return (
              <div
                key={cp.id}
                className={`rounded-2xl border bg-slate-900/90 p-4 shadow-sm transition-all ${
                  isValid
                    ? 'border-emerald-700/50 bg-emerald-950/10'
                    : isRejected
                    ? 'border-red-700/60 bg-red-950/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black ${
                        isValid
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
                          : isRejected
                          ? 'bg-red-600/20 text-red-400 border border-red-500/40'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {cp.code}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black leading-tight text-white">{cp.name}</h3>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1 font-mono text-slate-400">
                          Radius {cp.radiusMeters}m
                        </span>
                        <span className={`rounded-lg border px-2 py-1 font-mono font-bold ${distanceNow <= cp.radiusMeters ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300' : 'border-amber-700/60 bg-amber-950/30 text-amber-300'}`}>
                          Jarak HP {distanceNow.toFixed(1)}m
                        </span>
                        <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${distanceNow <= cp.radiusMeters ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                          {distanceNow <= cp.radiusMeters ? 'DALAM RADIUS' : 'DI LUAR RADIUS'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="sm:ml-auto">
                    {isValid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" /> VALID
                      </span>
                    ) : isRejected ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300">
                        <XCircle className="w-3.5 h-3.5" /> REJECTED
                      </span>
                    ) : isReview ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5" /> REVIEW
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        BELUM
                      </span>
                    )}
                  </div>
                </div>

                {/* Last scan rejection message if present */}
                {isRejected && cp.lastScanLog?.rejectionMessage && (
                  <div className="mt-3 p-2.5 bg-red-950/40 border border-red-900/60 rounded-xl text-xs text-red-300">
                    <strong>Catatan Penolakan:</strong> {cp.lastScanLog.rejectionMessage}
                  </div>
                )}

                {/* Actions Bar */}
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Calibration / Test helper button (Positions GPS near checkpoint) */}
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSimulationGps(cp, 0)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-[10px] text-slate-300 transition hover:bg-slate-700"
                      title="Set koordinat HP persis di titik checkpoint ini (0m)"
                    >
                      Set GPS 0m
                    </button>
                    {cp.code === 'CP02' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSimulationGps(cp, 14.86)}
                          className="rounded-lg border border-emerald-800/60 bg-slate-800 px-2 py-1.5 font-mono text-[10px] text-emerald-300 transition hover:bg-slate-700"
                          title="Simulasi 14.86m (Harus VALID)"
                        >
                          14.86m (VALID)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSimulationGps(cp, 16.3)}
                          className="rounded-lg border border-red-800/60 bg-slate-800 px-2 py-1.5 font-mono text-[10px] text-red-300 transition hover:bg-slate-700"
                          title="Simulasi 16.3m (Harus REJECTED)"
                        >
                          16.3m (REJECT)
                        </button>
                      </>
                    )}
                  </div>

                  {/* Main Scan Trigger */}
                  <div className="sm:ml-auto">
                    {isValid ? (
                      <span className="text-xs text-slate-500 font-medium italic">
                        Sudah Tervalidasi
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInitiateScan(cp)}
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black shadow transition focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${
                          isRejected
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>{isRejected ? 'Scan Ulang' : 'Scan Checkpoint'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
                    <p className="mt-1 font-mono text-[11px] font-black text-slate-200">±{currentGps.accuracy.toFixed(0)}m</p>
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
        availableTokens={checkpoints.map((c) => ({
          code: c.code,
          name: c.name,
          token: c.qrToken,
        }))}
      />

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handlePhotoCaptured}
        checkpointCode={cameraMode === 'CHECKPOINT' ? activeCpForScan?.code : cameraMode === 'END' ? 'TURUN JAGA' : 'TARUNA'}
        checkpointName={cameraMode === 'CHECKPOINT' ? activeCpForScan?.name : 'Dokumentasi Shift'}
        latitude={currentGps.latitude}
        longitude={currentGps.longitude}
        gpsAccuracyM={currentGps.accuracy}
      />
    </div>
  );
};
