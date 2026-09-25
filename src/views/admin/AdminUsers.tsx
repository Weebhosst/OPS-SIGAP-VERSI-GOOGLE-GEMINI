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
  const [sites, setSites] = useState<Array<{ id: string; name: string; customerId: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    try {
      const [res, masterRes] = await Promise.all([api.getAdminUsers(), api.getMasters()]);
      if (res.success) setUsers(res.users);
      setSites(masterRes.sites);
      setCustomers(masterRes.customers);
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
    <div className="min-h-screen bg-[#020817] pb-10 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-black tracking-tight text-white">Manajemen Petugas Security</h1>
              <p className="text-[11px] text-slate-400 font-medium">NPK, Akun & Reset Password</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Petugas</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6 lg:pt-6">
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs shadow-lg shadow-black/10 md:grid-cols-2">
          <label>Customer<select value={filterCustomerId} onChange={(e) => { setFilterCustomerId(e.target.value); setFilterSiteId(''); }} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"><option value="">Semua Customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label>
          <label>Site<select value={filterSiteId} onChange={(e) => setFilterSiteId(e.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"><option value="">Semua Site</option>{sites.filter((site) => !filterCustomerId || site.customerId === filterCustomerId).map((site) => <option key={site.id} value={site.id}>{site.id} — {site.name}</option>)}</select></label>
        </div>
        {statusMsg && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-700/70 bg-emerald-950/60 p-3 text-xs text-emerald-200">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{statusMsg}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-emerald-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {users.filter((u) => (!filterCustomerId || u.customerId === filterCustomerId) && (!filterSiteId || u.siteId === filterSiteId)).map((u) => (
            <div
              key={u.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm grid grid-cols-1 gap-3 xl:grid-cols-2"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-600/15 text-base font-black text-blue-300">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-white">{u.name}</h3>
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
                    <p className="mt-1 font-mono text-xs text-slate-400">
                      NPK: <strong className="text-slate-200">{u.npk}</strong> • Site: {u.siteId || 'Global'}
                    </p>
                    <p className="break-all font-mono text-[11px] text-slate-500">{u.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Reset Password ke NPK Action */}
                  <button
                    onClick={() => setConfirmResetUser(u)}
                    className="flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-slate-700 hover:text-amber-200"
                    title="Reset password ke NPK"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Password ke NPK</span>
                  </button>

                  {/* Toggle Active */}
                  {u.role !== 'SUPER_ADMIN' && (
                    <button
                      onClick={() => handleToggleActive(u)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700/90 bg-[#0f172a] p-5 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-white">Tambah Petugas Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUser} className="grid grid-cols-1 gap-3 xl:grid-cols-2 text-xs">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Nama Lengkap:</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">
                  Nomor Pokok Karyawan (NPK):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 240199"
                  value={newNpk}
                  onChange={(e) => setNewNpk(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 font-mono"
                />
                <p className="text-[11px] text-blue-400 mt-1">
                  * Password awal akan otomatis diset sama dengan NPK ({newNpk || 'NPK'}).
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Email Petugas (Opsional):</label>
                <input
                  type="email"
                  placeholder="budi@security.local"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-300">Peran (Role):</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as Role)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  >
                    <option value="ANGGOTA">ANGGOTA (Petugas Jaga)</option>
                    <option value="ADMIN">ADMIN OPERASIONAL</option>
                    <option value="CHIEF">CHIEF (READ ONLY)</option>
                    <option value="SUPER_ADMIN">SUPER ADMIN</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-300">Site Penugasan:</label>
                  <select
                    value={newSiteId}
                    onChange={(e) => setNewSiteId(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 font-mono"
                  >
                    {sites.map((site) => <option key={site.id} value={site.id}>{site.id} — {site.name}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? 'Menyimpan Petugas...' : 'SIMPAN PETUGAS BARU'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Reset Password ke NPK */}
      {confirmResetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-800/80 rounded-2xl p-5 grid grid-cols-1 gap-3 xl:grid-cols-2 text-center">
            <KeyRound className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="text-sm font-black text-white">Reset Password Petugas?</h3>
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
