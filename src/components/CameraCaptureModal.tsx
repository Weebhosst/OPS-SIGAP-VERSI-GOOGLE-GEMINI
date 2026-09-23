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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-semibold text-white text-sm">Ambil Foto Bukti Lapangan</h3>
              <p className="text-xs text-slate-400">
                {checkpointCode ? `Titik ${checkpointCode}` : 'Dokumentasi Live'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder or Preview */}
        <div className="relative bg-black flex-1 min-h-[300px] flex items-center justify-center overflow-hidden">
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Watermark overlay preview */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-left pointer-events-none">
                <div className="text-[11px] font-mono text-emerald-400 font-bold">
                  LIVE OVERLAY • KM 92
                </div>
                <div className="text-[10px] font-mono text-slate-300">
                  {checkpointCode} {checkpointName ? `— ${checkpointName}` : ''}
                </div>
              </div>

              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center text-slate-300 gap-3">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                  <p className="text-xs text-slate-200">{cameraError}</p>
                  <label className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold">
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
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={capturedImage}
                alt="Captured Evidence"
                className="w-full h-full object-contain max-h-[380px]"
              />
              <div className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 shadow">
                <Check className="w-3.5 h-3.5" /> Foto Siap Digunakan
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          {!capturedImage ? (
            <div className="w-full flex items-center justify-between">
              <label className="cursor-pointer text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
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
                className="w-16 h-16 rounded-full border-4 border-white/80 bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition flex items-center justify-center shadow-lg shadow-emerald-900/40 disabled:opacity-50"
              >
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center">
                  <Camera className="w-6 h-6 text-emerald-800" />
                </div>
              </button>

              <button
                type="button"
                onClick={startCamera}
                className="p-2 rounded-lg text-slate-400 hover:text-white"
                title="Restart Kamera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="w-full grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition"
              >
                <RotateCcw className="w-4 h-4" /> Ambil Ulang
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-950/50 transition"
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
