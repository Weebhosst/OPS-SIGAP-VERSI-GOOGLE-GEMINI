/**
 * OPS SIGAP — Admin User Management
 * Customer → Site → Personel folder workspace
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserRound,
  UserX,
  Users,
} from 'lucide-react';
import { ConfirmActionDialog } from '../../components/ConfirmActionDialog';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Customer, Role, Site, User } from '../../types/ops';

type MasterSite = Site & { activeCount?: number };

export const AdminUsers: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user: signedInUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<MasterSite[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newName, setNewName] = useState('');
  const [newNpk, setNewNpk] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newRole, setNewRole] = useState<Role>('ANGGOTA');
  const [newSiteId, setNewSiteId] = useState('');

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    position: '',
    role: 'ANGGOTA' as Role,
    siteId: '',
    status: 'ACTIVE' as User['status'],
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [userRes, masterRes] = await Promise.all([api.getAdminUsers(), api.getMasters()]);
      if (userRes.success) setUsers(userRes.users);
      setSites(masterRes.sites);
      setCustomers(masterRes.customers);
      setNewSiteId((current) => current || masterRes.sites[0]?.id || '');
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal memuat data petugas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadUsers(); }, []);

  const customerName = (customerId?: string | null) =>
    customers.find((customer) => customer.id === customerId)?.name || customerId || 'GLOBAL';

  const filteredSites = useMemo(() => sites.filter((site) => {
    if (filterCustomerId && site.customerId !== filterCustomerId) return false;
    if (filterSiteId && site.id !== filterSiteId) return false;
    const people = users.filter((person) => person.siteId === site.id);
    if (!search) return true;
    const haystack = [
      site.name,
      site.code || site.id,
      customerName(site.customerId),
      ...people.flatMap((person) => [person.name, person.npk, person.position || '', person.email]),
    ].join(' ').toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [sites, filterCustomerId, filterSiteId, users, search, customers]);

  const globalUsers = useMemo(() => users.filter((person) => !person.siteId && (
    !search || `${person.name} ${person.npk} ${person.email} ${person.role}`.toLowerCase().includes(search.toLowerCase())
  )), [users, search]);

  const resetCreateForm = () => {
    setNewName('');
    setNewNpk('');
    setNewEmail('');
    setNewPosition('');
    setNewRole('ANGGOTA');
    setNewSiteId(sites[0]?.id || '');
  };

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || !newNpk.trim()) return;
    if (newRole !== 'SUPER_ADMIN' && !newSiteId) {
      setStatusMsg('Site penugasan wajib dipilih.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createAdminUser({
        name: newName.trim(),
        npk: newNpk.trim(),
        email: newEmail.trim() || `${newNpk.trim()}@security.local`,
        position: newPosition.trim() || undefined,
        role: newRole,
        siteId: newRole === 'SUPER_ADMIN' ? null : newSiteId,
        status: 'ACTIVE',
      });
      setStatusMsg(`Petugas ${res.user.name} berhasil didaftarkan. Password awal = NPK dan wajib diganti saat login pertama.`);
      setShowAddModal(false);
      resetCreateForm();
      await loadUsers();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal menambahkan petugas.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (person: User) => {
    setEditingUser(person);
    setEditForm({
      name: person.name,
      email: person.email,
      position: person.position || '',
      role: person.role,
      siteId: person.siteId || sites[0]?.id || '',
      status: person.status,
    });
  };

  const saveEdit = async () => {
    if (!editingUser || !editForm.name.trim()) return;
    if (editForm.role !== 'SUPER_ADMIN' && !editForm.siteId) {
      setStatusMsg('Site penugasan wajib dipilih.');
      return;
    }

    setSubmitting(true);
    try {
      await api.updateAdminUser(editingUser.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        position: editForm.position.trim(),
        role: editForm.role,
        siteId: editForm.role === 'SUPER_ADMIN' ? null : editForm.siteId,
        status: editForm.status,
      });
      setStatusMsg(`Data ${editingUser.name} berhasil diperbarui.`);
      setEditingUser(null);
      await loadUsers();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal memperbarui data petugas.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (person: User) => {
    setSubmitting(true);
    try {
      const nextStatus = person.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await api.updateAdminUser(person.id, { status: nextStatus });
      setStatusMsg(`Status ${person.name} diubah menjadi ${nextStatus}.`);
      await loadUsers();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal mengubah status petugas.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setSubmitting(true);
    try {
      const result = await api.resetPasswordToNpk(resetTarget.id);
      setStatusMsg(result.message || `Password ${resetTarget.name} berhasil direset ke NPK.`);
      setResetTarget(null);
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal mereset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.deleteAdminUser(deleteTarget.id);
      setStatusMsg(`Personel ${deleteTarget.name} berhasil dihapus.`);
      setDeleteTarget(null);
      await loadUsers();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Personel gagal dihapus.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderPersonRow = (person: User) => (
    <div key={person.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-800/60 bg-blue-950/30 text-blue-300">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black text-white">{person.name}</h3>
            <span className="rounded-full border border-blue-800 bg-blue-950/50 px-2 py-0.5 text-[9px] font-black text-blue-300">{person.role}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${person.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>{person.status}</span>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-slate-400">NPK {person.npk} • {person.position || '-'}</p>
          <p className="truncate text-[10px] text-slate-500">{person.email}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button type="button" onClick={() => openEdit(person)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-[10px] font-black text-slate-200 hover:bg-slate-700">
          <Pencil className="h-3.5 w-3.5" /> EDIT
        </button>
        <button type="button" onClick={() => setResetTarget(person)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-900/70 bg-amber-950/30 px-3 text-[10px] font-black text-amber-300 hover:bg-amber-900/40">
          <KeyRound className="h-3.5 w-3.5" /> RESET PASSWORD
        </button>
        {person.role !== 'SUPER_ADMIN' ? (
          <>
            <button type="button" disabled={submitting} onClick={() => void toggleActive(person)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black disabled:opacity-40 ${person.status === 'ACTIVE' ? 'border-slate-700 bg-slate-800 text-slate-300 hover:text-red-300' : 'border-emerald-900 bg-emerald-950/30 text-emerald-300'}`}>
              {person.status === 'ACTIVE' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              {person.status === 'ACTIVE' ? 'NONAKTIFKAN' : 'AKTIFKAN'}
            </button>
            <button type="button" disabled={person.id === signedInUser?.id} onClick={() => setDeleteTarget(person)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-red-900/70 bg-red-950/30 px-3 text-[10px] font-black text-red-300 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-30">
              <Trash2 className="h-3.5 w-3.5" /> HAPUS
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020817] pb-24 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" aria-label="Kembali">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-tight text-white">MANAJEMEN PETUGAS</h1>
              <p className="truncate text-[11px] text-slate-400">Customer → Site → Personel</p>
            </div>
          </div>
          <button type="button" onClick={() => { resetCreateForm(); setShowAddModal(true); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500">
            <Plus className="h-4 w-4" /> Tambah Petugas
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6 lg:pt-6">
        <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs md:grid-cols-3">
          <label className="relative">
            <span className="font-bold text-slate-300">Search</span>
            <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, NPK, jabatan..." className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-white outline-none focus:border-blue-500" />
          </label>
          <label className="font-bold text-slate-300">Customer<select value={filterCustomerId} onChange={(event) => { setFilterCustomerId(event.target.value); setFilterSiteId(''); }} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="">Semua Customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          <label className="font-bold text-slate-300">Site<select value={filterSiteId} onChange={(event) => setFilterSiteId(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="">Semua Site</option>{sites.filter((site) => !filterCustomerId || site.customerId === filterCustomerId).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        </div>

        {statusMsg ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-800/70 bg-emerald-950/30 p-3 text-xs text-emerald-200" role="status" aria-live="polite">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>{statusMsg}</span></div>
            <button type="button" onClick={() => setStatusMsg(null)} className="rounded-lg px-2 py-1 font-black hover:bg-emerald-900/40">TUTUP</button>
          </div>
        ) : null}

        {loading ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">Memuat data petugas...</div> : null}

        <section className="space-y-3">
          {filteredSites.map((site) => {
            const siteUsers = users
              .filter((person) => person.siteId === site.id)
              .filter((person) => !search || `${person.name} ${person.npk} ${person.position || ''} ${person.email}`.toLowerCase().includes(search.toLowerCase()));
            const expanded = !!expandedSites[site.id];

            return (
              <article key={site.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedSites((current) => ({ ...current, [site.id]: !current[site.id] }))} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-800/60 bg-blue-950/30 text-blue-300"><FolderOpen className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">{customerName(site.customerId)}</p>
                      <h2 className="truncate text-sm font-black text-white">{site.name}</h2>
                      <p className="mt-0.5 text-[11px] text-slate-500">{siteUsers.length} personel • {site.status}</p>
                    </div>
                  </div>
                  {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />}
                </button>

                {expanded ? (
                  <div className="space-y-2 border-t border-slate-800 bg-[#08111f]/45 p-3">
                    {siteUsers.length ? siteUsers.sort((a, b) => a.name.localeCompare(b.name)).map(renderPersonRow) : <div className="p-5 text-center text-xs text-slate-500">Belum ada personel pada Site ini.</div>}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!filterSiteId && !filterCustomerId && globalUsers.length ? (
            <article className="overflow-hidden rounded-2xl border border-purple-900/50 bg-slate-900">
              <button type="button" aria-expanded={!!expandedSites.__GLOBAL__} onClick={() => setExpandedSites((current) => ({ ...current, __GLOBAL__: !current.__GLOBAL__ }))} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-800/60 bg-purple-950/30 text-purple-300"><Shield className="h-5 w-5" /></div>
                  <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-300">SYSTEM</p><h2 className="text-sm font-black text-white">Global Administrator</h2><p className="text-[11px] text-slate-500">{globalUsers.length} akun global</p></div>
                </div>
                {expandedSites.__GLOBAL__ ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
              </button>
              {expandedSites.__GLOBAL__ ? <div className="space-y-2 border-t border-slate-800 p-3">{globalUsers.map(renderPersonRow)}</div> : null}
            </article>
          ) : null}

          {!loading && filteredSites.length === 0 && globalUsers.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">Tidak ada petugas sesuai filter.</div> : null}
        </section>
      </main>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="admin-user-create-title">
            <header className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-[#08111f]/95 p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Personel</p><h3 id="admin-user-create-title" className="mt-1 text-base font-black text-white">Tambah Petugas Baru</h3></div>
              <button type="button" onClick={() => setShowAddModal(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800" aria-label="Tutup tambah petugas">✕</button>
            </header>
            <form onSubmit={handleAddUser} className="space-y-4 overflow-y-auto p-5 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="font-bold text-slate-300">Nama Lengkap<input required value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white outline-none focus:border-blue-500" /></label>
                <label className="font-bold text-slate-300">NPK<input required value={newNpk} onChange={(event) => setNewNpk(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-mono font-normal text-white outline-none focus:border-blue-500" /><span className="mt-1 block text-[10px] text-blue-400">Password awal otomatis = NPK.</span></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="font-bold text-slate-300">Email<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Opsional" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
                <label className="font-bold text-slate-300">Jabatan<input value={newPosition} onChange={(event) => setNewPosition(event.target.value)} placeholder="Anggota Security" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="font-bold text-slate-300">Role<select value={newRole} onChange={(event) => setNewRole(event.target.value as Role)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="ANGGOTA">ANGGOTA</option><option value="ADMIN">ADMIN</option><option value="CHIEF">CHIEF</option><option value="SUPER_ADMIN">SUPER ADMIN</option></select></label>
                {newRole !== 'SUPER_ADMIN' ? <label className="font-bold text-slate-300">Site Penugasan<select required value={newSiteId} onChange={(event) => setNewSiteId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="">Pilih Site</option>{sites.map((site) => <option key={site.id} value={site.id}>{customerName(site.customerId)} • {site.name}</option>)}</select></label> : <div className="rounded-xl border border-purple-900/60 bg-purple-950/20 p-3 text-purple-200">SUPER_ADMIN menggunakan akses global tanpa Site.</div>}
              </div>
              <button type="submit" disabled={submitting} className="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-black text-white hover:bg-blue-500 disabled:opacity-50">{submitting ? 'MENYIMPAN...' : 'SIMPAN PETUGAS BARU'}</button>
            </form>
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#0f172a] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <header className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Edit Personel</p><h2 id="edit-user-title" className="mt-1 font-black text-white">{editingUser.name}</h2></div>
              <button type="button" onClick={() => setEditingUser(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-slate-400" aria-label="Tutup edit petugas">✕</button>
            </header>
            <div className="space-y-4 overflow-y-auto p-5 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="font-bold text-slate-300">Nama<input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
                <label className="font-bold text-slate-300">Email<input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              </div>
              <label className="block font-bold text-slate-300">Jabatan<input value={editForm.position} onChange={(event) => setEditForm((current) => ({ ...current, position: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="font-bold text-slate-300">Role<select value={editForm.role} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value as Role }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="ANGGOTA">ANGGOTA</option><option value="ADMIN">ADMIN</option><option value="CHIEF">CHIEF</option><option value="SUPER_ADMIN">SUPER ADMIN</option></select></label>
                <label className="font-bold text-slate-300">Status<select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as User['status'] }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              </div>
              {editForm.role !== 'SUPER_ADMIN' ? <label className="block font-bold text-slate-300">Site Penugasan<select value={editForm.siteId} onChange={(event) => setEditForm((current) => ({ ...current, siteId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="">Pilih Site</option>{sites.map((site) => <option key={site.id} value={site.id}>{customerName(site.customerId)} • {site.name}</option>)}</select></label> : null}
              <button type="button" disabled={submitting || !editForm.name.trim()} onClick={() => void saveEdit()} className="min-h-12 w-full rounded-xl bg-blue-600 font-black text-white hover:bg-blue-500 disabled:opacity-40">SIMPAN PERUBAHAN</button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmActionDialog
        open={!!resetTarget}
        title={resetTarget ? `Reset Password ${resetTarget.name}?` : 'Reset Password?'}
        description={resetTarget ? `Password akan direset ke NPK ${resetTarget.npk}. Pengguna wajib mengganti password saat login berikutnya.` : ''}
        confirmLabel="RESET PASSWORD"
        tone="warning"
        busy={submitting}
        onCancel={() => setResetTarget(null)}
        onConfirm={resetPassword}
      />

      <ConfirmActionDialog
        open={!!deleteTarget}
        title={deleteTarget ? `Hapus Personel ${deleteTarget.name}?` : 'Hapus Personel?'}
        description="Penghapusan permanen hanya diizinkan untuk akun yang belum memiliki histori operasional. Jika personel sudah pernah bertugas, sistem akan menolak dan gunakan Nonaktifkan."
        confirmLabel="HAPUS PERSONEL"
        requireText={deleteTarget?.name}
        requireTextLabel="Ketik ulang nama personel untuk menghapus:"
        busy={submitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteUser}
      />
    </div>
  );
};
