/**
 * OPS SIGAP — Live Camera QR Scanner Modal
 * Uses HTML5 getUserMedia + jsQR for real-time camera decoding
 */

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (token: string) => void;
  expectedCheckpointCode?: string;
  expectedCheckpointName?: string;
  availableTokens?: { code: string; name: string; token: string }[];
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  expectedCheckpointCode,
  expectedCheckpointName,
  availableTokens = [],
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [selectedQuickToken, setSelectedQuickToken] = useState('');
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung pada browser ini.');
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
        startScanningLoop();
      }
    } catch (err: any) {
      console.warn('[QR Scanner] Camera access failed or denied:', err);
      setCameraError(
        err.message || 'Tidak dapat mengakses kamera. Pastikan izin kamera aktif atau gunakan simulasi barcode.'
      );
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setIsScanning(false);
  };

  const startScanningLoop = () => {
    const scan = () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            handleDetected(code.data);
            return;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(scan);
    };

    animationFrameRef.current = requestAnimationFrame(scan);
  };

  const handleDetected = (data: string) => {
    stopCamera();
    try {
      // Gentle haptic feedback if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch {}
    onScanSuccess(data);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-blue-300" />
            <div>
              <h3 className="text-sm font-black text-white">Scanner QR Checkpoint</h3>
              {expectedCheckpointCode && (
                <p className="mt-0.5 font-mono text-[11px] font-bold text-blue-300">
                  Titik: {expectedCheckpointCode} {expectedCheckpointName ? `— ${expectedCheckpointName}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Tutup scanner QR"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-2.5 text-[10px]">
          <span className="font-bold uppercase tracking-[0.14em] text-slate-500">Pemindaian checkpoint</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-bold ${isScanning && !cameraError ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isScanning && !cameraError ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {isScanning && !cameraError ? 'SCANNER AKTIF' : 'SCANNER SIAGA'}
          </span>
        </div>

        {/* Video / Camera viewfinder */}
        <div className="relative flex min-h-[300px] max-h-[420px] flex-1 items-center justify-center overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Overlay Frame */}
          {isScanning && !cameraError && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="relative h-60 w-60 rounded-3xl border border-blue-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.58),0_0_40px_rgba(37,99,235,0.12)]">
                {/* Corner markers */}
                <div className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-xl border-l-4 border-t-4 border-blue-300" />
                <div className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-xl border-r-4 border-t-4 border-blue-300" />
                <div className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-blue-300" />
                <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-blue-300" />

                {/* Laser animation bar */}
                <div className="absolute left-3 right-3 top-0 h-0.5 animate-bounce bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />
              </div>
              <p className="mt-5 rounded-full border border-slate-700/90 bg-[#08111f]/90 px-3 py-1.5 text-[11px] font-bold text-slate-200 shadow-lg">
                Arahkan kamera ke QR Code di tiang lokasi
              </p>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-slate-300">
              <AlertTriangle className="h-10 w-10 text-amber-300" />
              <p className="max-w-xs text-sm font-semibold leading-6 text-slate-200">{cameraError}</p>
              <button
                onClick={startCamera}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              >
                <RefreshCw className="w-4 h-4" /> Coba Lagi Kamera
              </button>
            </div>
          )}
        </div>

        {/* Fallback / Quick Simulation Section */}
        <div className="space-y-3 border-t border-slate-800 bg-[#08111f] p-4">
          {availableTokens && availableTokens.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                Simulasi Scan Cepat Lapangan (Demo / Dev)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availableTokens.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => handleDetected(t.token)}
                    className="flex min-h-10 items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-left text-xs text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
                  >
                    <span className="font-black text-blue-300">{t.code}</span>
                    <span className="max-w-[110px] truncate text-[10px] text-slate-400">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Atau masukkan kode token manual..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
              <button
                type="button"
                disabled={!manualToken.trim()}
                onClick={() => handleDetected(manualToken.trim())}
                className="flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" /> Validasi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
