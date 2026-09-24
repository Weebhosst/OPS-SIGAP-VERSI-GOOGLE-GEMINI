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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      {/* Tactical Top Bar */}
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
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-white text-base">Patroli Lapangan</h1>
                {session && (
                  <span className="text-[10px] bg-blue-900/60 border border-blue-700 text-blue-300 font-mono px-1.5 py-0.5 rounded font-bold">
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

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* GPS Live Telemetry Pill */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                currentGps.isSimulated
                  ? 'bg-purple-900/30 text-purple-400 border border-purple-700/50'
                  : 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/50'
              }`}
            >
              <LocateFixed className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white font-mono">
                  {currentGps.latitude.toFixed(6)}, {currentGps.longitude.toFixed(6)}
                </span>
                {currentGps.isSimulated && (
                  <span className="text-[9px] bg-purple-950 text-purple-300 px-1 rounded font-mono">
                    SIM
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <span>Akurasi GPS: ±{currentGps.accuracy.toFixed(1)}m</span>
                {currentGps.accuracy > 20 && (
                  <span className="text-amber-400 font-bold">(GPS LOW ACCURACY)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {gpsError && (
          <div className="p-2.5 bg-amber-950/40 border border-amber-800 text-amber-300 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{gpsError}</span>
          </div>
        )}

        {/* Validation Feedback Banner */}
        {validationAlert && (
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 shadow-md animate-fade-in ${
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
              className="text-xs opacity-60 hover:opacity-100 px-1 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {session && !session.startDocumentationCompleted ? <div className="rounded-2xl border border-amber-800 bg-amber-950/50 p-4 text-xs text-amber-200">Sertigas Naik Jaga belum disimpan. Kembali ke Buku Mutasi untuk mengambil foto wajib sebelum scan checkpoint.</div> : null}

        {session ? <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black">PROGRESS RONDE</h2><span className="rounded bg-blue-950 px-2 py-1 text-[10px] font-bold text-blue-300">RONDE AKTIF {currentRound}</span></div><div className="grid gap-2 sm:grid-cols-2">{rounds.map((round) => { const complete = round.completed >= round.required; const completedCodes = checkpoints.filter((checkpoint) => round.checkpointIds.includes(checkpoint.id)); const pendingCodes = checkpoints.filter((checkpoint) => !round.checkpointIds.includes(checkpoint.id)); return <div key={round.roundNumber} className={`rounded-xl border p-3 text-xs ${complete ? 'border-emerald-800 bg-emerald-950/20' : round.roundNumber === currentRound ? 'border-blue-800 bg-blue-950/20' : 'border-slate-800 bg-slate-950'}`}><div className="flex justify-between font-black"><span>RONDE {round.roundNumber}</span><span>{round.completed}/{round.required} {complete ? 'COMPLETE' : ''}</span></div>{completedCodes.length ? <div className="mt-2 text-emerald-300">Completed: {completedCodes.map((checkpoint) => `${checkpoint.code} ✓`).join(', ')}</div> : null}{pendingCodes.length ? <div className="mt-1 text-slate-400">Pending: {pendingCodes.map((checkpoint) => checkpoint.code).join(', ')}</div> : null}</div>; })}</div></section> : null}

        {/* Target checkpoint achieved; normal close still requires Turun Jaga. */}
        {session && session.totalValid >= session.totalRequired && (
          <div className="bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/50 rounded-3xl p-5 text-center shadow-xl shadow-emerald-950/30">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-3">
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
              className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>CLOSE SHIFT</span>
            </button>
          </div>
        )}

        {session && session.totalValid < session.totalRequired ? <button onClick={handleOpenCloseShift} className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-3 text-xs font-bold text-slate-300">CLOSE SHIFT ({session.totalValid}/{session.totalRequired})</button> : null}

        {/* Checkpoints Header */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Titik Checkpoint {session?.siteId || ''} ({checkpoints.length} Titik Wajib)
          </h2>
          <span className="text-[11px] font-mono text-slate-400">
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
                className={`bg-slate-900 border rounded-2xl p-4 transition-all ${
                  isValid
                    ? 'border-emerald-700/50 bg-emerald-950/10'
                    : isRejected
                    ? 'border-red-700/60 bg-red-950/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
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
                        <h3 className="font-bold text-white text-sm leading-tight">{cp.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                        <span>Radius: {cp.radiusMeters}m</span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${
                            distanceNow <= cp.radiusMeters ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          Jarak HP: {distanceNow.toFixed(1)}m
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
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
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  {/* Calibration / Test helper button (Positions GPS near checkpoint) */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSimulationGps(cp, 0)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded font-mono"
                      title="Set koordinat HP persis di titik checkpoint ini (0m)"
                    >
                      Set GPS 0m
                    </button>
                    {cp.code === 'CP02' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSimulationGps(cp, 14.86)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] rounded font-mono"
                          title="Simulasi 14.86m (Harus VALID)"
                        >
                          14.86m (VALID)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSimulationGps(cp, 16.3)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-red-300 text-[10px] rounded font-mono"
                          title="Simulasi 16.3m (Harus REJECTED)"
                        >
                          16.3m (REJECT)
                        </button>
                      </>
                    )}
                  </div>

                  {/* Main Scan Trigger */}
                  <div>
                    {isValid ? (
                      <span className="text-xs text-slate-500 font-medium italic">
                        Sudah Tervalidasi
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInitiateScan(cp)}
                        className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition ${
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="font-bold text-white text-sm">Konfirmasi Pengamatan Patroli</h3>
                  <p className="text-xs text-blue-400 font-mono">
                    {activeCpForScan.code} — {activeCpForScan.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveCpForScan(null);
                    setScannedToken(null);
                    setCapturedPhoto(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Photo Evidence Preview */}
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video relative">
                <img
                  src={capturedPhoto}
                  alt="Captured Evidence"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                  FOTO VALID
                </div>
              </div>

              {/* Observation Status Options */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Status Pengamatan Lapangan:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['AMAN', 'TEMUAN', 'INSIDEN'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setObservationStatus(status)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs border transition ${
                        observationStatus === status
                          ? status === 'AMAN'
                            ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                            : status === 'TEMUAN'
                            ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                            : 'bg-red-600/30 border-red-500 text-red-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Catatan Pengamatan {observationStatus !== 'AMAN' ? '(Wajib)' : '(Opsional)'}:
                </label>
                <textarea
                  rows={2}
                  value={observationNotes}
                  onChange={(e) => setObservationNotes(e.target.value)}
                  placeholder={
                    observationStatus === 'AMAN'
                      ? 'Kondisi pintu gembok terkunci, area steril aman...'
                      : 'Jelaskan temuan atau kondisi abnormal yang ditemui...'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={submitting || (observationStatus !== 'AMAN' && !observationNotes.trim())}
                onClick={handleSubmitScan}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2 transition"
              >
                {submitting ? (
                  <span>Memvalidasi Data...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>KIRIM & VALIDASI CHECKPOINT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {showCloseModal && session ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"><div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex items-center justify-between"><div><h2 className="font-black">CLOSE SHIFT</h2><p className="text-xs text-slate-400">Checkpoint {session.totalValid}/{session.totalRequired} lengkap</p></div><button onClick={() => setShowCloseModal(false)}>✕</button></div><div><span className="text-xs font-bold">Apakah ada TARUNA / serah terima khusus?</span><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setHasSpecialHandover(false)} className={`rounded-xl p-2 text-xs font-bold ${!hasSpecialHandover ? 'bg-blue-600' : 'bg-slate-800'}`}>TIDAK</button><button onClick={() => setHasSpecialHandover(true)} className={`rounded-xl p-2 text-xs font-bold ${hasSpecialHandover ? 'bg-amber-600' : 'bg-slate-800'}`}>YA</button></div></div>{hasSpecialHandover ? <div className="space-y-2"><label className="block text-xs font-bold">Catatan TARUNA<textarea required value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-700 bg-slate-950 p-2 font-normal" /></label><div className="grid grid-cols-3 gap-2">{specialPhotoUrls.map((photo, index) => <div key={index} className="relative aspect-square overflow-hidden rounded-xl"><img src={photo} alt={`TARUNA ${index + 1}`} className="h-full w-full object-cover" /><button onClick={() => setSpecialPhotoUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1">✕</button></div>)}</div><button disabled={specialPhotoUrls.length >= 5} onClick={() => { setCameraMode('SPECIAL'); setShowCameraModal(true); }} className="w-full rounded-xl border border-dashed border-slate-600 p-2 text-xs font-bold disabled:opacity-40"><Camera className="mr-1 inline h-4 w-4" />DOKUMENTASI TARUNA ({specialPhotoUrls.length}/5)</button>{specialPhotoUrls.length < 3 ? <p className="text-xs text-amber-300">Minimal 3 foto.</p> : null}</div> : null}<div className="rounded-xl border border-blue-900 bg-blue-950/30 p-3"><h3 className="text-xs font-black text-blue-300">SERTIGAS / TURUN JAGA</h3><div className="mt-2 text-xs text-slate-300">Customer {session.customerId} • Site {session.siteId}<br />{session.shiftCode} • {session.shiftDate}<br />End Time otomatis saat konfirmasi</div>{endPhotoUrl ? <img src={endPhotoUrl} alt="Turun Jaga" className="mt-2 max-h-56 w-full rounded-xl object-cover" /> : <button onClick={() => { setCameraMode('END'); setShowCameraModal(true); }} className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-700 p-3 text-xs font-bold"><Camera className="mr-1 inline h-4 w-4" />AMBIL FOTO TURUN JAGA</button>}</div><button disabled={submitting || !endPhotoUrl || (hasSpecialHandover && (!specialNotes.trim() || specialPhotoUrls.length < 3 || specialPhotoUrls.length > 5))} onClick={() => void handleCloseShift()} className="sticky bottom-0 w-full rounded-xl bg-emerald-600 p-3 text-sm font-black disabled:opacity-40">KONFIRMASI & SELESAIKAN SHIFT</button></div></div> : null}

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
