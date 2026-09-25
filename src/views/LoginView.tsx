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
    <main className="min-h-screen bg-slate-100 text-slate-900 selection:bg-blue-700 selection:text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8 sm:px-6">
        <header className="mb-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-300">
            <Shield className="h-8 w-8" />
          </div>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-700">Operational Security System</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">OPS SIGAP</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-600">
            Sistem operasional patroli dan pengamanan untuk personel lapangan.
          </p>
        </header>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 sm:p-6"
          aria-labelledby="login-title"
        >
          <div className="mb-5 border-b border-slate-100 pb-4">
            <h2 id="login-title" className="text-lg font-extrabold text-slate-950">Masuk ke akun</h2>
            <p className="mt-1 text-sm text-slate-500">Gunakan NPK dan password operasional.</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">NPK</span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  inputMode="numeric"
                  placeholder="Masukkan NPK"
                  value={npk}
                  onChange={(e) => setNpk(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Password</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-12 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
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

        <footer className="mt-7 text-center text-xs text-slate-500">
          OPS SIGAP • Akses operasional terproteksi
        </footer>
      </div>
    </main>
  );
};
