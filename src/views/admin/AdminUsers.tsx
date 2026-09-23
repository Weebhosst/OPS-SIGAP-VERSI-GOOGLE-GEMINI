/**
 * OPS SIGAP — Admin User Management
 * Manage security officers, add new guards, and reset password back to NPK with audit trail
 */

import React, { useEffect, useState } from 'react';
import {
  Users,
  ArrowLeft,
  Plus,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';
import { api } from '../../lib/api';
import { User, Role } from '../../types/ops';

export const AdminUsers: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmResetUser, setConfirmResetUser] = useState<User | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // New user form state
  const [newName, setNewName] = useState('');
  const [newNpk, setNewNpk] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('ANGGOTA');
  const [newSiteId, setNewSiteId] = useState('BB92');
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await api.getAdminUsers();
      if (res.success) {
        setUsers(res.users);
      }
    } catch (err) {
      console.warn('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newNpk) return;
    setSubmitting(true);
    try {
      const res = await api.createAdminUser({
        name: newName,
        npk: newNpk,
        email: newEmail || `${newNpk}@security.local`,
        role: newRole,
        siteId: newSiteId,
        status: 'ACTIVE',
      });

      if (res.success) {
        setShowAddModal(false);
        setNewName('');
        setNewNpk('');
        setNewEmail('');
        setStatusMsg(`Petugas ${res.user.name} (NPK: ${res.user.npk}) berhasil didaftarkan. Password default = NPK.`);
        await loadUsers();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menambahkan petugas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await api.updateAdminUser(user.id, { status: newStatus });
      if (res.success) {
        setStatusMsg(`Status ${user.name} diubah menjadi ${newStatus}.`);
        await loadUsers();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status');
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!confirmResetUser) return;
    try {
      const res = await api.resetPasswordToNpk(confirmResetUser.id);
      if (res.success) {
        setStatusMsg(`Password untuk ${confirmResetUser.name} telah direset kembali ke NPK: ${confirmResetUser.npk}.`);
        setConfirmResetUser(null);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mereset password');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-extrabold text-white text-base">Manajemen Petugas Security</h1>
              <p className="text-[11px] text-slate-400 font-medium">NPK, Akun & Reset Password</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-blue-950/50"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Petugas</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {statusMsg && (
          <div className="p-3 bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{statusMsg}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-emerald-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 font-black text-base flex items-center justify-center">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">{u.name}</h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-purple-950 border border-purple-800 text-purple-300'
                            : 'bg-blue-950 border border-blue-800 text-blue-300'
                        }`}
                      >
                        {u.role}
                      </span>
                      {u.status !== 'ACTIVE' && (
                        <span className="text-[10px] bg-red-950 border border-red-800 text-red-400 px-1.5 py-0.5 rounded font-bold">
                          NONAKTIF
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      NPK: <strong className="text-slate-200">{u.npk}</strong> • Site: {u.siteId || 'Global'}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Reset Password ke NPK Action */}
                  <button
                    onClick={() => setConfirmResetUser(u)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1.5 transition"
                    title="Reset password ke NPK"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Password ke NPK</span>
                  </button>

                  {/* Toggle Active */}
                  {u.role !== 'SUPER_ADMIN' && (
                    <button
                      onClick={() => handleToggleActive(u)}
                      className={`p-1.5 rounded-xl border transition ${
                        u.status === 'ACTIVE'
                          ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-red-400'
                          : 'bg-emerald-950 border-emerald-800 text-emerald-400'
                      }`}
                      title={u.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      {u.status === 'ACTIVE' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Tambah Petugas Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Nama Lengkap:</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Nomor Pokok Karyawan (NPK):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 240199"
                  value={newNpk}
                  onChange={(e) => setNewNpk(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
                <p className="text-[11px] text-blue-400 mt-1">
                  * Password awal akan otomatis diset sama dengan NPK ({newNpk || 'NPK'}).
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Email Petugas (Opsional):</label>
                <input
                  type="email"
                  placeholder="budi@security.local"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Peran (Role):</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as Role)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="ANGGOTA">ANGGOTA (Petugas Jaga)</option>
                    <option value="SUPER_ADMIN">SUPER ADMIN</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Site Penugasan:</label>
                  <select
                    value={newSiteId}
                    onChange={(e) => setNewSiteId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  >
                    <option value="BB92">BB92 (KM 92)</option>
                    <option value="ALL">Semua Site</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                {submitting ? 'Menyimpan Petugas...' : 'SIMPAN PETUGAS BARU'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Reset Password ke NPK */}
      {confirmResetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-800/80 rounded-2xl p-5 space-y-3 text-center">
            <KeyRound className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="font-bold text-white text-sm">Reset Password Petugas?</h3>
            <p className="text-xs text-slate-300">
              Password untuk <strong>{confirmResetUser.name}</strong> akan direset kembali ke nomor NPK:{' '}
              <span className="font-mono text-amber-300 font-bold">{confirmResetUser.npk}</span>.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <button
                onClick={() => setConfirmResetUser(null)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmResetPassword}
                className="py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold"
              >
                Reset Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
