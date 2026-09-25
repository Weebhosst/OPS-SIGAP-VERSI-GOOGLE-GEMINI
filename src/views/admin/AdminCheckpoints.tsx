/**
 * OPS SIGAP — Admin Checkpoint Management
 * Customer → Site → Checkpoint folder workspace
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  FolderOpen,
  MapPin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Checkpoint, Customer, Site } from '../../types/ops';

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

type MasterSite = Site & { activeCount?: number };

export const AdminCheckpoints: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [sites, setSites] = useState<MasterSite[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newSiteId, setNewSiteId] = useState('');
  const [newRows, setNewRows] = useState<NewCheckpointRow[]>([]);

  const [selectedCp, setSelectedCp] = useState<Checkpoint | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLat, setEditLat] = useState(0);
  const [editLng, setEditLng] = useState(0);
  const [editRadius, setEditRadius] = useState(15);
  const [saving, setSaving] = useState(false);

  const loadCheckpoints = async () => {
    setLoading(true);
    try {
      const [checkpointResult, masters] = await Promise.all([api.getAdminCheckpoints(), api.getMasters()]);
      setCheckpoints(checkpointResult.checkpoints);
      setSites(masters.sites);
      setCustomers(masters.customers);
      const firstSite = masters.sites[0];
      setNewSiteId((current) => current && masters.sites.some((site) => site.id === current) ? current : firstSite?.id || '');
      setNewCustomerId((current) => current && masters.customers.some((customer) => customer.id === current)
        ? current
        : firstSite?.customerId || masters.customers[0]?.id || '');
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal memuat data checkpoint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCheckpoints(); }, []);

  const customerName = (customerId: string) =>
    customers.find((customer) => customer.id === customerId)?.name || customerId;

  const checkpointsForSite = (siteId: string) =>
    checkpoints.filter((checkpoint) => checkpoint.siteId === siteId);

  const filteredSites = useMemo(() => sites.filter((site) => {
    if (filterCustomerId && site.customerId !== filterCustomerId) return false;
    if (!search) return true;
    const children = checkpointsForSite(site.id);
    const haystack = [
      customerName(site.customerId),
      site.name,
      site.code || site.id,
      ...children.flatMap((checkpoint) => [checkpoint.code, checkpoint.name]),
    ].join(' ').toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [sites, filterCustomerId, search, checkpoints, customers]);

  const openAddModal = () => {
    const firstSite = sites.find((site) => !filterCustomerId || site.customerId === filterCustomerId) || sites[0];
    setNewCustomerId(firstSite?.customerId || customers[0]?.id || '');
    setNewSiteId(firstSite?.id || '');
    setNewRows([emptyCheckpointRow()]);
    setShowAddModal(true);
  };

  const handleOpenEdit = (checkpoint: Checkpoint) => {
    setSelectedCp(checkpoint);
    setEditName(checkpoint.name);
    setEditLat(checkpoint.latitude);
    setEditLng(checkpoint.longitude);
    setEditRadius(checkpoint.radiusMeters);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCp) return;
    setSaving(true);
    try {
      await api.updateAdminCheckpoint(selectedCp.id, {
        name: editName.trim(),
        latitude: editLat,
        longitude: editLng,
        radiusMeters: editRadius,
      });
      setShowEditModal(false);
      setStatusMsg(`Checkpoint ${selectedCp.code} berhasil diperbarui.`);
      await loadCheckpoints();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal menyimpan checkpoint.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateToken = async (checkpoint: Checkpoint) => {
    try {
      await api.generateCheckpointToken(checkpoint.id);
      setStatusMsg(`Secure token ${checkpoint.code} berhasil dibuat. Lanjutkan dengan Generate QR.`);
      await loadCheckpoints();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal generate token.');
    }
  };

  const handleGenerateQr = async (checkpoint: Checkpoint) => {
    try {
      await api.generateCheckpointQr(checkpoint.id);
      setStatusMsg(`QR Code ${checkpoint.code} aktif dan terikat ke checkpoint.`);
      await loadCheckpoints();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal generate QR Code.');
    }
  };

  const handleOpenPrint = (checkpoint: Checkpoint) => {
    setSelectedCp(checkpoint);
    setShowPrintModal(true);
  };

  const updateNewRow = (index: number, updates: Partial<NewCheckpointRow>) => {
    setNewRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...updates } : row));
  };

  const captureGps = (index: number) => {
    if (!navigator.geolocation) {
      updateNewRow(index, { gpsMessage: 'GPS tidak tersedia pada browser/perangkat ini.' });
      return;
    }
    updateNewRow(index, { coordinateMethod: 'GPS', gpsMessage: 'Mengambil GPS saat ini...' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy);
        updateNewRow(index, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          gpsMessage: accuracy > 25
            ? 'AKURASI GPS RENDAH. Berpindahlah ke area terbuka lalu coba GPS lagi.'
            : 'GPS berhasil diambil.',
        });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'Izin lokasi ditolak. Aktifkan permission GPS browser.',
          2: 'Posisi GPS tidak tersedia. Coba di area terbuka.',
          3: 'Pengambilan GPS timeout. Silakan coba lagi.',
        };
        updateNewRow(index, { gpsMessage: messages[error.code] || 'Gagal mengambil koordinat GPS.' });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const handleCreateCheckpoint = async (index: number) => {
    const row = newRows[index];
    if (!newSiteId) {
      setStatusMsg('Site wajib dipilih.');
      return;
    }
    if (!row?.name.trim() || row.latitude === '' || row.longitude === '') {
      setStatusMsg('Nama dan koordinat checkpoint wajib diisi.');
      return;
    }
    if (row.coordinateMethod === 'GPS' && (row.accuracy === null || row.accuracy > 25)) {
      setStatusMsg('Koordinat GPS dengan akurasi rendah belum dapat disimpan. Coba GPS lagi atau pilih Input Manual.');
      return;
    }

    setSaving(true);
    try {
      const existingCodes = new Set(checkpointsForSite(newSiteId).map((checkpoint) => checkpoint.code));
      let sequence = checkpointsForSite(newSiteId).length + 1;
      let code = `CP${String(sequence).padStart(2, '0')}`;
      while (existingCodes.has(code)) {
        sequence += 1;
        code = `CP${String(sequence).padStart(2, '0')}`;
      }

      await api.createAdminCheckpoint({ siteId: newSiteId, code, ...row });
      setNewRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
      setStatusMsg(`${code} berhasil disimpan. Generate Token lalu Generate QR setelah koordinat diverifikasi.`);
      await loadCheckpoints();
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal membuat checkpoint.');
    } finally {
      setSaving(false);
    }
  };

  const downloadQrCard = async (checkpoint: Checkpoint) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(JSON.stringify({ checkpointId: checkpoint.id, token: checkpoint.qrToken }))}`;
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = qrUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('QR image gagal dimuat.'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 900;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas tidak tersedia.');

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
    } catch (error: any) {
      setStatusMsg(error?.message || 'Gagal mengunduh QR.');
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-24 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" aria-label="Kembali">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-tight text-white">TITIK QR / CHECKPOINT</h1>
              <p className="truncate text-[11px] text-slate-400">Customer → Site → Checkpoint</p>
            </div>
          </div>
          <button type="button" onClick={openAddModal} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500">
            <Plus className="h-4 w-4" /> Tambah Checkpoint
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6 lg:pt-6">
        <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs md:grid-cols-2">
          <label className="relative">
            <span className="font-bold text-slate-300">Search</span>
            <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Site, kode CP, nama titik..." className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-white outline-none focus:border-blue-500" />
          </label>
          <label className="font-bold text-slate-300">
            Customer
            <select value={filterCustomerId} onChange={(event) => setFilterCustomerId(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white">
              <option value="">Semua Customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
        </div>

        {statusMsg ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-800/70 bg-emerald-950/30 p-3 text-xs text-emerald-200" role="status" aria-live="polite">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>{statusMsg}</span></div>
            <button type="button" onClick={() => setStatusMsg(null)} className="rounded-lg px-2 py-1 font-black hover:bg-emerald-900/40">TUTUP</button>
          </div>
        ) : null}

        {loading ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">Memuat checkpoint...</div> : null}

        <section className="space-y-3">
          {filteredSites.map((site) => {
            const siteCheckpoints = checkpointsForSite(site.id).slice().sort((a, b) => a.code.localeCompare(b.code));
            const expanded = !!expandedSites[site.id];

            return (
              <article key={site.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedSites((current) => ({ ...current, [site.id]: !current[site.id] }))} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-800/60 bg-blue-950/30 text-blue-300"><FolderOpen className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">{customerName(site.customerId)}</p>
                      <h2 className="truncate text-sm font-black text-white">{site.name}</h2>
                      <p className="mt-0.5 text-[11px] text-slate-500">{siteCheckpoints.length} checkpoint • {site.status}</p>
                    </div>
                  </div>
                  {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />}
                </button>

                {expanded ? (
                  <div className="space-y-2 border-t border-slate-800 bg-[#08111f]/45 p-3">
                    {siteCheckpoints.length ? siteCheckpoints.map((checkpoint) => (
                      <div key={checkpoint.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-blue-800/60 bg-blue-950/30 px-2 font-mono text-xs font-black text-blue-300">{checkpoint.code}</div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-black text-white">{checkpoint.name}</h3>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
                                <span>Radius {checkpoint.radiusMeters}m</span>
                                <span>Lat {checkpoint.latitude.toFixed(6)}</span>
                                <span>Lng {checkpoint.longitude.toFixed(6)}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className={`rounded-lg px-2 py-1 text-[9px] font-black ${checkpoint.qrToken ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>{checkpoint.qrToken ? 'TOKEN READY' : 'TOKEN BELUM ADA'}</span>
                                <span className={`rounded-lg px-2 py-1 text-[9px] font-black ${checkpoint.qrStatus === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>{checkpoint.qrStatus === 'ACTIVE' ? 'QR READY' : 'QR BELUM AKTIF'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 lg:max-w-[460px] lg:justify-end">
                            <button type="button" disabled={checkpoint.qrStatus !== 'ACTIVE'} onClick={() => handleOpenPrint(checkpoint)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-[10px] font-black text-slate-200 hover:bg-slate-700 disabled:opacity-35"><Printer className="h-3.5 w-3.5" /> VIEW QR</button>
                            <button type="button" onClick={() => handleOpenEdit(checkpoint)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-[10px] font-black text-slate-200 hover:bg-slate-700"><Edit2 className="h-3.5 w-3.5" /> EDIT</button>
                            <button type="button" onClick={() => void handleGenerateToken(checkpoint)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-900/70 bg-amber-950/30 px-3 text-[10px] font-black text-amber-300 hover:bg-amber-900/40"><RefreshCw className="h-3.5 w-3.5" /> GENERATE TOKEN</button>
                            <button type="button" disabled={!checkpoint.qrToken} onClick={() => void handleGenerateQr(checkpoint)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-900/70 bg-blue-950/30 px-3 text-[10px] font-black text-blue-300 hover:bg-blue-900/40 disabled:opacity-35"><QrCode className="h-3.5 w-3.5" /> GENERATE QR</button>
                            <button type="button" disabled={checkpoint.qrStatus !== 'ACTIVE'} onClick={() => void downloadQrCard(checkpoint)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 text-[10px] font-black text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-35"><Download className="h-3.5 w-3.5" /> JPG</button>
                          </div>
                        </div>
                      </div>
                    )) : <div className="p-5 text-center text-xs text-slate-500">Belum ada checkpoint pada Site ini.</div>}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!loading && filteredSites.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">Tidak ada Site sesuai filter.</div> : null}
        </section>
      </main>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="checkpoint-create-title">
            <header className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-[#08111f]/95 p-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Titik QR</p><h3 id="checkpoint-create-title" className="mt-1 text-base font-black text-white">Tambah Checkpoint</h3></div>
              <button type="button" onClick={() => setShowAddModal(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800" aria-label="Tutup tambah checkpoint">✕</button>
            </header>

            <div className="space-y-4 overflow-y-auto p-5 text-xs">
              <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:grid-cols-2">
                <label className="font-bold text-slate-300">Customer<select value={newCustomerId} onChange={(event) => { const customerId = event.target.value; setNewCustomerId(customerId); setNewSiteId(sites.find((site) => site.customerId === customerId)?.id || ''); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                <label className="font-bold text-slate-300">Site<select required value={newSiteId} onChange={(event) => setNewSiteId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white">{sites.filter((site) => site.customerId === newCustomerId).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div><p className="font-black text-white">Data Checkpoint</p><p className="mt-1 text-[10px] text-slate-500">Kode CP dibuat otomatis berurutan pada Site.</p></div>
                <button type="button" onClick={() => setNewRows((rows) => [...rows, emptyCheckpointRow()])} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 font-black text-white hover:bg-blue-500"><Plus className="h-4 w-4" /> ADD ROW</button>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {newRows.map((row, index) => (
                  <fieldset key={index} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <legend className="px-2 font-black text-blue-300">CHECKPOINT BARU #{index + 1}</legend>
                    <label className="block font-semibold text-slate-300">Nama Titik<input required value={row.name} onChange={(event) => updateNewRow(index, { name: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 font-normal text-white" /></label>
                    <div><span className="font-semibold text-slate-300">Metode Koordinat</span><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" onClick={() => updateNewRow(index, { coordinateMethod: 'MANUAL', accuracy: null, capturedAt: null, gpsMessage: null })} className={`min-h-10 rounded-xl font-black ${row.coordinateMethod === 'MANUAL' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>INPUT MANUAL</button><button type="button" onClick={() => captureGps(index)} className={`min-h-10 rounded-xl font-black ${row.coordinateMethod === 'GPS' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}><MapPin className="mr-1 inline h-4 w-4" />AMBIL GPS</button></div></div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="font-semibold text-slate-300">Latitude<input required type="number" step="any" value={row.latitude} readOnly={row.coordinateMethod === 'GPS'} onChange={(event) => updateNewRow(index, { latitude: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 font-mono font-normal text-white" /></label>
                      <label className="font-semibold text-slate-300">Longitude<input required type="number" step="any" value={row.longitude} readOnly={row.coordinateMethod === 'GPS'} onChange={(event) => updateNewRow(index, { longitude: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 font-mono font-normal text-white" /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="font-semibold text-slate-300">Akurasi GPS</span><div className={`mt-1 min-h-10 rounded-xl border p-2 ${row.accuracy !== null && row.accuracy > 25 ? 'border-amber-700 bg-amber-950 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-400'}`}>{row.accuracy !== null ? `± ${row.accuracy} meter` : 'Manual / belum capture'}</div></div>
                      <label className="font-semibold text-slate-300">Radius (meter)<input required type="number" min="1" value={row.radiusMeters} onChange={(event) => updateNewRow(index, { radiusMeters: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 font-normal text-white" /></label>
                    </div>
                    {row.gpsMessage ? <div className={`rounded-xl p-2 ${row.accuracy !== null && row.accuracy > 25 ? 'bg-amber-950 text-amber-200' : 'bg-emerald-950 text-emerald-200'}`}>{row.gpsMessage}</div> : null}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setNewRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="min-h-10 rounded-xl border border-slate-700 bg-slate-800 font-black text-slate-300">HAPUS ROW</button>
                      <button type="button" disabled={saving} onClick={() => void handleCreateCheckpoint(index)} className="min-h-10 rounded-xl bg-emerald-700 font-black text-white disabled:opacity-40">SIMPAN CHECKPOINT</button>
                    </div>
                  </fieldset>
                ))}
              </div>

              {newRows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">Semua row sudah disimpan. Tambahkan row baru atau tutup form.</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && selectedCp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog w-full max-w-md overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="checkpoint-edit-title">
            <header className="flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300">Edit Checkpoint</p><h3 id="checkpoint-edit-title" className="mt-1 font-black text-white">{selectedCp.code} • {selectedCp.name}</h3></div><button type="button" onClick={() => setShowEditModal(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-slate-400" aria-label="Tutup edit checkpoint">✕</button></header>
            <form onSubmit={handleSaveEdit} className="space-y-4 p-5 text-xs">
              <label className="block font-bold text-slate-300">Nama Lokasi<input required value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="font-bold text-slate-300">Latitude<input type="number" step="any" required value={editLat} onChange={(event) => setEditLat(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-mono font-normal text-white" /></label>
                <label className="font-bold text-slate-300">Longitude<input type="number" step="any" required value={editLng} onChange={(event) => setEditLng(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-mono font-normal text-white" /></label>
              </div>
              <label className="block font-bold text-slate-300">Radius Geofence<input type="number" min="1" max="100" required value={editRadius} onChange={(event) => setEditRadius(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 font-normal text-white" /></label>
              <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-blue-600 font-black text-white hover:bg-blue-500 disabled:opacity-40">{saving ? 'MENYIMPAN...' : 'SIMPAN PERUBAHAN'}</button>
            </form>
          </div>
        </div>
      ) : null}

      {showPrintModal && selectedCp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="checkpoint-qr-title">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2"><span id="checkpoint-qr-title" className="text-xs font-bold uppercase tracking-wider text-blue-600">Kartu Checkpoint Resmi</span><button type="button" onClick={() => setShowPrintModal(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Tutup QR">✕</button></div>
            <div id="printable-card" className="space-y-3 rounded-2xl border-4 border-slate-900 bg-white p-5">
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2"><div className="text-left"><div className="text-sm font-black text-slate-950">OPS SIGAP</div><div className="text-[10px] font-bold text-slate-600">{customerName(sites.find((site) => site.id === selectedCp.siteId)?.customerId || '')}</div></div><div className="text-right"><div className="font-mono text-base font-black text-blue-600">{selectedCp.code}</div><div className="font-mono text-[10px] font-bold text-slate-600">RADIUS {selectedCp.radiusMeters}M</div></div></div>
              <div className="flex flex-col items-center justify-center py-2"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify({ checkpointId: selectedCp.id, token: selectedCp.qrToken }))}`} alt={`QR ${selectedCp.code}`} className="mx-auto h-44 w-44 rounded-xl border-2 border-slate-900 p-1" /><span className="mt-2 font-mono text-[10px] font-bold text-slate-700">{selectedCp.siteId} • {selectedCp.code}</span></div>
              <div className="border-t-2 border-slate-900 pt-2 text-left"><div className="text-xs font-bold uppercase text-slate-950">{selectedCp.name}</div><div className="font-mono text-[10px] text-slate-600">GPS: {selectedCp.latitude.toFixed(6)}, {selectedCp.longitude.toFixed(6)}</div></div>
              <div className="rounded-lg bg-slate-950 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">SCAN DI LOKASI — GPS & FOTO WAJIB</div>
            </div>
            <div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => window.print()} className="min-h-10 rounded-xl bg-slate-900 text-xs font-bold text-white"><Printer className="mr-1 inline h-4 w-4" />PRINT</button><button type="button" onClick={() => void downloadQrCard(selectedCp)} className="min-h-10 rounded-xl bg-blue-600 text-xs font-bold text-white"><Download className="mr-1 inline h-4 w-4" />JPG</button><button type="button" onClick={() => setShowPrintModal(false)} className="min-h-10 rounded-xl bg-slate-200 text-xs font-bold text-slate-800">TUTUP</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
