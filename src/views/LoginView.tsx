/**
 * OPS SIGAP — Login View
 */

import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../components/PWAInstallButton';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [npk, setNpk] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 selection:bg-blue-600 selection:text-white">
      <div className="max-w-md w-full mx-auto pt-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-400/30 flex items-center justify-center text-white mx-auto shadow-xl shadow-blue-900/30">
            <Shield className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">OPS SIGAP</h1>
          <p className="text-xs text-slate-400 font-medium max-w-xs mx-auto">
            Security Operations System • Site Pos BB92 KM 92
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="font-bold text-white text-sm">Masuk Akun Petugas</h2>
            <p className="text-xs text-slate-400">Gunakan NPK dan password operasional</p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Nomor Pokok Karyawan (NPK):</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: 234378"
                  value={npk}
                  onChange={(e) => setNpk(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Password:</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="Masukkan password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-950/50 flex items-center justify-center gap-2 transition active:scale-[0.99]"
            >
              {loading ? (
                <span>Memverifikasi...</span>
              ) : (
                <>
                  <span>MASUK SISTEM</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* PWA Install Button */}
        <div className="px-2">
          <PWAInstallButton />
        </div>
      </div>

      <footer className="py-4 text-center text-[11px] text-slate-600 font-mono">
        OPS SIGAP v2.0 • Real-Field Offline Patrol & Operations
      </footer>
    </div>
  );
};
