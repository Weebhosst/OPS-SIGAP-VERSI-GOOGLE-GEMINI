import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ChangePasswordView: React.FC = () => {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white">Ganti Password Wajib</h1>
            <p className="text-xs text-slate-400 mt-1">
              Password sementara harus diganti sebelum OPS SIGAP dapat digunakan.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-blue-950/30 border border-blue-900/50 p-3 text-xs text-blue-100 flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
          <span>Gunakan minimal 8 karakter dengan kombinasi huruf dan angka. Password baru tidak boleh sama dengan NPK.</span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-semibold text-slate-300">
            Password Saat Ini
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </label>

          <label className="block text-xs font-semibold text-slate-300">
            Password Baru
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-300">
            Konfirmasi Password Baru
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 text-sm font-black text-white transition"
          >
            {loading ? 'Menyimpan...' : 'SIMPAN PASSWORD BARU'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void logout()}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
        >
          <LogOut className="w-4 h-4" />
          Keluar dari akun
        </button>
      </div>
    </div>
  );
};
