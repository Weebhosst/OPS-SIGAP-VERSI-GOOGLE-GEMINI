/**
 * OPS SIGAP — In-App PWA Install Prompt
 */

import React, { useEffect, useState } from 'react';
import { Download, Check, Share, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) return null;

  if (deferredPrompt) {
    if (compact) {
      return (
        <button
          onClick={handleInstall}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition shadow"
          title="Install OPS SIGAP ke Home Screen"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      );
    }
    return (
      <button
        onClick={handleInstall}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-lg shadow-blue-900/40"
      >
        <Download className="w-4 h-4" />
        <span>Install Aplikasi OPS SIGAP (PWA)</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium'
              : 'w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium'
          }
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Install di iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-left">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-semibold text-white text-sm">Pasang OPS SIGAP di iOS</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3 space-y-2.5 text-xs text-slate-300">
                <p className="flex items-start gap-2">
                  <span className="font-bold text-blue-400">1.</span>
                  <span>
                    Tekan tombol <strong>Share</strong> (ikon kotak panah ke atas) di Safari.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-bold text-blue-400">2.</span>
                  <span>
                    Gulir ke bawah dan pilih <strong>Add to Home Screen</strong> (Tambah ke Layar Utama).
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-bold text-blue-400">3.</span>
                  <span>Aplikasi OPS SIGAP akan tampil layaknya aplikasi native tanpa bar browser.</span>
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
