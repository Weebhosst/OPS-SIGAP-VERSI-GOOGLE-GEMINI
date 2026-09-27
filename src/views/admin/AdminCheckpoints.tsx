import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  Folder,
  FolderOpen,
  MapPin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Customer, Site } from '../../types/ops';
import {
  OpsDialog,
  OpsNoticeDialog,
  type OpsDialogTone,
} from '../../components/OpsDialog';

interface NewCheckpointRow {
  name: string;
  coordinateMethod: 'MANUAL' | 'GPS';
  latitude: number | '';
  longitude: number | '';
  accuracy: number | null;
  capturedAt: string | null;
  gpsMessage: string | null;
  radiusMeters: number;
}

const emptyCheckpointRow = (): NewCheckpointRow => ({
  name: '',
  coordinateMethod: 'MANUAL',
  latitude: '',
  longitude: '',
  accuracy: null,
  capturedAt: null,
  gpsMessage: null,
  radiusMeters: 15,
});

export const AdminCheckpoints: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [qrFilter, setQrFilter] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSiteId, setAddSiteId] = useState('');
  const [newRows, setNewRows] = useState<NewCheckpointRow[]>([]);

  const [selectedCp, setSelectedCp] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLat, setEditLat] = useState(0);
  const [editLng, setEditLng] = useState(0);
  const [editRadius, setEditRadius] = useState(15);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; tone: OpsDialogTone } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [checkpointRes, masters] = await Promise.all([api.getAdminCheckpoints(), api.getMasters()]);
      setCheckpoints(checkpointRes.checkpoints);
      setSites(masters.sites);
      setCustomers(masters.customers);
    } catch (error) {
      setNotice({
        title: 'Titik QR Gagal Dimuat',
        message: error instanceof Error ? error.message : 'Gagal memuat data checkpoint.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers
      .map((customer) => {
        const customerMatches =
          !query ||
          customer.name.toLowerCase().includes(query) ||
          customer.code.toLowerCase().includes(query);

        const customerSites = sites
          .filter((site) => site.customerId === customer.id)
          .map((site) => {
            const siteMatches = !query || site.name.toLowerCase().includes(query);
            const siteCheckpoints = checkpoints.filter((checkpoint) => {
              if (checkpoint.siteId !== site.id) return false;
              if (statusFilter && checkpoint.status !== statusFilter) return false;
              if (qrFilter && checkpoint.qrStatus !== qrFilter) return false;
              if (!query || customerMatches || siteMatches) return true;
              return [checkpoint.code, checkpoint.name]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query);
            });
            return { site, checkpoints: siteCheckpoints };
          })
          .filter(({ site, checkpoints }) => {
            if (!query && !statusFilter && !qrFilter) return true;
            return site.name.toLowerCase().includes(query) || checkpoints.length > 0;
          });

        const total = customerSites.reduce((sum, item) => sum + item.checkpoints.length, 0);
        return { customer, customerSites, total };
      })
      .filter(({ customer, customerSites, total }) => {
        if (!query && !statusFilter && !qrFilter) return customerSites.length > 0;
        return customer.name.toLowerCase().includes(query) || customer.code.toLowerCase().includes(query) || total > 0;
      });
  }, [customers, sites, checkpoints, search, statusFilter, qrFilter]);

  const openAddForSite = (siteId?: string) => {
    const selectedSiteId = siteId || sites.find((site) => site.status === 'ACTIVE')?.id || sites[0]?.id || '';
    setAddSiteId(selectedSiteId);
    setNewRows([emptyCheckpointRow()]);
    setShowAddModal(true);
  };

  const updateNewRow = (index: number, updates: Partial<NewCheckpointRow>) => {
    setNewRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...updates } : row)),
    );
  };

  const captureGps = (index: number) => {
    if (!navigator.geolocation) {
      updateNewRow(index, { gpsMessage: 'GPS tidak tersedia pada browser/perangkat ini.' });
      return;
    }

    updateNewRow(index, {
      coordinateMethod: 'GPS',
      gpsMessage: 'Mengambil GPS saat ini...',
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy);
        updateNewRow(index, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          gpsMessage:
            accuracy > 25
              ? 'AKURASI GPS RENDAH. Pindah ke area terbuka lalu ambil GPS kembali.'
              : 'GPS berhasil diambil.',
        });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'Izin lokasi ditolak. Aktifkan permission GPS browser.',
          2: 'Posisi GPS tidak tersedia. Coba di area terbuka.',
          3: 'Pengambilan GPS timeout. Silakan coba lagi.',
        };
        updateNewRow(index, {
          gpsMessage: messages[error.code] || 'Gagal mengambil koordinat GPS.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const handleCreateCheckpoint = async (index: number) => {
    const row = newRows[index];
    if (!addSiteId || !row?.name.trim() || row.latitude === '' || row.longitude === '') {
      setNotice({
        title: 'Data Checkpoint Belum Lengkap',
        message: 'Site, nama titik, latitude, dan longitude wajib diisi.',
        tone: 'warning',
      });
      return;
    }

    if (row.coordinateMethod === 'GPS' && (row.accuracy === null || row.accuracy > 25)) {
      setNotice({
        title: 'Akurasi GPS Belum Memadai',
        message: 'Ambil GPS kembali sampai akurasi 25 meter atau lebih baik, atau gunakan Input Manual.',
        tone: 'warning',
      });
      return;
    }

    setSaving(true);
    try {
      const existingAtSite = checkpoints.filter((checkpoint) => checkpoint.siteId === addSiteId).length;
      const alreadySavedInBatch = newRows
        .slice(0, index)
        .filter((entry) => entry.name.trim() === '').length;
      const sequence = existingAtSite + index + 1 - alreadySavedInBatch;

      await api.createAdminCheckpoint({
        siteId: addSiteId,
        code: `CP${String(sequence).padStart(2, '0')}`,
        ...row,
      });

      setNewRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
      await loadData();

      if (newRows.length <= 1) setShowAddModal(false);
      setNotice({
        title: 'Checkpoint Disimpan',
        message: `Checkpoint CP${String(sequence).padStart(2, '0')} berhasil dibuat. Generate Token lalu QR setelah data lokasi dipastikan benar.`,
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Simpan Checkpoint Gagal',
        message: error instanceof Error ? error.message : 'Checkpoint gagal disimpan.',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (checkpoint: any) => {
    setSelectedCp(checkpoint);
    setEditName(checkpoint.name);
    setEditLat(checkpoint.latitude);
    setEditLng(checkpoint.longitude);
    setEditRadius(checkpoint.radiusMeters);
    setShowEditModal(true);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCp) return;
    setSaving(true);
    try {
      await api.updateAdminCheckpoint(selectedCp.id, {
        name: editName,
        latitude: editLat,
        longitude: editLng,
        radiusMeters: editRadius,
      });
      setShowEditModal(false);
      await loadData();
      setNotice({
        title: 'Checkpoint Diperbarui',
        message: `${selectedCp.code} berhasil diperbarui.`,
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Edit Checkpoint Gagal',
        message: error instanceof Error ? error.message : 'Checkpoint gagal diperbarui.',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const generateToken = async (checkpoint: any) => {
    try {
      await api.generateCheckpointToken(checkpoint.id);
      await loadData();
      setNotice({
        title: 'Token Dibuat',
        message: `Secure token ${checkpoint.code} berhasil dibuat. Lanjutkan dengan Generate QR.`,
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Generate Token Gagal',
        message: error instanceof Error ? error.message : 'Token gagal dibuat.',
        tone: 'danger',
      });
    }
  };

  const generateQr = async (checkpoint: any) => {
    try {
      await api.generateCheckpointQr(checkpoint.id);
      await loadData();
      setNotice({
        title: 'QR Aktif',
        message: `QR ${checkpoint.code} aktif dan terikat ke checkpoint serta secure token.`,
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        title: 'Generate QR Gagal',
        message: error instanceof Error ? error.message : 'QR gagal dibuat.',
        tone: 'danger',
      });
    }
  };

  const openQr = (checkpoint: any) => {
    setSelectedCp(checkpoint);
    setShowPrintModal(true);
  };

  const downloadQrCard = async (checkpoint: any) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(
      JSON.stringify({ checkpointId: checkpoint.id, token: checkpoint.qrToken }),
    )}`;

    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = qrUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('QR image gagal dimuat'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 900;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas tidak tersedia');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#0f172a';
      context.textAlign = 'center';
      context.font = 'bold 42px sans-serif';
      context.fillText('OPS SIGAP', 360, 70);
      context.font = 'bold 24px sans-serif';
      context.fillText(`${checkpoint.siteId} • ${checkpoint.code}`, 360, 115);
      context.drawImage(image, 110, 155, 500, 500);
      context.font = 'bold 25px sans-serif';
      context.fillText(checkpoint.name, 360, 710);
      context.font = '22px sans-serif';
      context.fillText(`Radius ${checkpoint.radiusMeters} meter`, 360, 755);
      context.font = '18px sans-serif';
      context.fillText('SCAN DI LOKASI — GPS & FOTO WAJIB', 360, 820);

      const link = document.createElement('a');
      link.download = `OPS-SIGAP-${checkpoint.siteId}-${checkpoint.code}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      setNotice({
        title: 'Download QR Gagal',
        message: error instanceof Error ? error.message : 'Kartu QR gagal diunduh.',
        tone: 'danger',
      });
    }
  };

  const selectedSite = sites.find((site) => site.id === addSiteId);
  const selectedCustomer = customers.find((customer) => customer.id === selectedSite?.customerId);

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
              <h1 className="truncate text-base font-black text-white">TITIK QR</h1>
              <p className="text-[11px] text-slate-400">Customer → Site → Checkpoint</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAddForSite()}
            disabled={sites.length === 0}
            className="ops-btn-primary inline-flex min-h-10 shrink-0 items-center gap-1.5 px-3 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            TAMBAH CHECKPOINT
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <div className="grid gap-2 text-xs md:grid-cols-3">
            <label className="relative">
              <span className="font-bold text-slate-300">Cari Titik QR</span>
              <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Customer, Site, CP01, nama titik"
                className="ops-input mt-1 py-2 pl-9 pr-3"
              />
            </label>
            <label>
              <span className="font-bold text-slate-300">Status Checkpoint</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ops-input mt-1 px-3">
                <option value="">Semua Status</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </label>
            <label>
              <span className="font-bold text-slate-300">Status QR</span>
              <select value={qrFilter} onChange={(event) => setQrFilter(event.target.value)} className="ops-input mt-1 px-3">
                <option value="">Semua QR</option>
                <option value="ACTIVE">QR ACTIVE</option>
                <option value="INACTIVE">QR INACTIVE</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black text-white">MASTER TITIK QR</div>
              <div className="mt-0.5 text-[11px] text-slate-500">Konfigurasi Site tidak diedit dari halaman ini.</div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-black text-slate-300">
              {checkpoints.length} CHECKPOINT
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            Memuat Titik QR...
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(({ customer, customerSites, total }) => {
              const customerExpanded = !!expandedCustomers[customer.id];
              return (
                <article key={customer.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setExpandedCustomers((current) => ({ ...current, [customer.id]: !current[customer.id] }))}
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
                        {customer.code} • {customerSites.length} Site • {total} Checkpoint
                      </div>
                    </div>
                    {customerExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {customerExpanded ? (
                    <div className="space-y-2 border-t border-slate-800 bg-slate-950/30 p-3">
                      {customerSites.map(({ site, checkpoints: siteCheckpoints }) => {
                        const siteExpanded = !!expandedSites[site.id];
                        const activeQr = siteCheckpoints.filter((checkpoint) => checkpoint.qrStatus === 'ACTIVE').length;
                        return (
                          <div key={site.id} className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a]">
                            <div className="flex items-stretch">
                              <button
                                type="button"
                                onClick={() => setExpandedSites((current) => ({ ...current, [site.id]: !current[site.id] }))}
                                aria-expanded={siteExpanded}
                                className="flex min-h-14 flex-1 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-800/50"
                              >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-900/60 bg-emerald-950/30 text-emerald-300">
                                  {siteExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300">SITE</div>
                                  <div className="truncate text-xs font-black text-white">{site.name}</div>
                                  <div className="mt-0.5 text-[10px] text-slate-500">
                                    {siteCheckpoints.length} Checkpoint • {activeQr} QR Active
                                  </div>
                                </div>
                                <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-slate-300">{siteCheckpoints.length}</span>
                                {siteExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <div className="flex shrink-0 items-center border-l border-slate-800 px-2">
                                <button
                                  type="button"
                                  onClick={() => openAddForSite(site.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-blue-300 transition hover:bg-blue-950/50"
                                  title={`Tambah checkpoint ke ${site.name}`}
                                  aria-label={`Tambah checkpoint ke ${site.name}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {siteExpanded ? (
                              <div className="space-y-2 border-t border-slate-800 p-2.5">
                                {siteCheckpoints.length > 0 ? (
                                  siteCheckpoints.map((checkpoint) => (
                                    <div key={checkpoint.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-md border border-blue-900/70 bg-blue-950/40 px-2 py-1 font-mono text-[10px] font-black text-blue-300">
                                              {checkpoint.code}
                                            </span>
                                            <span className="text-sm font-black text-white">{checkpoint.name}</span>
                                            <span className={checkpoint.status === 'ACTIVE' ? 'ops-badge-success' : 'ops-badge-neutral'}>
                                              {checkpoint.status}
                                            </span>
                                            <span className={checkpoint.qrStatus === 'ACTIVE' ? 'rounded-full border border-blue-800 bg-blue-950/50 px-2 py-0.5 text-[9px] font-black text-blue-300' : 'ops-badge-neutral'}>
                                              QR {checkpoint.qrStatus}
                                            </span>
                                          </div>
                                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                                            <span>Radius {checkpoint.radiusMeters} m</span>
                                            <span>{checkpoint.coordinateMethod || 'MANUAL'}</span>
                                            <span className="font-mono">
                                              {Number(checkpoint.latitude).toFixed(6)}, {Number(checkpoint.longitude).toFixed(6)}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                          <button
                                            type="button"
                                            disabled={checkpoint.qrStatus !== 'ACTIVE'}
                                            onClick={() => openQr(checkpoint)}
                                            className="ops-btn-secondary inline-flex min-h-9 items-center justify-center gap-1.5 px-3 disabled:opacity-40"
                                          >
                                            <Printer className="h-3.5 w-3.5" />
                                            VIEW QR
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openEdit(checkpoint)}
                                            className="ops-btn-secondary inline-flex min-h-9 items-center justify-center gap-1.5 px-3"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                            EDIT
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void generateToken(checkpoint)}
                                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-800/70 bg-amber-950/30 px-3 text-xs font-black text-amber-300"
                                          >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                            TOKEN
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!checkpoint.qrToken}
                                            onClick={() => void generateQr(checkpoint)}
                                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-blue-800/70 bg-blue-950/30 px-3 text-xs font-black text-blue-300 disabled:opacity-40"
                                          >
                                            <QrCode className="h-3.5 w-3.5" />
                                            GENERATE QR
                                          </button>
                                          <button
                                            type="button"
                                            disabled={checkpoint.qrStatus !== 'ACTIVE'}
                                            onClick={() => void downloadQrCard(checkpoint)}
                                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-800/70 bg-emerald-950/30 px-3 text-xs font-black text-emerald-300 disabled:opacity-40"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                            JPG
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                                    Belum ada checkpoint pada Site ini.
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

            {groups.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                <QrCode className="mx-auto h-7 w-7 text-slate-600" />
                <div className="mt-2 text-sm font-bold text-slate-300">Titik QR tidak ditemukan</div>
                <div className="mt-1 text-xs text-slate-500">Ubah pencarian atau filter status.</div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      <OpsDialog
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="TAMBAH CHECKPOINT"
        description="Checkpoint dibuat pada Site terpilih. Target ronde dan konfigurasi Site tidak diubah dari sini."
        tone="info"
        size="xl"
        busy={saving}
        footer={
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setShowAddModal(false)} className="ops-btn-secondary px-4">TUTUP</button>
            <button
              type="button"
              onClick={() => setNewRows((rows) => [...rows, emptyCheckpointRow()])}
              className="ops-btn-primary inline-flex items-center gap-1.5 px-4"
            >
              <Plus className="h-4 w-4" />
              ADD ROW
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-300">
            Site Tujuan
            <select
              value={addSiteId}
              onChange={(event) => setAddSiteId(event.target.value)}
              className="ops-input mt-1 px-3"
            >
              {customers.map((customer) => (
                <optgroup key={customer.id} label={`${customer.code} — ${customer.name}`}>
                  {sites.filter((site) => site.customerId === customer.id && site.status === 'ACTIVE').map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {selectedSite ? (
            <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3 text-xs text-blue-200">
              <div className="font-black">{selectedCustomer?.name || 'Customer'}</div>
              <div className="mt-1">{selectedSite.name} • {checkpoints.filter((checkpoint) => checkpoint.siteId === selectedSite.id).length} checkpoint existing</div>
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            {newRows.map((row, index) => (
              <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
                <legend className="px-2 font-black text-blue-300">CHECKPOINT BARU #{index + 1}</legend>

                <label className="block font-bold text-slate-300">
                  Nama Titik
                  <input
                    required
                    value={row.name}
                    onChange={(event) => updateNewRow(index, { name: event.target.value })}
                    className="ops-input mt-1 px-3"
                  />
                </label>

                <div>
                  <span className="font-bold text-slate-300">Metode Koordinat</span>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateNewRow(index, { coordinateMethod: 'MANUAL', accuracy: null, capturedAt: null, gpsMessage: null })}
                      className={row.coordinateMethod === 'MANUAL' ? 'ops-btn-primary px-3' : 'ops-btn-secondary px-3'}
                    >
                      INPUT MANUAL
                    </button>
                    <button
                      type="button"
                      onClick={() => captureGps(index)}
                      className={row.coordinateMethod === 'GPS' ? 'ops-btn-primary inline-flex items-center justify-center gap-1.5 px-3' : 'ops-btn-secondary inline-flex items-center justify-center gap-1.5 px-3'}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      AMBIL GPS
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="font-bold text-slate-300">
                    Latitude
                    <input
                      required
                      type="number"
                      step="any"
                      value={row.latitude}
                      readOnly={row.coordinateMethod === 'GPS'}
                      onChange={(event) => updateNewRow(index, { latitude: Number(event.target.value) })}
                      className="ops-input mt-1 px-3 font-mono"
                    />
                  </label>
                  <label className="font-bold text-slate-300">
                    Longitude
                    <input
                      required
                      type="number"
                      step="any"
                      value={row.longitude}
                      readOnly={row.coordinateMethod === 'GPS'}
                      onChange={(event) => updateNewRow(index, { longitude: Number(event.target.value) })}
                      className="ops-input mt-1 px-3 font-mono"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-400">
                    Akurasi GPS
                    <div className="mt-1 font-bold text-slate-200">
                      {row.accuracy !== null ? `± ${row.accuracy} m` : 'Manual'}
                    </div>
                  </div>
                  <label className="font-bold text-slate-300">
                    Radius Geofence
                    <input
                      required
                      type="number"
                      min="1"
                      value={row.radiusMeters}
                      onChange={(event) => updateNewRow(index, { radiusMeters: Number(event.target.value) })}
                      className="ops-input mt-1 px-3"
                    />
                  </label>
                </div>

                {row.gpsMessage ? (
                  <div className={`rounded-xl p-3 leading-5 ${
                    row.accuracy !== null && row.accuracy > 25
                      ? 'border border-amber-900/60 bg-amber-950/30 text-amber-200'
                      : 'border border-emerald-900/60 bg-emerald-950/30 text-emerald-200'
                  }`}>
                    {row.gpsMessage}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                    disabled={newRows.length <= 1}
                    className="ops-btn-secondary px-3 disabled:opacity-30"
                  >
                    HAPUS ROW
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreateCheckpoint(index)}
                    className="ops-btn-primary px-3 disabled:opacity-40"
                  >
                    SIMPAN CHECKPOINT
                  </button>
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      </OpsDialog>

      <OpsDialog
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={selectedCp ? `EDIT CHECKPOINT ${selectedCp.code}` : 'EDIT CHECKPOINT'}
        description="Edit nama titik, koordinat, dan radius checkpoint. Konfigurasi Site tetap terpisah."
        tone="info"
        size="md"
        busy={saving}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShowEditModal(false)} className="ops-btn-secondary px-4">BATAL</button>
            <button type="submit" form="checkpoint-edit-form" disabled={saving} className="ops-btn-primary px-4">
              {saving ? 'MENYIMPAN...' : 'SIMPAN'}
            </button>
          </div>
        }
      >
        <form id="checkpoint-edit-form" onSubmit={saveEdit} className="space-y-4">
          <label className="block text-xs font-bold text-slate-300">
            Nama Titik
            <input data-autofocus="true" required value={editName} onChange={(event) => setEditName(event.target.value)} className="ops-input mt-1 px-3" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-slate-300">
              Latitude
              <input required type="number" step="any" value={editLat} onChange={(event) => setEditLat(Number(event.target.value))} className="ops-input mt-1 px-3 font-mono" />
            </label>
            <label className="text-xs font-bold text-slate-300">
              Longitude
              <input required type="number" step="any" value={editLng} onChange={(event) => setEditLng(Number(event.target.value))} className="ops-input mt-1 px-3 font-mono" />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-300">
            Radius Geofence (meter)
            <input required type="number" min="1" value={editRadius} onChange={(event) => setEditRadius(Number(event.target.value))} className="ops-input mt-1 px-3" />
          </label>
        </form>
      </OpsDialog>

      <OpsDialog
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="KARTU CHECKPOINT RESMI"
        description={selectedCp ? `${selectedCp.siteId} • ${selectedCp.code}` : undefined}
        tone="neutral"
        size="md"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShowPrintModal(false)} className="ops-btn-secondary px-4">TUTUP</button>
            <button type="button" onClick={() => selectedCp && void downloadQrCard(selectedCp)} className="ops-btn-primary inline-flex items-center justify-center gap-1.5 px-4">
              <Download className="h-4 w-4" />
              DOWNLOAD JPG
            </button>
          </div>
        }
      >
        {selectedCp ? (
          <div className="mx-auto max-w-sm rounded-2xl border-4 border-slate-900 bg-white p-5 text-slate-900">
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
              <div>
                <div className="text-sm font-black">OPS SIGAP</div>
                <div className="text-[10px] font-bold text-slate-600">
                  {customers.find((customer) => customer.id === sites.find((site) => site.id === selectedCp.siteId)?.customerId)?.name || 'CUSTOMER'}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-base font-black text-blue-600">{selectedCp.code}</div>
                <div className="font-mono text-[10px] font-bold text-slate-600">RADIUS {selectedCp.radiusMeters}M</div>
              </div>
            </div>
            <div className="flex flex-col items-center py-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(JSON.stringify({ checkpointId: selectedCp.id, token: selectedCp.qrToken }))}`}
                alt={`QR ${selectedCp.code}`}
                className="h-48 w-48 rounded-xl border-2 border-slate-900 p-1"
              />
              <div className="mt-3 text-xs font-black uppercase">{selectedCp.name}</div>
              <div className="mt-1 font-mono text-[10px] text-slate-600">
                GPS {Number(selectedCp.latitude).toFixed(6)}, {Number(selectedCp.longitude).toFixed(6)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-950 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-white">
              SCAN DI LOKASI • GPS & FOTO WAJIB
            </div>
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
