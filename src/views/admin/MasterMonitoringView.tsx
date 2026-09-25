import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { ConfirmActionDialog } from '../../components/ConfirmActionDialog';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Checkpoint, Customer, PatrolSession, Site, User } from '../../types/ops';

type MasterTab = 'CUSTOMER_SITE' | 'PERSONNEL' | 'CHECKPOINT' | 'ACTIVE_SESSION';
type ActiveSite = Site & {
  activeCount: number;
  capacityStatus: 'FULL' | 'AVAILABLE';
  sessions: Array<PatrolSession & { memberName: string; npk: string }>;
};
type MasterSite = Site & { activeCount: number };
interface MasterData {
  customers: Customer[];
  sites: MasterSite[];
  personnel: User[];
  checkpoints: Checkpoint[];
}

const emptyMasters: MasterData = { customers: [], sites: [], personnel: [], checkpoints: [] };

export const MasterMonitoringView: React.FC<{
  onBack: () => void;
  onNavigate: (tab: 'users' | 'checkpoints') => void;
}> = ({ onBack, onNavigate }) => {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [masters, setMasters] = useState<MasterData>(emptyMasters);
  const [activeSites, setActiveSites] = useState<ActiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MasterTab>(() => {
    if (!user) return 'CUSTOMER_SITE';
    const saved = sessionStorage.getItem(`ops:masterTab:${user.id}`);
    return ['CUSTOMER_SITE', 'PERSONNEL', 'CHECKPOINT', 'ACTIVE_SESSION'].includes(saved || '')
      ? saved as MasterTab
      : 'CUSTOMER_SITE';
  });

  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [showEmptySites, setShowEmptySites] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const [showMasterForm, setShowMasterForm] = useState(false);
  const [masterFormMode, setMasterFormMode] = useState<'NEW_CUSTOMER' | 'EXISTING_CUSTOMER'>('NEW_CUSTOMER');
  const [customerForm, setCustomerForm] = useState({ code: '', name: '' });
  const [siteForm, setSiteForm] = useState({ name: '', customerId: '', personnelCapacity: 1, targetRoundsPerShift: 1 });

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: '', status: 'ACTIVE' as Customer['status'] });
  const [editingSite, setEditingSite] = useState<MasterSite | null>(null);
  const [editSiteForm, setEditSiteForm] = useState({
    name: '',
    personnelCapacity: 1,
    targetRoundsPerShift: 1,
    status: 'ACTIVE' as Site['status'],
  });
  const [deleteSiteTarget, setDeleteSiteTarget] = useState<MasterSite | null>(null);

  const [forceTarget, setForceTarget] = useState<(PatrolSession & { memberName: string; npk: string }) | null>(null);
  const [reason, setReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [masterResult, activeResult] = await Promise.all([api.getMasters(), api.getActiveSessions()]);
      setMasters({
        customers: masterResult.customers,
        sites: masterResult.sites,
        personnel: masterResult.personnel,
        checkpoints: masterResult.checkpoints,
      });
      setActiveSites(activeResult.sites);
      setSiteForm((current) => ({
        ...current,
        customerId: current.customerId || masterResult.customers[0]?.id || '',
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat master dan monitoring.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!user) return;
    sessionStorage.setItem(`ops:masterTab:${user.id}`, activeTab);
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'master');
    params.set('tab', activeTab.toLowerCase());
    if (customerFilter) params.set('customer', customerFilter); else params.delete('customer');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [activeTab, customerFilter, user]);

  const customerName = (id: string) => masters.customers.find((customer) => customer.id === id)?.name || id;
  const checkpointCount = (siteId: string) => masters.checkpoints.filter((checkpoint) => checkpoint.siteId === siteId).length;
  const personnelForSite = (siteId: string) => masters.personnel.filter((person) => person.siteId === siteId);
  const checkpointsForSite = (siteId: string) => masters.checkpoints.filter((checkpoint) => checkpoint.siteId === siteId);

  const filteredSites = useMemo(() => masters.sites.filter((site) => {
    const personnelText = masters.personnel
      .filter((person) => person.siteId === site.id)
      .map((person) => `${person.name} ${person.npk}`)
      .join(' ');
    const text = `${site.name} ${site.code || site.id} ${customerName(site.customerId)} ${personnelText}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (!customerFilter || site.customerId === customerFilter)
      && (activeTab !== 'CUSTOMER_SITE' || !statusFilter || site.status === statusFilter);
  }), [masters, search, customerFilter, statusFilter, activeTab]);

  const filteredCustomers = useMemo(() => masters.customers.filter((customer) => {
    if (customerFilter && customer.id !== customerFilter) return false;
    const customerSites = filteredSites.filter((site) => site.customerId === customer.id);
    const ownMatch = `${customer.name} ${customer.code}`.toLowerCase().includes(search.toLowerCase());
    return !search || ownMatch || customerSites.length > 0;
  }), [masters.customers, customerFilter, filteredSites, search]);

  const visibleActiveSites = useMemo(() => activeSites.filter((site) => {
    const text = `${site.name} ${site.code || site.id} ${customerName(site.customerId)} ${site.sessions.map((session) => session.memberName).join(' ')}`.toLowerCase();
    return (showEmptySites || site.activeCount > 0)
      && (!customerFilter || site.customerId === customerFilter)
      && (!search || text.includes(search.toLowerCase()));
  }), [activeSites, showEmptySites, customerFilter, search, masters.customers]);

  const activePersonnel = activeSites.reduce((sum, site) => sum + site.activeCount, 0);
  const activeSiteCount = activeSites.filter((site) => site.activeCount > 0).length;
  const fullSiteCount = activeSites.filter((site) => site.capacityStatus === 'FULL').length;

  const toggleFolder = (key: string) => {
    setExpandedFolders((current) => ({ ...current, [key]: !current[key] }));
  };

  const resetMasterForm = () => {
    setCustomerForm({ code: '', name: '' });
    setSiteForm({
      name: '',
      customerId: masters.customers[0]?.id || '',
      personnelCapacity: 1,
      targetRoundsPerShift: 1,
    });
    setMasterFormMode('NEW_CUSTOMER');
  };

  const createCustomerAndSite = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionBusy(true);
    try {
      let customerId = siteForm.customerId;
      if (masterFormMode === 'NEW_CUSTOMER') {
        const createdCustomer = await api.createCustomer(customerForm);
        customerId = createdCustomer.customer.id;
      }
      if (!customerId) throw new Error('Customer wajib dipilih.');
      await api.createSite({
        name: siteForm.name.trim(),
        customerId,
        personnelCapacity: siteForm.personnelCapacity,
        targetRoundsPerShift: siteForm.targetRoundsPerShift,
      });
      setMessage(masterFormMode === 'NEW_CUSTOMER'
        ? 'Customer dan Site berhasil ditambahkan.'
        : 'Site baru berhasil ditambahkan ke Customer.');
      setShowMasterForm(false);
      resetMasterForm();
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError || error instanceof Error ? error.message : 'Gagal menambah Customer dan Site.');
    } finally {
      setActionBusy(false);
    }
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditCustomerForm({ name: customer.name, status: customer.status });
  };

  const saveCustomer = async () => {
    if (!editingCustomer || !editCustomerForm.name.trim()) return;
    setActionBusy(true);
    try {
      await api.updateCustomer(editingCustomer.id, {
        name: editCustomerForm.name.trim(),
        status: editCustomerForm.status,
      });
      setEditingCustomer(null);
      setMessage('Data Customer berhasil diperbarui.');
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengubah Customer.');
    } finally {
      setActionBusy(false);
    }
  };

  const openEditSite = (site: MasterSite) => {
    setEditingSite(site);
    setEditSiteForm({
      name: site.name,
      personnelCapacity: site.personnelCapacity,
      targetRoundsPerShift: site.targetRoundsPerShift || 1,
      status: site.status,
    });
  };

  const saveSite = async () => {
    if (!editingSite || !editSiteForm.name.trim()) return;
    setActionBusy(true);
    try {
      await api.updateSite(editingSite.id, {
        name: editSiteForm.name.trim(),
        personnelCapacity: editSiteForm.personnelCapacity,
        targetRoundsPerShift: editSiteForm.targetRoundsPerShift,
        status: editSiteForm.status,
      });
      setEditingSite(null);
      setMessage('Data Site berhasil diperbarui.');
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengubah Site.');
    } finally {
      setActionBusy(false);
    }
  };

  const deleteSite = async () => {
    if (!deleteSiteTarget) return;
    setActionBusy(true);
    try {
      await api.deleteSite(deleteSiteTarget.id);
      setMessage(`Site ${deleteSiteTarget.name} berhasil dihapus.`);
      setDeleteSiteTarget(null);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Site gagal dihapus.');
    } finally {
      setActionBusy(false);
    }
  };

  const forceClose = async () => {
    if (!forceTarget || !reason.trim()) return;
    setActionBusy(true);
    try {
      await api.forceCloseSession(forceTarget.id, reason.trim());
      setMessage(`Session ${forceTarget.memberName} berhasil di-force close.`);
      setForceTarget(null);
      setReason('');
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Force close gagal.');
    } finally {
      setActionBusy(false);
    }
  };

  const renderSiteFolder = (site: MasterSite, type: 'PERSONNEL' | 'CHECKPOINT') => {
    const key = `${type}:${site.id}`;
    const expanded = !!expandedFolders[key];
    const people = personnelForSite(site.id);
    const checkpoints = checkpointsForSite(site.id);
    const count = type === 'PERSONNEL' ? people.length : checkpoints.length;

    return (
      <article key={site.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => toggleFolder(key)}
          className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-800/60 bg-blue-950/30 text-blue-300">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">
                {customerName(site.customerId)}
              </p>
              <h3 className="truncate text-sm font-black text-white">{site.name}</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {count} {type === 'PERSONNEL' ? 'personel' : 'checkpoint'} • {site.status}
              </p>
            </div>
          </div>
          {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />}
        </button>

        {expanded ? (
          <div className="space-y-2 border-t border-slate-800 bg-[#08111f]/45 p-3">
            {type === 'PERSONNEL' ? (
              people.length ? people
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((person) => (
                  <div key={person.id} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-blue-300"><UserRound className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{person.name}</p>
                        <p className="truncate font-mono text-[10px] text-slate-500">NPK {person.npk} • {person.position || person.role}</p>
                      </div>
                    </div>
                    <span className={`self-start rounded-full px-2 py-1 text-[9px] font-black sm:self-auto ${person.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {person.status}
                    </span>
                  </div>
                )) : <p className="py-4 text-center text-xs text-slate-500">Belum ada personel pada Site ini.</p>
            ) : (
              checkpoints.length ? checkpoints
                .slice()
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((checkpoint) => (
                  <div key={checkpoint.id} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black text-white">{checkpoint.code} • {checkpoint.name}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">Radius {checkpoint.radiusMeters}m • QR {checkpoint.qrStatus}</p>
                    </div>
                    <span className={`self-start rounded-full px-2 py-1 text-[9px] font-black sm:self-auto ${checkpoint.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {checkpoint.status}
                    </span>
                  </div>
                )) : <p className="py-4 text-center text-xs text-slate-500">Belum ada checkpoint pada Site ini.</p>
            )}

            {canMutate ? (
              <button
                type="button"
                onClick={() => onNavigate(type === 'PERSONNEL' ? 'users' : 'checkpoints')}
                className="mt-2 min-h-10 w-full rounded-xl border border-blue-800/60 bg-blue-950/30 px-3 text-[10px] font-black text-blue-200 transition hover:bg-blue-900/40"
              >
                {type === 'PERSONNEL' ? 'BUKA MANAJEMEN PETUGAS' : 'BUKA MANAJEMEN TITIK QR'}
              </button>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-24 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800" aria-label="Kembali">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-extrabold">MASTER & MONITORING</h1>
              <p className="truncate text-[11px] text-slate-400">Customer → Site → Data Operasional</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadData()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800" aria-label="Muat ulang">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6 lg:pt-6">
        {message ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-800 bg-blue-950/40 p-3 text-xs" role="status" aria-live="polite">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="rounded-lg px-2 py-1 font-black text-blue-300 hover:bg-blue-900/40">TUTUP</button>
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            { label: 'Customer', value: masters.customers.length, Icon: Building2 },
            { label: 'Site', value: masters.sites.length, Icon: MapPin },
            { label: 'Personel', value: masters.personnel.length, Icon: Users },
            { label: 'Checkpoint', value: masters.checkpoints.length, Icon: QrCode },
            { label: 'Active Session', value: activePersonnel, Icon: Activity },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <Icon className="h-4 w-4 text-blue-400" />
              <div className="mt-1 text-2xl font-black">{value}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
            </div>
          ))}
        </section>

        <nav className="ops-scroll-x flex gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-1" role="tablist" aria-label="Master dan monitoring">
          {([
            ['CUSTOMER_SITE', 'CUSTOMER & SITE'],
            ['PERSONNEL', 'PERSONEL'],
            ['CHECKPOINT', 'CHECKPOINT'],
            ['ACTIVE_SESSION', 'ACTIVE SESSION'],
          ] as Array<[MasterTab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`min-h-10 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <div className="grid gap-2 text-xs md:grid-cols-3">
            <label className="relative">
              <span className="font-bold text-slate-300">Search</span>
              <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari customer, site, petugas..."
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-white outline-none focus:border-blue-500"
              />
            </label>

            <label>
              <span className="font-bold text-slate-300">Customer</span>
              <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">
                <option value="">Semua Customer</option>
                {masters.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>

            {activeTab === 'CUSTOMER_SITE' ? (
              <label>
                <span className="font-bold text-slate-300">Status Site</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">
                  <option value="">Semua Status</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            ) : activeTab === 'ACTIVE_SESSION' ? (
              <label className="flex min-h-10 items-end gap-2 pb-2">
                <input type="checkbox" checked={showEmptySites} onChange={(event) => setShowEmptySites(event.target.checked)} />
                Tampilkan Site Kosong
              </label>
            ) : <div />}
          </div>
        </section>

        {activeTab === 'CUSTOMER_SITE' ? (
          <section className="space-y-3">
            {canMutate ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { resetMasterForm(); setShowMasterForm(true); }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500"
                >
                  <Plus className="h-4 w-4" />
                  ADD CUST & SITE
                </button>
              </div>
            ) : null}

            {filteredCustomers.map((customer) => {
              const sites = filteredSites.filter((site) => site.customerId === customer.id);
              return (
                <article key={customer.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <div className="flex flex-col gap-3 border-b border-slate-800 bg-[#08111f]/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Customer</p>
                      <h2 className="mt-1 text-sm font-black text-white">{customer.name}</h2>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">{customer.code} • {customer.status}</p>
                    </div>
                    {canMutate ? (
                      <button type="button" onClick={() => openEditCustomer(customer)} className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-slate-700 bg-slate-800 px-3 text-[10px] font-black text-slate-200 hover:bg-slate-700 sm:self-auto">
                        <Pencil className="h-3.5 w-3.5" /> EDIT CUSTOMER
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-2 p-3">
                    {sites.length ? sites.map((site) => {
                      const cpCount = checkpointCount(site.id);
                      const rounds = Math.max(1, site.targetRoundsPerShift || 1);
                      return (
                        <div key={site.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Site</p>
                            <h3 className="mt-1 truncate text-sm font-black text-white">{site.name}</h3>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                              <span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300">Active {site.activeCount}/{site.personnelCapacity}</span>
                              <span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300">{cpCount} Checkpoint</span>
                              <span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300">Target {rounds} ronde</span>
                              <span className={`rounded-lg px-2 py-1 font-black ${site.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{site.status}</span>
                            </div>
                          </div>

                          {canMutate ? (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => openEditSite(site)} className="min-h-10 rounded-xl border border-slate-700 bg-slate-800 px-3 text-[10px] font-black text-slate-200 hover:bg-slate-700">
                                EDIT SITE
                              </button>
                              <button type="button" onClick={() => setDeleteSiteTarget(site)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-900/70 bg-red-950/30 px-3 text-[10px] font-black text-red-300 hover:bg-red-900/40">
                                <Trash2 className="h-3.5 w-3.5" /> HAPUS SITE
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    }) : (
                      <div className="rounded-xl border border-dashed border-amber-800/60 bg-amber-950/20 p-4 text-xs text-amber-200">
                        Customer ini belum memiliki Site pada filter aktif.
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {filteredCustomers.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">Tidak ada Customer/Site sesuai filter.</div> : null}
          </section>
        ) : null}

        {activeTab === 'PERSONNEL' ? (
          <section className="space-y-3">
            {filteredSites.map((site) => renderSiteFolder(site, 'PERSONNEL'))}
            {filteredSites.length === 0 ? <div className="rounded-2xl bg-slate-900 p-8 text-center text-xs text-slate-500">Tidak ada Site sesuai filter.</div> : null}
          </section>
        ) : null}

        {activeTab === 'CHECKPOINT' ? (
          <section className="space-y-3">
            {filteredSites.map((site) => renderSiteFolder(site, 'CHECKPOINT'))}
            {filteredSites.length === 0 ? <div className="rounded-2xl bg-slate-900 p-8 text-center text-xs text-slate-500">Tidak ada Site sesuai filter.</div> : null}
          </section>
        ) : null}

        {activeTab === 'ACTIVE_SESSION' ? (
          <section className="space-y-3">
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
              {[
                ['Active Personnel', activePersonnel],
                ['Active Sites', activeSiteCount],
                ['Full Sites', fullSiteCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
                  <div className="text-2xl font-black">{value}</div>
                  <div className="text-[10px] text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            {visibleActiveSites.map((site) => {
              const key = `ACTIVE:${site.id}`;
              const expanded = !!expandedFolders[key];
              return (
                <article key={site.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <button type="button" aria-expanded={expanded} onClick={() => toggleFolder(key)} className="flex min-h-16 w-full items-center justify-between gap-3 p-4 text-left text-xs transition hover:bg-slate-800/60">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">{customerName(site.customerId)}</p>
                      <b className="mt-1 block text-sm text-white">{site.name}</b>
                      <div className="mt-1 text-slate-400">{site.activeCount}/{site.personnelCapacity} • {site.capacityStatus}</div>
                    </div>
                    {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  </button>

                  {expanded ? (
                    <div className="space-y-2 border-t border-slate-800 p-3">
                      {site.sessions.map((session) => (
                        <div key={session.id} className="flex flex-col justify-between gap-3 rounded-xl bg-slate-950 p-3 text-xs md:flex-row md:items-center">
                          <div>
                            <b className="text-white">{session.memberName}</b> <span className="font-mono text-slate-500">({session.npk})</span>
                            <div className="mt-1 text-slate-400">{session.shiftCode} • Mulai {new Date(session.startedAt).toLocaleString('id-ID')} • Ronde {session.roundNumber || 1} • {session.totalValid}/{session.totalRequired}</div>
                          </div>
                          {canMutate ? (
                            <button type="button" onClick={() => { setForceTarget(session); setReason(''); }} className="min-h-10 rounded-xl border border-red-900/70 bg-red-950/30 px-3 text-[10px] font-black text-red-300 hover:bg-red-900/40">
                              FORCE CLOSE
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {visibleActiveSites.length === 0 ? <div className="rounded-2xl bg-slate-900 p-8 text-center text-xs text-slate-500">Tidak ada site aktif sesuai filter.</div> : null}
          </section>
        ) : null}
      </main>

      {showMasterForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#0f172a] shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="master-create-title">
            <header className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-[#08111f]/95 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Master Data</p>
                <h2 id="master-create-title" className="mt-1 text-base font-black text-white">ADD CUSTOMER & SITE</h2>
              </div>
              <button type="button" onClick={() => setShowMasterForm(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Tutup form">✕</button>
            </header>

            <form onSubmit={createCustomerAndSite} className="space-y-4 overflow-y-auto p-5 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-1">
                <button type="button" onClick={() => setMasterFormMode('NEW_CUSTOMER')} className={`min-h-10 rounded-xl px-3 font-black ${masterFormMode === 'NEW_CUSTOMER' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>CUSTOMER BARU + SITE</button>
                <button type="button" disabled={masters.customers.length === 0} onClick={() => setMasterFormMode('EXISTING_CUSTOMER')} className={`min-h-10 rounded-xl px-3 font-black disabled:opacity-40 ${masterFormMode === 'EXISTING_CUSTOMER' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>SITE KE CUSTOMER EXISTING</button>
              </div>

              {masterFormMode === 'NEW_CUSTOMER' ? (
                <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div>
                    <p className="font-black text-white">Data Customer</p>
                    <p className="mt-1 text-[10px] text-slate-500">Customer baru wajib langsung memiliki minimal satu Site.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="font-bold text-slate-300">Kode Customer<input required value={customerForm.code} onChange={(event) => setCustomerForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Contoh: AIS" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white outline-none focus:border-blue-500" /></label>
                    <label className="font-bold text-slate-300">Nama Customer<input required value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nama perusahaan/customer" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white outline-none focus:border-blue-500" /></label>
                  </div>
                </section>
              ) : (
                <label className="block font-bold text-slate-300">
                  Customer
                  <select required value={siteForm.customerId} onChange={(event) => setSiteForm((current) => ({ ...current, customerId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white">
                    <option value="">Pilih Customer</option>
                    {masters.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </label>
              )}

              <section className="space-y-3 rounded-2xl border border-blue-900/60 bg-blue-950/10 p-4">
                <div>
                  <p className="font-black text-white">Data Site</p>
                  <p className="mt-1 text-[10px] text-slate-500">Kode Site dibuat otomatis oleh sistem. User cukup menentukan nama Site dan parameter operasional.</p>
                </div>
                <label className="block font-bold text-slate-300">Nama Site<input required value={siteForm.name} onChange={(event) => setSiteForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Barang Bukti KM 92" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white outline-none focus:border-blue-500" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="font-bold text-slate-300">Kapasitas Personel Aktif<input type="number" min="1" required value={siteForm.personnelCapacity} onChange={(event) => setSiteForm((current) => ({ ...current, personnelCapacity: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
                  <label className="font-bold text-slate-300">Target Ronde / Shift<input type="number" min="1" max="20" required value={siteForm.targetRoundsPerShift} onChange={(event) => setSiteForm((current) => ({ ...current, targetRoundsPerShift: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
                </div>
              </section>

              <button type="submit" disabled={actionBusy} className="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-black text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-50">
                {actionBusy ? 'MENYIMPAN...' : masterFormMode === 'NEW_CUSTOMER' ? 'SIMPAN CUSTOMER & SITE' : 'TAMBAH SITE'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {editingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-[#0f172a] shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Edit Customer</p><h2 className="mt-1 font-black text-white">{editingCustomer.name}</h2></div>
              <button type="button" onClick={() => setEditingCustomer(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-slate-400" aria-label="Tutup">✕</button>
            </header>
            <div className="space-y-4 p-5 text-xs">
              <label className="block font-bold text-slate-300">Nama Customer<input value={editCustomerForm.name} onChange={(event) => setEditCustomerForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              <label className="block font-bold text-slate-300">Status<select value={editCustomerForm.status} onChange={(event) => setEditCustomerForm((current) => ({ ...current, status: event.target.value as Customer['status'] }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              <button type="button" disabled={actionBusy || !editCustomerForm.name.trim()} onClick={() => void saveCustomer()} className="min-h-11 w-full rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">SIMPAN PERUBAHAN</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingSite ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-[#0f172a] shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Edit Site</p><h2 className="mt-1 font-black text-white">{editingSite.name}</h2></div>
              <button type="button" onClick={() => setEditingSite(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-slate-400" aria-label="Tutup">✕</button>
            </header>
            <div className="space-y-4 p-5 text-xs">
              <label className="block font-bold text-slate-300">Nama Site<input value={editSiteForm.name} onChange={(event) => setEditSiteForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="font-bold text-slate-300">Capacity<input type="number" min="1" value={editSiteForm.personnelCapacity} onChange={(event) => setEditSiteForm((current) => ({ ...current, personnelCapacity: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
                <label className="font-bold text-slate-300">Target Ronde<input type="number" min="1" max="20" value={editSiteForm.targetRoundsPerShift} onChange={(event) => setEditSiteForm((current) => ({ ...current, targetRoundsPerShift: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              </div>
              <label className="block font-bold text-slate-300">Status<select value={editSiteForm.status} onChange={(event) => setEditSiteForm((current) => ({ ...current, status: event.target.value as Site['status'] }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              <button type="button" disabled={actionBusy || !editSiteForm.name.trim()} onClick={() => void saveSite()} className="min-h-11 w-full rounded-xl bg-blue-600 font-black text-white disabled:opacity-40">SIMPAN PERUBAHAN</button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmActionDialog
        open={!!deleteSiteTarget}
        title={deleteSiteTarget ? `Hapus Site ${deleteSiteTarget.name}?` : 'Hapus Site?'}
        description="Site hanya dapat dihapus jika belum memiliki personel, checkpoint, atau histori operasional. Jika sudah pernah digunakan, sistem akan menolak penghapusan dan Site harus dinonaktifkan."
        confirmLabel="HAPUS SITE"
        requireText={deleteSiteTarget?.name}
        requireTextLabel="Ketik ulang nama Site untuk menghapus:"
        busy={actionBusy}
        onCancel={() => setDeleteSiteTarget(null)}
        onConfirm={deleteSite}
      />

      <ConfirmActionDialog
        open={!!forceTarget}
        title={forceTarget ? `Force Close ${forceTarget.memberName}?` : 'Force Close Shift?'}
        description="Force Close akan menghentikan session aktif. Tindakan ini tercatat pada Audit Trail."
        confirmLabel="FORCE CLOSE"
        tone="danger"
        busy={actionBusy}
        confirmDisabled={!reason.trim()}
        onCancel={() => { setForceTarget(null); setReason(''); }}
        onConfirm={forceClose}
      >
        <label className="block text-xs font-bold text-slate-300">
          Alasan Force Close
          <textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tuliskan alasan..." className="mt-2 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-normal text-white outline-none focus:border-red-500" />
        </label>
        <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">
          <ShieldAlert className="mr-2 inline h-4 w-4" />
          Session tidak dapat dilanjutkan setelah Force Close.
        </div>
      </ConfirmActionDialog>
    </div>
  );
};
