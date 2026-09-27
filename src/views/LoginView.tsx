/**
 * OPS SIGAP — Login View
 */

import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Shield, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../components/PWAInstallButton';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [npk, setNpk] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!npk.trim() || !password.trim()) {
      setError('NPK dan Password wajib diisi.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await login(npk.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login gagal. Periksa NPK dan password Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020817] text-slate-100 selection:bg-blue-600 selection:text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8 sm:px-6">
        <header className="mb-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-600 text-white shadow-xl shadow-blue-950/40">
            <Shield className="h-8 w-8" />
          </div>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.22em] text-blue-300">Operational Security System</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">OPS SIGAP</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-400">
            Sistem operasional patroli dan pengamanan untuk personel lapangan.
          </p>
        </header>

        <section
          className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-2xl shadow-black/30 sm:p-6"
          aria-labelledby="login-title"
        >
          <div className="mb-5 border-b border-slate-800 pb-4">
            <h2 id="login-title" className="text-lg font-extrabold text-white">Masuk ke akun</h2>
            <p className="mt-1 text-sm text-slate-400">Gunakan NPK dan password operasional.</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-800/80 bg-red-950/50 p-3 text-sm text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-300">NPK</span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  inputMode="numeric"
                  placeholder="Masukkan NPK"
                  value={npk}
                  onChange={(e) => setNpk(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-[#020817] pl-10 pr-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-300">Password</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-[#020817] pl-10 pr-12 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span>Memverifikasi...</span>
              ) : (
                <>
                  <span>Masuk</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </section>

        <div className="mt-4">
          <PWAInstallButton />
        </div>

        <footer className="mt-7 text-center text-xs text-slate-600">
          OPS SIGAP • Akses operasional terproteksi
        </footer>
      </div>
    </main>
  );
};
