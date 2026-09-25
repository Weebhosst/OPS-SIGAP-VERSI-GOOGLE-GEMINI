import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ChangePasswordView: React.FC = () => {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPasswords, setShowNewPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Semua kolom password wajib diisi.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak sama.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Password baru minimal 8 karakter dan harus mengandung huruf serta angka.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err: any) {
      setError(err?.message || 'Password belum dapat diubah.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020817] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8 sm:px-6">
        <section
          className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-2xl shadow-black/30 sm:p-6"
          aria-labelledby="change-password-title"
        >
          <header className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-300">Keamanan Akun</p>
              <h1 id="change-password-title" className="mt-1 text-xl font-black tracking-tight text-white">
                Ubah Password
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Password sementara harus diganti sebelum OPS SIGAP dapat digunakan.
              </p>
            </div>
          </header>

          <div className="mt-5 flex gap-2 rounded-xl border border-blue-800/60 bg-blue-950/40 p-3 text-sm text-blue-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <span>Gunakan minimal 8 karakter dengan kombinasi huruf dan angka. Password baru tidak boleh sama dengan NPK.</span>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-800/80 bg-red-950/50 p-3 text-sm text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-300">Password Saat Ini</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-[#020817] pl-10 pr-12 text-base text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((value) => !value)}
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={showCurrentPassword ? 'Sembunyikan password saat ini' : 'Tampilkan password saat ini'}
                  aria-pressed={showCurrentPassword}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-300">Password Baru</span>
              <div className="relative">
                <input
                  type={showNewPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-[#020817] px-3 pr-12 text-base text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPasswords((value) => !value)}
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={showNewPasswords ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
                  aria-pressed={showNewPasswords}
                >
                  {showNewPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-300">Konfirmasi Password Baru</span>
              <input
                type={showNewPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-700 bg-[#020817] px-3 text-base text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void logout()}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-4 focus:ring-slate-700"
          >
            <LogOut className="h-4 w-4" />
            Keluar dari akun
          </button>
        </section>
      </div>
    </main>
  );
};
