/**
 * OPS SIGAP — Live Camera Photo Evidence Capture Modal
 * Captures live field photos with embedded tactical watermark overlay
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCcw, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { getJakartaDateParts } from '../types/ops';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photoBase64: string) => void;
  checkpointCode?: string;
  checkpointName?: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracyM?: number;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  checkpointCode,
  checkpointName,
  latitude,
  longitude,
  gpsAccuracyM,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh perangkat/browser ini.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('[Camera Capture] Error accessing camera:', err);
      setCameraError(
        err.message || 'Izin kamera ditolak atau kamera sedang digunakan aplikasi lain.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    setIsProcessing(true);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    // Draw video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Render Tactical Watermark Banner at bottom
    const bannerHeight = Math.max(60, Math.floor(height * 0.16));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

    // Thin accent bar
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, height - bannerHeight, width, 3);

    // Text formatting
    const { dateString, timeString } = getJakartaDateParts();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`OPS SIGAP EVIDENCE • BB92`, 16, height - bannerHeight + 22);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#94a3b8';
    const locText =
      latitude && longitude
        ? `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${gpsAccuracyM?.toFixed(0) || 3}m)`
        : 'GPS: Memverifikasi sinyal...';
    ctx.fillText(locText, 16, height - bannerHeight + 40);

    const cpText = checkpointCode
      ? `${checkpointCode} — ${checkpointName || ''} • ${dateString} ${timeString} WIB`
      : `WAKTU: ${dateString} ${timeString} WIB`;
    ctx.fillText(cpText, 16, height - bannerHeight + 56);

    const base64 = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedImage(base64);
    setIsProcessing(false);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  // Fallback file input if camera device fails
  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          // Add watermark
          const bannerHeight = Math.max(60, Math.floor(img.height * 0.16));
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(0, img.height - bannerHeight, img.width, bannerHeight);
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(0, img.height - bannerHeight, img.width, 3);
          const { dateString, timeString } = getJakartaDateParts();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px monospace';
          ctx.fillText(`OPS SIGAP EVIDENCE • BB92`, 16, img.height - bannerHeight + 24);
          ctx.font = '13px monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(
            `GPS: ${latitude?.toFixed(6) || '-6.481250'}, ${longitude?.toFixed(6) || '107.631806'} • ${dateString} ${timeString} WIB`,
            16,
            img.height - bannerHeight + 46
          );
          setCapturedImage(canvas.toDataURL('image/jpeg', 0.82));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
      <div className="ops-dialog flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="camera-capture-title">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-300" />
            <div>
              <h3 id="camera-capture-title" className="text-sm font-black text-white">Ambil Foto Bukti Lapangan</h3>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {checkpointCode ? `Titik ${checkpointCode}` : 'Dokumentasi Live'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Tutup kamera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-2.5 text-[10px]" aria-live="polite">
          <span className="font-bold uppercase tracking-[0.14em] text-slate-500">Bukti foto lapangan</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-bold ${capturedImage ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${capturedImage ? 'bg-emerald-400' : 'bg-blue-400'}`} />
            {capturedImage ? 'FOTO SIAP' : 'KAMERA AKTIF'}
          </span>
        </div>

        {/* Viewfinder or Preview */}
        <div className="relative flex min-h-[240px] max-h-[58dvh] flex-1 items-center justify-center overflow-hidden bg-black sm:min-h-[320px]">
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />

              {/* Watermark overlay preview */}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 text-left">
                <div className="font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">
                  LIVE OVERLAY • KM 92
                </div>
                <div className="mt-1 font-mono text-[10px] text-slate-300">
                  {checkpointCode} {checkpointName ? `— ${checkpointName}` : ''}
                </div>
              </div>

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#020817]/95 p-6 text-center text-slate-300" role="alert">
                  <AlertCircle className="h-10 w-10 text-amber-300" />
                  <p className="max-w-xs text-xs leading-5 text-slate-200">{cameraError}</p>
                  <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-500 focus-within:ring-2 focus-within:ring-blue-400/40">
                    Pilih File Foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileFallback}
                    />
                  </label>
                </div>
              )}
            </>
          ) : (
            <div className="relative flex h-full w-full items-center justify-center">
              <img
                src={capturedImage}
                alt="Captured Evidence"
                className="max-h-[420px] h-full w-full object-contain"
              />
              <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
                <Check className="w-3.5 h-3.5" /> Foto Siap Digunakan
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-[#08111f] p-4">
          {!capturedImage ? (
            <div className="flex w-full items-center justify-between gap-3">
              <label className="cursor-pointer mt-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
                <span>Galeri Kamera</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileFallback}
                />
              </label>

              {/* Big Circular Shutter Button */}
              <button
                type="button"
                disabled={isProcessing || !!cameraError}
                onClick={takeSnapshot}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-white/85 bg-emerald-600 shadow-xl shadow-emerald-950/40 transition hover:bg-emerald-500 active:scale-95 focus:outline-none focus:ring-4 focus:ring-emerald-400/20 disabled:opacity-50"
                aria-label="Ambil foto bukti"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                  <Camera className="h-6 w-6 text-emerald-800" />
                </div>
              </button>

              <button
                type="button"
                onClick={startCamera}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                title="Restart Kamera"
                aria-label="Mulai ulang kamera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-3 text-xs font-bold text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-600"
              >
                <RotateCcw className="w-4 h-4" /> Ambil Ulang
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                <Check className="w-4 h-4" /> Pakai Bukti Foto
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
