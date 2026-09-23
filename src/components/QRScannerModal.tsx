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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-semibold text-white text-sm">Scanner QR Checkpoint</h3>
              {expectedCheckpointCode && (
                <p className="text-xs text-blue-400 font-mono font-medium">
                  Titik: {expectedCheckpointCode} {expectedCheckpointName ? `— ${expectedCheckpointName}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video / Camera viewfinder */}
        <div className="relative bg-black flex-1 min-h-[260px] max-h-[360px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Overlay Frame */}
          {isScanning && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative w-56 h-56 border-2 border-blue-500/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Corner markers */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />

                {/* Laser animation bar */}
                <div className="absolute top-0 left-2 right-2 h-0.5 bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-bounce" />
              </div>
              <p className="mt-4 text-xs text-slate-300 font-medium bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
                Arahkan kamera ke QR Code di tiang lokasi
              </p>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div className="p-6 text-center text-slate-300 flex flex-col items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <p className="text-sm font-medium text-slate-200">{cameraError}</p>
              <button
                onClick={startCamera}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
              >
                <RefreshCw className="w-4 h-4" /> Coba Lagi Kamera
              </button>
            </div>
          )}
        </div>

        {/* Fallback / Quick Simulation Section */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          {availableTokens && availableTokens.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Simulasi Scan Cepat Lapangan (Demo / Dev)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {availableTokens.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => handleDetected(t.token)}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-left text-xs text-slate-200 transition"
                  >
                    <span className="font-bold text-blue-400">{t.code}</span>
                    <span className="text-[10px] text-slate-400 truncate max-w-[110px]">{t.name}</span>
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
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                disabled={!manualToken.trim()}
                onClick={() => handleDetected(manualToken.trim())}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
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
