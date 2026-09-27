import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Customer, Role, Site, User } from '../../types/ops';
import {
  OpsConfirmDialog,
  OpsDangerConfirmDialog,
  OpsDialog,
  OpsNoticeDialog,
  type OpsDialogTone,
} from '../../components/OpsDialog';

type UserFormState = {
  name: string;
  npk: string;
  email: string;
  role: Role;
  position: string;
  siteId: string;
};

const emptyForm: UserFormState = {
  name: '',
  npk: '',
  email: '',
  role: 'ANGGOTA',
  position: 'ANGGOTA SECURITY',
  siteId: '',
};

export const AdminUsers: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(emptyForm);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; tone: OpsDialogTone } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userRes, masterRes] = await Promise.all([api.getAdminUsers(), api.getMasters()]);
      setUsers(userRes.users);
      setSites(masterRes.sites);
      setCustomers(masterRes.customers);
    } catch (error) {
      setNotice({
        title: 'Data Petugas Gagal Dimuat',
        message: error instanceof Error ? error.message : 'Gagal memuat data petugas.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((person) => {
      if (filterCustomerId && person.customerId !== filterCustomerId) return false;
      if (filterRole && person.role !== filterRole) return false;
      if (filterStatus && person.status !== filterStatus) return false;
      if (!query) return true;
      return [
        person.name,
        person.npk,
        person.email,
        person.position,
        person.role,
        sites.find((site) => site.id === person.siteId)?.name,
        customers.find((customer) => customer.id === person.customerId)?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [users, sites, customers, search, filterCustomerId, filterRole, filterStatus]);

  const customerGroups = useMemo(
    () =>
      customers
        .filter((customer) => !filterCustomerId || customer.id === filterCustomerId)
        .map((customer) => {
          const customerSites = sites
            .filter((site) => site.customerId === customer.id)
            .map((site) => ({
              site,
              people: filteredUsers.filter((person) => person.siteId === site.id),
            }));
          const totalPeople = customerSites.reduce((sum, item) => sum + item.people.length, 0);
          return { customer, customerSites, totalPeople };
        })
        .filter(({ customerSites, totalPeople }) => {
          if (!search.trim() && !filterRole && !filterStatus) return customerSites.length > 0;
          return totalPeople > 0;
        }),
    [customers, sites, filteredUsers, filterCustomerId, search, filterRole, filterStatus],
  );

  const globalUsers = filteredUsers.filter((person) => !person.siteId);

  const activeSiteOptions = sites.filter((site) => site.status === 'ACTIVE');

  const resetUserForm = () => {
    setShowUserForm(false);
    setEditingUser(null);
    setUserForm(emptyForm);
  };

  const openAddUser = () => {
    const defaultSite = activeSiteOptions[0]?.id || '';
    setEditingUser(null);
    setUserForm({ ...emptyForm, siteId: defaultSite });
    setShowUserForm(true);
  };

  const openEditUser = (person: User) => {
    setEditingUser(person);
    setUserForm({
      name: person.name,
      npk: person.npk,
      email: person.email,
      role: person.role,
      position: person.position || (person.role === 'ANGGOTA' ? 'ANGGOTA SECURITY' : person.role.replace('_', ' ')),
      siteId: person.siteId || '',
    });
    setShowUserForm(true);
  };

  const submitUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (userForm.role !== 'SUPER_ADMIN' && !userForm.siteId) {
      setNotice({
        title: 'Site Wajib Dipilih',
        message: 'Role selain Super Admin wajib terhubung ke Site.',
        tone: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        await api.updateAdminUser(editingUser.id, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          position: userForm.position,
          siteId: userForm.role === 'SUPER_ADMIN' ? null : userForm.siteId,
        });
        setNotice({
          title: 'Petugas Diperbarui',
          message: `Data ${userForm.name} berhasil diperbarui.`,
          tone: 'success',
        });
      } else {
        const result = await api.createAdminUser({
          name: userForm.name,
          npk: userForm.npk,
          email: userForm.email || `${userForm.npk}@sigap.local`,
          role: userForm.role,
          position: userForm.position,
          siteId: userForm.role === 'SUPER_ADMIN' ? null : userForm.siteId,
          status: 'ACTIVE',
        });
        setNotice({
          title: 'Petugas Ditambahkan',
          message: `${result.user.name} berhasil didaftarkan. Password awal = NPK dan wajib diganti saat login.`,
          tone: 'success',
        });
      }

      resetUserForm();
      await loadData();
    } catch (error) {
      setNotice({
        title: editingUser ? 'Edit Petugas Gagal' : 'Tambah Petugas Gagal',
        message: error instanceof Error ? error.message : 'Operasi petugas gagal diproses.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    const target = resetTarget;
    try {
      await api.resetPasswordToNpk(target.id);
      setResetTarget(null);
      setNotice({
        title: 'Password Direset',
        message: `Password ${target.name} direset ke NPK ${target.npk}. User wajib mengganti password saat login berikutnya.`,
        tone: 'success',
      });
    } catch (error) {
      setResetTarget(null);
      setNotice({
        title: 'Reset Password Gagal',
        message: error instanceof Error ? error.message : 'Password gagal direset.',
        tone: 'danger',
      });
    }
  };

  const toggleStatus = async () => {
    if (!statusTarget) return;
    const target = statusTarget;
    const nextStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.updateAdminUser(target.id, { status: nextStatus });
      setStatusTarget(null);
      await loadData();
      setNotice({
        title: nextStatus === 'ACTIVE' ? 'Petugas Diaktifkan' : 'Petugas Dinonaktifkan',
        message: `${target.name} sekarang berstatus ${nextStatus}.`,
        tone: 'success',
      });
    } catch (error) {
      setStatusTarget(null);
      setNotice({
        title: 'Perubahan Status Gagal',
        message: error instanceof Error ? error.message : 'Status petugas gagal diperbarui.',
        tone: 'danger',
      });
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await api.deleteAdminUser(target.id, `HAPUS ${target.name}`);
      setDeleteTarget(null);
      await loadData();
      setNotice({
        title: 'Personel Dihapus',
        message: `${target.name} berhasil dihapus. Jejak tindakan tetap tersedia di Audit Trail.`,
        tone: 'success',
      });
    } catch (error) {
      setDeleteTarget(null);
      setNotice({
        title: 'Personel Tidak Dapat Dihapus',
        message:
          error instanceof ApiError
            ? error.message
            : 'Personel memiliki histori operasional. Gunakan NONAKTIFKAN sebagai gantinya.',
        tone: 'danger',
      });
    }
  };

  const renderPersonCard = (person: User) => {
    const isCurrentAccount = person.id === currentUser?.id;
    const canDelete = person.role !== 'SUPER_ADMIN' && !isCurrentAccount;

    return (
      <div
        key={person.id}
        className="rounded-xl border border-slate-800 bg-slate-950/80 p-3"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-900/70 bg-blue-950/40 text-sm font-black text-blue-300">
              {person.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-black text-white">{person.name}</div>
                <span className={person.status === 'ACTIVE' ? 'ops-badge-success' : 'ops-badge-neutral'}>
                  {person.status}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[9px] font-black text-slate-300">
                  {person.role}
                </span>
                {isCurrentAccount ? (
                  <span className="rounded-full border border-blue-800 bg-blue-950/50 px-2 py-0.5 text-[9px] font-black text-blue-300">
                    AKUN INI
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span className="font-mono">NPK {person.npk}</span>
                <span>{person.position || '-'}</span>
                <span className="break-all">{person.email}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => openEditUser(person)}
              className="ops-btn-secondary inline-flex min-h-9 items-center justify-center gap-1.5 px-3"
            >
              <Pencil className="h-3.5 w-3.5" />
              EDIT
            </button>
            <button
              type="button"
              onClick={() => setResetTarget(person)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-800/70 bg-amber-950/30 px-3 text-xs font-black text-amber-300 transition hover:bg-amber-900/40"
            >
              <KeyRound className="h-3.5 w-3.5" />
              RESET PASSWORD
            </button>
            {person.role !== 'SUPER_ADMIN' ? (
              <button
                type="button"
                onClick={() => setStatusTarget(person)}
                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black transition ${
                  person.status === 'ACTIVE'
                    ? 'border-orange-900/70 bg-orange-950/30 text-orange-300 hover:bg-orange-900/40'
                    : 'border-emerald-900/70 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40'
                }`}
              >
                {person.status === 'ACTIVE' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                {person.status === 'ACTIVE' ? 'NONAKTIFKAN' : 'AKTIFKAN'}
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => setDeleteTarget(person)}
                className="ops-btn-danger inline-flex min-h-9 items-center justify-center gap-1.5 px-3"
              >
                <Trash2 className="h-3.5 w-3.5" />
                HAPUS
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-24 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-white">PETUGAS</h1>
              <p className="text-[11px] text-slate-400">Customer → Site → Personel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openAddUser}
            className="ops-btn-primary inline-flex min-h-10 shrink-0 items-center gap-1.5 px-3"
          >
            <Plus className="h-4 w-4" />
            TAMBAH PETUGAS
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <div className="grid gap-2 text-xs md:grid-cols-4">
            <label className="relative">
              <span className="font-bold text-slate-300">Cari Petugas</span>
              <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nama, NPK, jabatan"
                className="ops-input mt-1 py-2 pl-9 pr-3"
              />
            </label>
            <label>
              <span className="font-bold text-slate-300">Customer</span>
              <select
                value={filterCustomerId}
                onChange={(event) => setFilterCustomerId(event.target.value)}
                className="ops-input mt-1 px-3"
              >
                <option value="">Semua Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.code} — {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="font-bold text-slate-300">Role</span>
              <select value={filterRole} onChange={(event) => setFilterRole(event.target.value)} className="ops-input mt-1 px-3">
                <option value="">Semua Role</option>
                <option value="ANGGOTA">ANGGOTA</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CHIEF">CHIEF</option>
                <option value="SUPER_ADMIN">SUPER ADMIN</option>
              </select>
            </label>
            <label>
              <span className="font-bold text-slate-300">Status</span>
              <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="ops-input mt-1 px-3">
                <option value="">Semua Status</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black text-white">DATA PETUGAS</div>
              <div className="mt-0.5 text-[11px] text-slate-500">Klik Customer lalu Site untuk melihat personel.</div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-black text-slate-300">
              {filteredUsers.length} DATA
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            Memuat data petugas...
          </div>
        ) : (
          <div className="space-y-3">
            {customerGroups.map(({ customer, customerSites, totalPeople }) => {
              const customerExpanded = !!expandedCustomers[customer.id];
              return (
                <article key={customer.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCustomers((current) => ({
                        ...current,
                        [customer.id]: !current[customer.id],
                      }))
                    }
                    aria-expanded={customerExpanded}
                    className="flex min-h-16 w-full items-center gap-3 p-4 text-left transition hover:bg-slate-800/60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-900/70 bg-blue-950/40 text-blue-300">
                      {customerExpanded ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-300">CUSTOMER</div>
                      <div className="truncate text-sm font-black text-white">{customer.name}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {customer.code} • {customerSites.length} Site • {totalPeople} Petugas
                      </div>
                    </div>
                    {customerExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {customerExpanded ? (
                    <div className="space-y-2 border-t border-slate-800 bg-slate-950/30 p-3">
                      {customerSites.map(({ site, people }) => {
                        const siteExpanded = !!expandedSites[site.id];
                        return (
                          <div key={site.id} className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a]">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSites((current) => ({
                                  ...current,
                                  [site.id]: !current[site.id],
                                }))
                              }
                              aria-expanded={siteExpanded}
                              className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-800/50"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-900/60 bg-emerald-950/30 text-emerald-300">
                                {siteExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300">SITE</div>
                                <div className="truncate text-xs font-black text-white">{site.name}</div>
                                <div className="mt-0.5 text-[10px] text-slate-500">{people.length} Petugas • {site.status}</div>
                              </div>
                              <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-slate-300">{people.length}</span>
                              {siteExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>

                            {siteExpanded ? (
                              <div className="space-y-2 border-t border-slate-800 p-2.5">
                                {people.length ? people.map(renderPersonCard) : (
                                  <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                                    Belum ada petugas pada Site ini.
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {globalUsers.length > 0 ? (
              <article className="overflow-hidden rounded-2xl border border-purple-900/60 bg-purple-950/10">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-800 bg-purple-950/50 text-purple-300">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-purple-300">AKUN GLOBAL</div>
                    <div className="text-sm font-black text-white">System / Super Admin</div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-purple-900/40 p-3">
                  {globalUsers.map(renderPersonCard)}
                </div>
              </article>
            ) : null}

            {customerGroups.length === 0 && globalUsers.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                <Users className="mx-auto h-7 w-7 text-slate-600" />
                <div className="mt-2 text-sm font-bold text-slate-300">Petugas tidak ditemukan</div>
                <div className="mt-1 text-xs text-slate-500">Ubah pencarian atau filter.</div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      <OpsDialog
        isOpen={showUserForm}
        onClose={resetUserForm}
        title={editingUser ? 'EDIT PETUGAS' : 'TAMBAH PETUGAS'}
        description={editingUser ? `NPK ${editingUser.npk} • ID ${editingUser.id}` : 'Password awal otomatis menggunakan NPK dan wajib diganti saat login.'}
        tone="info"
        size="lg"
        busy={submitting}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={resetUserForm} disabled={submitting} className="ops-btn-secondary px-4">BATAL</button>
            <button type="submit" form="petugas-form" disabled={submitting} className="ops-btn-primary px-4">
              {submitting ? 'MENYIMPAN...' : editingUser ? 'SIMPAN PERUBAHAN' : 'SIMPAN PETUGAS'}
            </button>
          </div>
        }
      >
        <form id="petugas-form" onSubmit={submitUser} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-300">
              Nama Lengkap
              <input
                required
                data-autofocus="true"
                value={userForm.name}
                onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                className="ops-input mt-1 px-3"
              />
            </label>
            <label className="text-xs font-bold text-slate-300">
              NPK
              <input
                required
                disabled={!!editingUser}
                value={userForm.npk}
                onChange={(event) => setUserForm((current) => ({ ...current, npk: event.target.value.trim() }))}
                className="ops-input mt-1 px-3 font-mono disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>

          <label className="block text-xs font-bold text-slate-300">
            Email
            <input
              type="email"
              value={userForm.email}
              onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
              className="ops-input mt-1 px-3"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-300">
              Role
              <select
                value={userForm.role}
                onChange={(event) => {
                  const role = event.target.value as Role;
                  setUserForm((current) => ({
                    ...current,
                    role,
                    position: current.position || (role === 'ANGGOTA' ? 'ANGGOTA SECURITY' : role.replace('_', ' ')),
                    siteId: role === 'SUPER_ADMIN' ? '' : current.siteId || activeSiteOptions[0]?.id || '',
                  }));
                }}
                className="ops-input mt-1 px-3"
              >
                <option value="ANGGOTA">ANGGOTA</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CHIEF">CHIEF</option>
                <option value="SUPER_ADMIN">SUPER ADMIN</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-300">
              Jabatan
              <input
                required
                value={userForm.position}
                onChange={(event) => setUserForm((current) => ({ ...current, position: event.target.value }))}
                className="ops-input mt-1 px-3"
              />
            </label>
          </div>

          {userForm.role !== 'SUPER_ADMIN' ? (
            <label className="block text-xs font-bold text-slate-300">
              Customer / Site Penugasan
              <select
                required
                value={userForm.siteId}
                onChange={(event) => setUserForm((current) => ({ ...current, siteId: event.target.value }))}
                className="ops-input mt-1 px-3"
              >
                <option value="">Pilih Site</option>
                {customers.map((customer) => (
                  <optgroup key={customer.id} label={`${customer.code} — ${customer.name}`}>
                    {activeSiteOptions
                      .filter((site) => site.customerId === customer.id)
                      .map((site) => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-xl border border-purple-900/60 bg-purple-950/20 p-3 text-xs leading-5 text-purple-200">
              Super Admin menggunakan akses global dan tidak dikunci ke Site tertentu.
            </div>
          )}
        </form>
      </OpsDialog>

      <OpsConfirmDialog
        isOpen={!!resetTarget}
        onCancel={() => setResetTarget(null)}
        onConfirm={resetPassword}
        title="RESET PASSWORD"
        message={resetTarget ? `Reset password ${resetTarget.name} kembali ke NPK ${resetTarget.npk}?` : ''}
        tone="warning"
        confirmLabel="RESET SEKARANG"
      >
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
          User akan diwajibkan mengganti password pada login berikutnya.
        </div>
      </OpsConfirmDialog>

      <OpsConfirmDialog
        isOpen={!!statusTarget}
        onCancel={() => setStatusTarget(null)}
        onConfirm={toggleStatus}
        title={statusTarget?.status === 'ACTIVE' ? 'NONAKTIFKAN PETUGAS' : 'AKTIFKAN PETUGAS'}
        message={
          statusTarget
            ? `${statusTarget.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} akun ${statusTarget.name}?`
            : ''
        }
        tone={statusTarget?.status === 'ACTIVE' ? 'warning' : 'success'}
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'NONAKTIFKAN' : 'AKTIFKAN'}
      />

      <OpsDangerConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteUser}
        title="HAPUS PERSONEL"
        message="Hard delete hanya diperbolehkan jika personel belum memiliki histori operasional. Jika sudah pernah digunakan, sistem akan menolak dan menyarankan NONAKTIFKAN."
        confirmationText={deleteTarget ? `HAPUS ${deleteTarget.name}` : ''}
        entityLabel="nama personel"
        confirmLabel="HAPUS PERSONEL"
      >
        {deleteTarget ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div className="font-black text-white">{deleteTarget.name}</div>
            <div className="mt-1 text-slate-400">NPK {deleteTarget.npk} • {deleteTarget.position || deleteTarget.role}</div>
          </div>
        ) : null}
      </OpsDangerConfirmDialog>

      <OpsNoticeDialog
        isOpen={!!notice}
        onClose={() => setNotice(null)}
        title={notice?.title || 'Informasi'}
        message={notice?.message || ''}
        tone={notice?.tone || 'info'}
      />
    </div>
  );
};
