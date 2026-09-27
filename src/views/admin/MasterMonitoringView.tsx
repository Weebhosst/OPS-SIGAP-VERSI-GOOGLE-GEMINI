import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Customer, PatrolSession, Site } from '../../types/ops';
import {
  OpsDangerConfirmDialog,
  OpsDialog,
  OpsNoticeDialog,
  type OpsDialogTone,
} from '../../components/OpsDialog';

type MasterTab = 'CUSTOMER_SITE' | 'PERSONNEL' | 'CHECKPOINT' | 'ACTIVE_SESSION';
type ActiveSite = Site & {
  activeCount: number;
  capacityStatus: 'FULL' | 'AVAILABLE';
  sessions: Array<PatrolSession & { memberName: string; npk: string }>;
};
type SiteWithActive = Site & { activeCount: number };

interface MasterData {
  customers: Customer[];
  sites: SiteWithActive[];
  personnel: Array<{ id: string }>;
  checkpoints: Array<{ id: string; siteId: string }>;
}

const emptyMasters: MasterData = {
  customers: [],
  sites: [],
  personnel: [],
  checkpoints: [],
};

const initialBundleForm = {
  code: '',
  customerName: '',
  siteName: '',
  personnelCapacity: 1,
  targetRoundsPerShift: 1,
};

const initialSiteForm = {
  name: '',
  personnelCapacity: 1,
  targetRoundsPerShift: 1,
  status: 'ACTIVE' as Site['status'],
};

export const MasterMonitoringView: React.FC<{
  onBack: () => void;
  onNavigate: (tab: 'users' | 'checkpoints') => void;
}> = ({ onBack, onNavigate }) => {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [masters, setMasters] = useState<MasterData>(emptyMasters);
  const [activeSites, setActiveSites] = useState<ActiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MasterTab>(() => {
    const queryTab = new URLSearchParams(window.location.search).get('tab')?.toUpperCase();
    if (queryTab && ['CUSTOMER_SITE', 'PERSONNEL', 'CHECKPOINT', 'ACTIVE_SESSION'].includes(queryTab)) {
      return queryTab as MasterTab;
    }
    if (!user) return 'CUSTOMER_SITE';
    const saved = sessionStorage.getItem(`ops:masterTab:${user.id}`);
    return ['CUSTOMER_SITE', 'PERSONNEL', 'CHECKPOINT', 'ACTIVE_SESSION'].includes(saved || '')
      ? (saved as MasterTab)
      : 'CUSTOMER_SITE';
  });

  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showEmptySites, setShowEmptySites] = useState(false);
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const [forceTarget, setForceTarget] = useState<(PatrolSession & { memberName: string; npk: string }) | null>(null);
  const [reason, setReason] = useState('');

  const [showCreateBundle, setShowCreateBundle] = useState(false);
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [bundleForm, setBundleForm] = useState(initialBundleForm);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState({ name: '', status: 'ACTIVE' as Customer['status'] });
  const [addingSiteCustomer, setAddingSiteCustomer] = useState<Customer | null>(null);
  const [editingSite, setEditingSite] = useState<SiteWithActive | null>(null);
  const [siteForm, setSiteForm] = useState(initialSiteForm);
  const [deleteSiteTarget, setDeleteSiteTarget] = useState<SiteWithActive | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; tone: OpsDialogTone } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [masterResult, activeResult] = await Promise.all([api.getMasters(), api.getActiveSessions()]);
      setMasters(masterResult);
      setActiveSites(activeResult.sites);
    } catch (error) {
      setNotice({
        title: 'Master Monitoring Gagal Dimuat',
        message: error instanceof Error ? error.message : 'Gagal memuat master dan monitoring.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!user) return;
    sessionStorage.setItem(`ops:masterTab:${user.id}`, activeTab);
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'master');
    params.set('tab', activeTab.toLowerCase());
    if (customerFilter) params.set('customer', customerFilter);
    else params.delete('customer');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [activeTab, customerFilter, user]);

  const checkpointCount = (siteId: string) =>
    masters.checkpoints.filter((checkpoint) => checkpoint.siteId === siteId).length;

  const activePersonnel = activeSites.reduce((sum, site) => sum + site.activeCount, 0);
  const activeSiteCount = activeSites.filter((site) => site.activeCount > 0).length;
  const fullSiteCount = activeSites.filter((site) => site.capacityStatus === 'FULL').length;

  const customerGroups = useMemo(() => {
    const query = search.trim().toLowerCase();

    return masters.customers
      .filter((customer) => !customerFilter || customer.id === customerFilter)
      .map((customer) => {
        const customerMatches =
          !query ||
          customer.name.toLowerCase().includes(query) ||
          customer.code.toLowerCase().includes(query);

        const sites = masters.sites.filter((site) => {
          if (site.customerId !== customer.id) return false;
          if (statusFilter && site.status !== statusFilter) return false;
          if (!query || customerMatches) return true;
          return site.name.toLowerCase().includes(query);
        });

        return { customer, sites, customerMatches };
      })
      .filter(({ sites, customerMatches }) => customerMatches || sites.length > 0);
  }, [masters.customers, masters.sites, customerFilter, search, statusFilter]);

  const visibleActiveSites = useMemo(
    () =>
      activeSites.filter(
        (site) =>
          (showEmptySites || site.activeCount > 0) &&
          (!customerFilter || site.customerId === customerFilter) &&
          (!search ||
            `${site.name} ${site.sessions.map((session) => session.memberName).join(' ')}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [activeSites, showEmptySites, customerFilter, search],
  );

  const resetBundle = () => {
    setCustomerMode('NEW');
    setSelectedCustomerId('');
    setBundleForm(initialBundleForm);
    setShowCreateBundle(false);
  };

  const openCreateBundle = () => {
    setCustomerMode('NEW');
    setSelectedCustomerId(masters.customers[0]?.id || '');
    setBundleForm(initialBundleForm);
    setShowCreateBundle(true);
  };

  const submitCustomerWithSite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (customerMode === 'EXISTING' && !selectedCustomerId) {
      setNotice({
        title: 'Customer Belum Dipilih',
        message: 'Pilih Customer terdaftar terlebih dahulu sebelum menambahkan Site.',
        tone: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (customerMode === 'EXISTING') {
        const selectedCustomer = masters.customers.find((customer) => customer.id === selectedCustomerId);
        await api.createSite({
          name: bundleForm.siteName,
          customerId: selectedCustomerId,
          personnelCapacity: bundleForm.personnelCapacity,
          targetRoundsPerShift: bundleForm.targetRoundsPerShift,
        });
        setExpandedCustomers((current) => ({ ...current, [selectedCustomerId]: true }));
        resetBundle();
        await loadData();
        setNotice({
          title: 'Site Ditambahkan',
          message: `Site baru berhasil ditambahkan ke ${selectedCustomer?.name || 'Customer terpilih'}.`,
          tone: 'success',
        });
      } else {
        await api.createCustomerWithSite(bundleForm);
        resetBundle();
        await loadData();
        setNotice({
          title: 'Customer & Site Ditambahkan',
          message: 'Customer baru berhasil dibuat bersama Site awalnya.',
          tone: 'success',
        });
      }
    } catch (error) {
      setNotice({
        title: customerMode === 'EXISTING' ? 'Tambah Site Gagal' : 'Tambah Customer & Site Gagal',
        message:
          error instanceof ApiError
            ? error.message
            : customerMode === 'EXISTING'
              ? 'Gagal menambah Site ke Customer terdaftar.'
              : 'Gagal menambah Customer dan Site.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditCustomer = (customer: Customer) => {
    setCustomerEditForm({ name: customer.name, status: customer.status });
    setEditingCustomer(customer);
  };

  const submitEditCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCustomer || submitting) return;
    setSubmitting(true);
    try {
      await api.updateCustomer(editingCustomer.id, customerEditForm);
      setEditingCustomer(null);
      await loadData();
      setNotice({
        title: 'Customer Diperbarui',
        message: 'Data Customer berhasil diperbarui.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Edit Customer Gagal',
        message: error instanceof Error ? error.message : 'Gagal memperbarui Customer.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openAddSite = (customer: Customer) => {
    setAddingSiteCustomer(customer);
    setSiteForm(initialSiteForm);
  };

  const submitAddSite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!addingSiteCustomer || submitting) return;
    setSubmitting(true);
    try {
      await api.createSite({
        name: siteForm.name,
        customerId: addingSiteCustomer.id,
        personnelCapacity: siteForm.personnelCapacity,
        targetRoundsPerShift: siteForm.targetRoundsPerShift,
      });
      setAddingSiteCustomer(null);
      setSiteForm(initialSiteForm);
      await loadData();
      setNotice({
        title: 'Site Ditambahkan',
        message: `Site baru berhasil ditambahkan ke ${addingSiteCustomer.name}.`,
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Tambah Site Gagal',
        message: error instanceof Error ? error.message : 'Gagal menambah Site.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditSite = (site: SiteWithActive) => {
    setEditingSite(site);
    setSiteForm({
      name: site.name,
      personnelCapacity: site.personnelCapacity,
      targetRoundsPerShift: site.targetRoundsPerShift || 1,
      status: site.status,
    });
  };

  const submitEditSite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingSite || submitting) return;
    setSubmitting(true);
    try {
      await api.updateSite(editingSite.id, {
        name: siteForm.name,
        personnelCapacity: siteForm.personnelCapacity,
        targetRoundsPerShift: siteForm.targetRoundsPerShift,
        status: siteForm.status,
      });
      setEditingSite(null);
      setSiteForm(initialSiteForm);
      await loadData();
      setNotice({
        title: 'Site Diperbarui',
        message: 'Data Site berhasil diperbarui.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Edit Site Gagal',
        message: error instanceof Error ? error.message : 'Gagal memperbarui Site.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSite = async () => {
    if (!deleteSiteTarget) return;
    const target = deleteSiteTarget;
    try {
      await api.deleteSite(target.id, `HAPUS ${target.name}`);
      setDeleteSiteTarget(null);
      await loadData();
      setNotice({
        title: 'Site Dihapus',
        message: `Site ${target.name} berhasil dihapus. Jejak penghapusan dicatat di Audit Trail.`,
        tone: 'success',
      });
    } catch (error) {
      setDeleteSiteTarget(null);
      setNotice({
        title: 'Site Tidak Dapat Dihapus',
        message:
          error instanceof Error
            ? error.message
            : 'Site masih memiliki dependency atau merupakan Site terakhir Customer.',
        tone: 'danger',
      });
    }
  };

  const forceClose = async () => {
    if (!forceTarget || !reason.trim()) return;
    try {
      await api.forceCloseSession(forceTarget.id, reason.trim());
      const memberName = forceTarget.memberName;
      setForceTarget(null);
      setReason('');
      await loadData();
      setNotice({
        title: 'Session Ditutup',
        message: `Session ${memberName} berhasil di-force close.`,
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Force Close Gagal',
        message: error instanceof ApiError ? error.message : 'Force close gagal.',
        tone: 'danger',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-24 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="rounded-xl bg-slate-800 p-2" aria-label="Kembali">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-extrabold">MASTER & MONITORING</h1>
              <p className="text-[11px] text-slate-400">Customer → Site → Data Operasional</p>
            </div>
          </div>
          <button onClick={() => void loadData()} className="rounded-xl bg-slate-800 p-2" aria-label="Muat ulang">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            { label: 'Customer', value: masters.customers.length, Icon: Building2 },
            { label: 'Site', value: masters.sites.length, Icon: MapPin },
            { label: 'Personel', value: masters.personnel.length, Icon: Users },
            { label: 'Checkpoint', value: masters.checkpoints.length, Icon: QrCode },
            { label: 'Active Session', value: activePersonnel, Icon: Activity },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <Icon className="h-4 w-4 text-blue-400" />
              <div className="mt-1 text-2xl font-black">{value}</div>
              <div className="text-[10px] uppercase text-slate-400">{label}</div>
            </div>
          ))}
        </section>

        <nav
          className="ops-scroll-x flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1"
          role="tablist"
          aria-label="Master dan monitoring"
        >
          {(
            [
              ['CUSTOMER_SITE', 'CUSTOMER & SITE'],
              ['PERSONNEL', 'PERSONEL'],
              ['CHECKPOINT', 'CHECKPOINT'],
              ['ACTIVE_SESSION', 'ACTIVE SESSION'],
            ] as Array<[MasterTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`min-h-10 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${
                activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'CUSTOMER_SITE' ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="grid flex-1 gap-2 text-xs md:grid-cols-3">
                  <label className="relative">
                    <span className="font-bold text-slate-300">Cari Customer / Site</span>
                    <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-500" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Nama Customer atau Site"
                      className="ops-input mt-1 py-2 pl-9 pr-3"
                    />
                  </label>
                  <label>
                    <span className="font-bold text-slate-300">Customer</span>
                    <select
                      value={customerFilter}
                      onChange={(event) => setCustomerFilter(event.target.value)}
                      className="ops-input mt-1 px-3"
                    >
                      <option value="">Semua Customer</option>
                      {masters.customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="font-bold text-slate-300">Status Site</span>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="ops-input mt-1 px-3"
                    >
                      <option value="">Semua Status</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </label>
                </div>

                {canMutate ? (
                  <button
                    type="button"
                    onClick={openCreateBundle}
                    className="ops-btn-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-4"
                  >
                    <Plus className="h-4 w-4" />
                    ADD CUST & SITE
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              {customerGroups.map(({ customer, sites }) => {
                const expanded = !!expandedCustomers[customer.id];
                const activeSitesForCustomer = masters.sites.filter(
                  (site) => site.customerId === customer.id && site.status === 'ACTIVE',
                ).length;

                return (
                  <article key={customer.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCustomers((current) => ({
                            ...current,
                            [customer.id]: !current[customer.id],
                          }))
                        }
                        className="flex min-h-16 flex-1 items-center gap-3 p-4 text-left transition hover:bg-slate-800/60"
                        aria-expanded={expanded}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-900/70 bg-blue-950/40 text-blue-300">
                          {expanded ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-300">
                            CUSTOMER
                          </div>
                          <div className="truncate text-sm font-black text-white">{customer.name}</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                            <span>Kode {customer.code}</span>
                            <span>{masters.sites.filter((site) => site.customerId === customer.id).length} Site</span>
                            <span>{activeSitesForCustomer} Aktif</span>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[9px] font-black ${
                            customer.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {customer.status}
                        </span>
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>

                      {canMutate ? (
                        <div className="flex shrink-0 items-center gap-1 border-l border-slate-800 px-2">
                          <button
                            type="button"
                            onClick={() => openEditCustomer(customer)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                            title="Edit Customer"
                            aria-label={`Edit Customer ${customer.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openAddSite(customer)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-blue-300 transition hover:bg-blue-950/50"
                            title="Tambah Site"
                            aria-label={`Tambah Site untuk ${customer.name}`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {expanded ? (
                      <div className="space-y-2 border-t border-slate-800 bg-slate-950/30 p-3">
                        {sites.length > 0 ? (
                          sites.map((site) => {
                            const cp = checkpointCount(site.id);
                            const rounds = Math.max(1, site.targetRoundsPerShift || 1);
                            return (
                              <div
                                key={site.id}
                                className="rounded-xl border border-slate-800 bg-[#0f172a] p-3"
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                                      SITE
                                    </div>
                                    <div className="mt-0.5 text-sm font-black text-white">{site.name}</div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                                      <span className="ops-badge-neutral">Personel Aktif {site.activeCount}/{site.personnelCapacity}</span>
                                      <span className="ops-badge-neutral">Checkpoint {cp}</span>
                                      <span className="ops-badge-neutral">Target Ronde {rounds}</span>
                                      <span className={site.status === 'ACTIVE' ? 'ops-badge-success' : 'ops-badge-neutral'}>
                                        {site.status}
                                      </span>
                                    </div>
                                  </div>

                                  {canMutate ? (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openEditSite(site)}
                                        className="ops-btn-secondary inline-flex min-h-9 items-center gap-1.5 px-3"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        EDIT
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteSiteTarget(site)}
                                        className="ops-btn-danger inline-flex min-h-9 items-center gap-1.5 px-3"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        HAPUS
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">
                            Tidak ada Site yang sesuai filter.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {customerGroups.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
                  Tidak ada Customer atau Site yang sesuai filter.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'PERSONNEL' ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center text-sm">
            <Users className="mx-auto mb-2 h-6 w-6 text-blue-400" />
            <p>{masters.personnel.length} personel terdaftar.</p>
            {canMutate ? (
              <button onClick={() => onNavigate('users')} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold">
                KELOLA PERSONEL
              </button>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Chief: view only</p>
            )}
          </section>
        ) : null}

        {activeTab === 'CHECKPOINT' ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center text-sm">
            <QrCode className="mx-auto mb-2 h-6 w-6 text-blue-400" />
            <p>{masters.checkpoints.length} checkpoint terdaftar.</p>
            {canMutate ? (
              <button onClick={() => onNavigate('checkpoints')} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold">
                BUKA CHECKPOINT BUILDER
              </button>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Chief: view only</p>
            )}
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
                <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center">
                  <div className="text-2xl font-black">{value}</div>
                  <div className="text-[10px] text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs md:grid-cols-3">
              <label className="relative">
                <Search className="absolute left-2 top-8 h-4 w-4 text-slate-500" />
                <span>Search</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari site, petugas"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-2"
                />
              </label>
              <label>
                Customer
                <select
                  value={customerFilter}
                  onChange={(event) => setCustomerFilter(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"
                >
                  <option value="">Semua Customer</option>
                  {masters.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={showEmptySites}
                  onChange={(event) => setShowEmptySites(event.target.checked)}
                />
                Tampilkan Site Kosong
              </label>
            </div>

            {visibleActiveSites.map((site) => (
              <article key={site.id} className="rounded-xl border border-slate-800 bg-slate-900">
                <button
                  type="button"
                  aria-expanded={!!expandedSites[site.id]}
                  onClick={() =>
                    setExpandedSites((current) => ({
                      ...current,
                      [site.id]: !current[site.id],
                    }))
                  }
                  className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left text-xs"
                >
                  <div>
                    <b>{site.name}</b>
                    <div className="text-slate-400">
                      {site.activeCount}/{site.personnelCapacity} • {site.capacityStatus}
                    </div>
                  </div>
                  {expandedSites[site.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {expandedSites[site.id] ? (
                  <div className="space-y-2 border-t border-slate-800 p-3">
                    {site.sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex flex-col justify-between gap-2 rounded-lg bg-slate-950 p-3 text-xs md:flex-row md:items-center"
                      >
                        <div>
                          <b>{session.memberName}</b> ({session.npk})
                          <div className="text-slate-400">
                            {session.shiftCode} • Mulai {new Date(session.startedAt).toLocaleString('id-ID')} • Ronde{' '}
                            {session.roundNumber || 1} • {session.totalValid}/{session.totalRequired}
                          </div>
                        </div>
                        {canMutate ? (
                          <button
                            onClick={() => setForceTarget(session)}
                            className="rounded bg-red-950 px-2 py-1 text-red-300"
                          >
                            FORCE CLOSE
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {visibleActiveSites.length === 0 ? (
              <div className="rounded-xl bg-slate-900 p-6 text-center text-xs text-slate-500">
                Tidak ada site aktif sesuai filter.
              </div>
            ) : null}
          </section>
        ) : null}
      </main>

      <OpsDialog
        isOpen={showCreateBundle}
        onClose={resetBundle}
        title="ADD CUSTOMER & SITE"
        description="Tambahkan Customer baru atau pilih Customer terdaftar untuk menambahkan Site baru."
        tone="info"
        size="lg"
        busy={submitting}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={resetBundle} disabled={submitting} className="ops-btn-secondary px-4">
              BATAL
            </button>
            <button type="submit" form="customer-site-form" disabled={submitting} className="ops-btn-primary px-4 disabled:opacity-40">
              {submitting
                ? 'MENYIMPAN...'
                : customerMode === 'EXISTING'
                  ? 'TAMBAH SITE'
                  : 'SIMPAN CUSTOMER & SITE'}
            </button>
          </div>
        }
      >
        <form id="customer-site-form" onSubmit={submitCustomerWithSite} className="space-y-5">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">PILIH MODE CUSTOMER</div>
              <p className="mt-1 text-xs text-slate-500">
                Satu Customer dapat memiliki banyak Site.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => setCustomerMode('NEW')}
                className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                  customerMode === 'NEW'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                CUSTOMER BARU
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomerMode('EXISTING');
                  setSelectedCustomerId((current) => current || masters.customers[0]?.id || '');
                }}
                disabled={masters.customers.length === 0}
                className={`min-h-10 rounded-lg px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  customerMode === 'EXISTING'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                CUSTOMER TERDAFTAR
              </button>
            </div>

            {customerMode === 'NEW' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-300">
                  Kode Customer
                  <input
                    required
                    data-autofocus="true"
                    value={bundleForm.code}
                    onChange={(event) =>
                      setBundleForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                    }
                    placeholder="Contoh AIS"
                    className="ops-input mt-1 px-3"
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  Nama Customer
                  <input
                    required
                    value={bundleForm.customerName}
                    onChange={(event) =>
                      setBundleForm((current) => ({ ...current, customerName: event.target.value }))
                    }
                    placeholder="Nama perusahaan / customer"
                    className="ops-input mt-1 px-3"
                  />
                </label>
              </div>
            ) : (
              <label className="mt-4 block text-xs font-bold text-slate-300">
                Customer Terdaftar
                <select
                  required
                  data-autofocus="true"
                  value={selectedCustomerId}
                  onChange={(event) => setSelectedCustomerId(event.target.value)}
                  className="ops-input mt-1 px-3"
                >
                  <option value="">Pilih Customer</option>
                  {masters.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.code} — {customer.name}
                    </option>
                  ))}
                </select>
                {selectedCustomerId ? (
                  <div className="mt-2 rounded-xl border border-blue-900/60 bg-blue-950/20 p-3 font-normal text-blue-200">
                    {masters.customers.find((customer) => customer.id === selectedCustomerId)?.name}
                    <div className="mt-1 text-[10px] text-blue-300/70">
                      Site baru akan otomatis terkunci ke Customer ini.
                    </div>
                  </div>
                ) : null}
              </label>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
                {customerMode === 'EXISTING' ? 'SITE BARU' : 'SITE WAJIB'}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Tidak perlu membuat kode Site. Sistem membuat key internal otomatis.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-300 sm:col-span-3">
                Nama Site
                <input
                  required
                  value={bundleForm.siteName}
                  onChange={(event) =>
                    setBundleForm((current) => ({ ...current, siteName: event.target.value }))
                  }
                  placeholder="Contoh Rest Area KM 130"
                  className="ops-input mt-1 px-3"
                />
              </label>
              <label className="text-xs font-bold text-slate-300">
                Capacity Personel
                <input
                  required
                  type="number"
                  min="1"
                  value={bundleForm.personnelCapacity}
                  onChange={(event) =>
                    setBundleForm((current) => ({
                      ...current,
                      personnelCapacity: Number(event.target.value),
                    }))
                  }
                  className="ops-input mt-1 px-3"
                />
              </label>
              <label className="text-xs font-bold text-slate-300">
                Target Ronde / Shift
                <input
                  required
                  type="number"
                  min="1"
                  max="20"
                  value={bundleForm.targetRoundsPerShift}
                  onChange={(event) =>
                    setBundleForm((current) => ({
                      ...current,
                      targetRoundsPerShift: Number(event.target.value),
                    }))
                  }
                  className="ops-input mt-1 px-3"
                />
              </label>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                Timezone
                <div className="mt-1 font-bold text-slate-200">Asia/Jakarta</div>
              </div>
            </div>
          </section>
        </form>
      </OpsDialog>

      <OpsDialog
        isOpen={!!editingCustomer}
        onClose={() => setEditingCustomer(null)}
        title="EDIT CUSTOMER"
        description={editingCustomer ? `Kode Customer: ${editingCustomer.code}` : undefined}
        tone="info"
        size="md"
        busy={submitting}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditingCustomer(null)} disabled={submitting} className="ops-btn-secondary px-4">
              BATAL
            </button>
            <button type="submit" form="edit-customer-form" disabled={submitting} className="ops-btn-primary px-4">
              {submitting ? 'MENYIMPAN...' : 'SIMPAN'}
            </button>
          </div>
        }
      >
        <form id="edit-customer-form" onSubmit={submitEditCustomer} className="space-y-4">
          <label className="block text-xs font-bold text-slate-300">
            Nama Customer
            <input
              required
              data-autofocus="true"
              value={customerEditForm.name}
              onChange={(event) =>
                setCustomerEditForm((current) => ({ ...current, name: event.target.value }))
              }
              className="ops-input mt-1 px-3"
            />
          </label>
          <label className="block text-xs font-bold text-slate-300">
            Status
            <select
              value={customerEditForm.status}
              onChange={(event) =>
                setCustomerEditForm((current) => ({
                  ...current,
                  status: event.target.value as Customer['status'],
                }))
              }
              className="ops-input mt-1 px-3"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>
        </form>
      </OpsDialog>

      <OpsDialog
        isOpen={!!addingSiteCustomer}
        onClose={() => setAddingSiteCustomer(null)}
        title="TAMBAH SITE"
        description={addingSiteCustomer ? `Customer: ${addingSiteCustomer.name}` : undefined}
        tone="success"
        size="md"
        busy={submitting}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAddingSiteCustomer(null)} disabled={submitting} className="ops-btn-secondary px-4">
              BATAL
            </button>
            <button type="submit" form="add-site-form" disabled={submitting} className="ops-btn-primary px-4">
              {submitting ? 'MENYIMPAN...' : 'TAMBAH SITE'}
            </button>
          </div>
        }
      >
        <form id="add-site-form" onSubmit={submitAddSite} className="space-y-4">
          <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-5 text-slate-400">
            Kode Site tidak perlu diisi. Sistem akan membuat key internal secara otomatis dan mengunci Site ke Customer ini.
          </p>
          <label className="block text-xs font-bold text-slate-300">
            Nama Site
            <input
              required
              data-autofocus="true"
              value={siteForm.name}
              onChange={(event) => setSiteForm((current) => ({ ...current, name: event.target.value }))}
              className="ops-input mt-1 px-3"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-300">
              Capacity Personel
              <input
                required
                type="number"
                min="1"
                value={siteForm.personnelCapacity}
                onChange={(event) =>
                  setSiteForm((current) => ({
                    ...current,
                    personnelCapacity: Number(event.target.value),
                  }))
                }
                className="ops-input mt-1 px-3"
              />
            </label>
            <label className="text-xs font-bold text-slate-300">
              Target Ronde / Shift
              <input
                required
                type="number"
                min="1"
                max="20"
                value={siteForm.targetRoundsPerShift}
                onChange={(event) =>
                  setSiteForm((current) => ({
                    ...current,
                    targetRoundsPerShift: Number(event.target.value),
                  }))
                }
                className="ops-input mt-1 px-3"
              />
            </label>
          </div>
        </form>
      </OpsDialog>

      <OpsDialog
        isOpen={!!editingSite}
        onClose={() => setEditingSite(null)}
        title="EDIT SITE"
        description="Perubahan berlaku pada konfigurasi operasional Site. Key internal Site tidak dapat diedit."
        tone="info"
        size="md"
        busy={submitting}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditingSite(null)} disabled={submitting} className="ops-btn-secondary px-4">
              BATAL
            </button>
            <button type="submit" form="edit-site-form" disabled={submitting} className="ops-btn-primary px-4">
              {submitting ? 'MENYIMPAN...' : 'SIMPAN'}
            </button>
          </div>
        }
      >
        <form id="edit-site-form" onSubmit={submitEditSite} className="space-y-4">
          <label className="block text-xs font-bold text-slate-300">
            Nama Site
            <input
              required
              data-autofocus="true"
              value={siteForm.name}
              onChange={(event) => setSiteForm((current) => ({ ...current, name: event.target.value }))}
              className="ops-input mt-1 px-3"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-300">
              Capacity Personel
              <input
                required
                type="number"
                min="1"
                value={siteForm.personnelCapacity}
                onChange={(event) =>
                  setSiteForm((current) => ({
                    ...current,
                    personnelCapacity: Number(event.target.value),
                  }))
                }
                className="ops-input mt-1 px-3"
              />
            </label>
            <label className="text-xs font-bold text-slate-300">
              Target Ronde / Shift
              <input
                required
                type="number"
                min="1"
                max="20"
                value={siteForm.targetRoundsPerShift}
                onChange={(event) =>
                  setSiteForm((current) => ({
                    ...current,
                    targetRoundsPerShift: Number(event.target.value),
                  }))
                }
                className="ops-input mt-1 px-3"
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-300">
            Status Site
            <select
              value={siteForm.status}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  status: event.target.value as Site['status'],
                }))
              }
              className="ops-input mt-1 px-3"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>
        </form>
      </OpsDialog>

      <OpsDangerConfirmDialog
        isOpen={!!deleteSiteTarget}
        onCancel={() => setDeleteSiteTarget(null)}
        onConfirm={deleteSite}
        title="HAPUS SITE"
        message="Hapus hanya diperbolehkan untuk Site yang belum memiliki dependency operasional dan bukan Site terakhir Customer."
        confirmationText={deleteSiteTarget ? `HAPUS ${deleteSiteTarget.name}` : ''}
        entityLabel="nama Site"
        confirmLabel="HAPUS SITE"
      >
        {deleteSiteTarget ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">SITE</div>
            <div className="mt-1 font-black text-white">{deleteSiteTarget.name}</div>
            <div className="mt-2 text-slate-400">
              Capacity {deleteSiteTarget.personnelCapacity} • Target Ronde {deleteSiteTarget.targetRoundsPerShift || 1}
            </div>
          </div>
        ) : null}
      </OpsDangerConfirmDialog>

      <OpsDialog
        isOpen={!!forceTarget}
        onClose={() => {
          setForceTarget(null);
          setReason('');
        }}
        title="FORCE CLOSE SHIFT"
        description="Gunakan hanya untuk penutupan session operasional oleh Admin / Super Admin."
        tone="danger"
        size="md"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setForceTarget(null);
                setReason('');
              }}
              className="ops-btn-secondary px-4"
            >
              BATAL
            </button>
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => void forceClose()}
              className="ops-btn-danger inline-flex items-center justify-center gap-1.5 px-4 disabled:opacity-40"
            >
              <ShieldAlert className="h-4 w-4" />
              FORCE CLOSE
            </button>
          </div>
        }
      >
        {forceTarget ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-950 p-3 text-xs">
              {forceTarget.memberName} ({forceTarget.npk}) • {forceTarget.siteId} • {forceTarget.totalValid}/
              {forceTarget.totalRequired}
            </div>
            <textarea
              data-autofocus="true"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Alasan force close"
              className="ops-input min-h-28 p-3 text-xs"
            />
          </div>
        ) : null}
      </OpsDialog>

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
