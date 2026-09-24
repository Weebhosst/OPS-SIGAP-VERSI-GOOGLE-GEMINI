/**
 * OPS SIGAP — Admin Checkpoint Management
 * View, edit, regenerate QR token (with audit trail), and printable QR Cards
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  QrCode,
  ArrowLeft,
  RefreshCw,
  Printer,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Shield,
  Download,
  Plus,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

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

const emptyCheckpointRow = (): NewCheckpointRow => ({ name: '', coordinateMethod: 'MANUAL', latitude: '', longitude: '', accuracy: null, capturedAt: null, gpsMessage: null, radiusMeters: 15 });

export const AdminCheckpoints: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCp, setSelectedCp] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sites, setSites] = useState<Array<{ id: string; name: string; customerId: string; targetRoundsPerShift?: number }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newSiteId, setNewSiteId] = useState('BB92');
  const [newRows, setNewRows] = useState<NewCheckpointRow[]>([]);
  const [targetRounds, setTargetRounds] = useState(1);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editLat, setEditLat] = useState(0);
  const [editLng, setEditLng] = useState(0);
  const [editRadius, setEditRadius] = useState(15);
  const [saving, setSaving] = useState(false);

  const loadCheckpoints = async () => {
    try {
      const [res, masters] = await Promise.all([api.getAdminCheckpoints(), api.getMasters()]);
      if (res.success) {
        setCheckpoints(res.checkpoints);
      }
      setSites(masters.sites);
      setCustomers(masters.customers);
      setNewCustomerId((current) => current || masters.sites.find((site) => site.id === newSiteId)?.customerId || masters.customers[0]?.id || '');
      setNewSiteId((current) => current || masters.sites[0]?.id || '');
    } catch (err) {
      console.warn('Failed to load checkpoints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCheckpoints();
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`ops:checkpointView:${user.id}`) || '{}');
      if (saved.customerId) setNewCustomerId(saved.customerId);
      if (saved.siteId) setNewSiteId(saved.siteId);
    } catch { /* keep current valid selection */ }
  }, [user]);

  useEffect(() => {
    const selectedSite = sites.find((site) => site.id === newSiteId);
    if (selectedSite) {
      setTargetRounds(Math.max(1, selectedSite.targetRoundsPerShift || 1));
      if (user) sessionStorage.setItem(`ops:checkpointView:${user.id}`, JSON.stringify({ customerId: selectedSite.customerId, siteId: selectedSite.id }));
      const search = new URLSearchParams(window.location.search);
      search.set('view', 'checkpoints'); search.set('customer', selectedSite.customerId); search.set('site', selectedSite.id);
      window.history.replaceState({}, '', `${window.location.pathname}?${search.toString()}`);
    }
  }, [newSiteId, sites, user]);

  const handleOpenEdit = (cp: any) => {
    setSelectedCp(cp);
    setEditName(cp.name);
    setEditLat(cp.latitude);
    setEditLng(cp.longitude);
    setEditRadius(cp.radiusMeters);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCp) return;
    setSaving(true);
    try {
      const res = await api.updateAdminCheckpoint(selectedCp.id, {
        name: editName,
        latitude: editLat,
        longitude: editLng,
        radiusMeters: editRadius,
      });
      if (res.success) {
        setShowEditModal(false);
        setStatusMsg(`Checkpoint ${selectedCp.code} berhasil diperbarui.`);
        await loadCheckpoints();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateToken = async (cp: any) => {
    try {
      const res = await api.generateCheckpointToken(cp.id);
      if (res.success) {
        setStatusMsg(`Secure token ${cp.code} berhasil dibuat. Lanjutkan dengan Generate QR Code.`);
        await loadCheckpoints();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal generate token');
    }
  };

  const handleGenerateQr = async (cp: any) => {
    try {
      const res = await api.generateCheckpointQr(cp.id);
      if (res.success) {
        setStatusMsg(`QR Code ${cp.code} aktif dan terikat ke Checkpoint ID + secure token.`);
        await loadCheckpoints();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal generate QR Code');
    }
  };

  const handleOpenPrint = (cp: any) => {
    setSelectedCp(cp);
    setShowPrintModal(true);
  };

  const updateNewRow = (index: number, updates: Partial<NewCheckpointRow>) => setNewRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...updates } : row));

  const captureGps = (index: number) => {
    if (!navigator.geolocation) { updateNewRow(index, { gpsMessage: 'GPS tidak tersedia pada browser/perangkat ini.' }); return; }
    updateNewRow(index, { coordinateMethod: 'GPS', gpsMessage: 'Mengambil GPS saat ini...' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy);
        updateNewRow(index, { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy, capturedAt: new Date(position.timestamp).toISOString(), gpsMessage: accuracy > 25 ? 'AKURASI GPS RENDAH. Berpindahlah ke area terbuka lalu coba GPS lagi.' : 'GPS berhasil diambil.' });
      },
      (error) => {
        const messages: Record<number, string> = { 1: 'Izin lokasi ditolak. Aktifkan permission GPS browser.', 2: 'Posisi GPS tidak tersedia. Coba di area terbuka.', 3: 'Pengambilan GPS timeout. Silakan coba lagi.' };
        updateNewRow(index, { gpsMessage: messages[error.code] || 'Gagal mengambil koordinat GPS.' });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleCreateCheckpoint = async (index: number) => {
    const row = newRows[index];
    if (!row?.name.trim() || row.latitude === '' || row.longitude === '') { alert('Nama dan koordinat checkpoint wajib diisi.'); return; }
    if (row.coordinateMethod === 'GPS' && (row.accuracy === null || row.accuracy > 25)) { alert('Koordinat GPS dengan akurasi rendah/belum tersedia tidak dapat disimpan. Coba GPS lagi atau pilih Input Manual.'); return; }
    setSaving(true);
    try {
      const existingAtSite = checkpoints.filter((checkpoint) => checkpoint.siteId === newSiteId).length;
      const sequence = existingAtSite + 1;
      await api.createAdminCheckpoint({ siteId: newSiteId, code: `CP${String(sequence).padStart(2, '0')}`, ...row });
      setNewRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
      setStatusMsg(`Checkpoint #${sequence} berhasil disimpan. Generate token dan QR pada kartu checkpoint.`);
      await loadCheckpoints();
    } catch (error: any) { alert(error.message || 'Gagal membuat checkpoint.'); }
    finally { setSaving(false); }
  };

  const saveTargetRounds = async () => {
    if (!newSiteId) return;
    setSaving(true);
    try { await api.updateSite(newSiteId, { targetRoundsPerShift: targetRounds }); setStatusMsg(`Target ronde ${newSiteId} disimpan: ${targetRounds} ronde/shift.`); await loadCheckpoints(); }
    catch (error: any) { alert(error.message || 'Gagal menyimpan target ronde.'); }
    finally { setSaving(false); }
  };

  const downloadQrCard = async (cp: any) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(JSON.stringify({ checkpointId: cp.id, token: cp.qrToken }))}`;
    try {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = qrUrl;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('QR image gagal dimuat')); });
      const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 900;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas tidak tersedia');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#0f172a'; context.textAlign = 'center'; context.font = 'bold 42px sans-serif'; context.fillText('OPS SIGAP', 360, 70);
      context.font = 'bold 24px sans-serif'; context.fillText(`${cp.siteId} • ${cp.code}`, 360, 115);
      context.drawImage(image, 110, 155, 500, 500);
      context.font = 'bold 25px sans-serif'; context.fillText(cp.name, 360, 710);
      context.font = '22px sans-serif'; context.fillText(`Radius ${cp.radiusMeters} meter`, 360, 755);
      context.font = '18px sans-serif'; context.fillText('SCAN DI LOKASI — GPS & FOTO WAJIB', 360, 820);
      const link = document.createElement('a'); link.download = `OPS-SIGAP-${cp.siteId}-${cp.code}.png`; link.href = canvas.toDataURL('image/png'); link.click();
    } catch (error: any) { alert(error.message || 'Gagal mengunduh QR.'); }
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
              <h1 className="font-extrabold text-white text-base">Master Checkpoint</h1>
              <p className="text-[11px] text-slate-400 font-medium">Radius Geofence, Koordinat & QR Card</p>
            </div>
          </div>
          <button onClick={() => setShowAddModal(true)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold"><Plus className="mr-1 inline h-4 w-4" />Tambah</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs sm:grid-cols-4"><label>Customer<select value={newCustomerId} onChange={(e) => { setNewCustomerId(e.target.value); setNewSiteId(sites.find((site) => site.customerId === e.target.value)?.id || ''); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label>Site<select value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">{sites.filter((site) => site.customerId === newCustomerId).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label>Jumlah Checkpoint<input readOnly value={checkpoints.filter((checkpoint) => checkpoint.siteId === newSiteId).length} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2" /></label><label>Target Ronde / Shift<div className="mt-1 flex gap-1"><input type="number" min="1" max="20" value={targetRounds} onChange={(e) => setTargetRounds(Math.max(1, Number(e.target.value)))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2" /><button onClick={() => void saveTargetRounds()} className="rounded-lg bg-blue-600 px-2 font-bold">Simpan</button></div></label></div>
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

        {/* Checkpoint Table / Cards */}
        <div className="space-y-3">
          {checkpoints.filter((checkpoint) => checkpoint.siteId === newSiteId).map((cp) => (
            <div
              key={cp.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 font-mono font-black text-sm flex items-center justify-center shrink-0">
                    {cp.code}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{cp.name}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Site: {cp.siteId} • Urutan: #{cp.sequenceOrder}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                      <span className="text-blue-400 font-semibold">Radius: {cp.radiusMeters}m</span>
                      <span>•</span>
                      <span>
                        Lat: {cp.latitude.toFixed(6)}, Lng: {cp.longitude.toFixed(6)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => cp.qrStatus === 'ACTIVE' && handleOpenPrint(cp)}
                    disabled={cp.qrStatus !== 'ACTIVE'}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-1 transition"
                    title="Cetak Kartu Barcode QR"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>View QR</span>
                  </button>
                  <button
                    onClick={() => handleOpenEdit(cp)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition"
                    title="Edit Koordinat & Radius"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* QR Token & Security Bar */}
              <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-1 font-bold ${cp.qrToken ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{cp.qrToken ? 'TOKEN READY' : 'TOKEN NOT GENERATED'}</span>
                  <span className={`rounded px-2 py-1 font-bold ${cp.qrStatus === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{cp.qrStatus === 'ACTIVE' ? 'QR READY' : 'QR NOT GENERATED'}</span>
                  {cp.coordinateMethod === 'GPS' ? <span className={`rounded px-2 py-1 font-bold ${(cp.gpsAccuracyM || 999) <= 25 ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>{(cp.gpsAccuracyM || 999) <= 25 ? 'GPS GOOD' : 'GPS LOW ACCURACY'}</span> : null}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void handleGenerateToken(cp)} className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"><RefreshCw className="w-3 h-3" /><span>Generate Token</span></button>
                  <button disabled={!cp.qrToken} onClick={() => void handleGenerateQr(cp)} className="text-blue-400 hover:text-blue-300 disabled:opacity-40 font-semibold flex items-center gap-1"><QrCode className="w-3 h-3" /><span>Generate QR</span></button>
                  <button disabled={cp.qrStatus !== 'ACTIVE'} onClick={() => void downloadQrCard(cp)} className="text-emerald-400 disabled:opacity-40"><Download className="inline h-3 w-3" /> JPG</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">Tambah Checkpoint Site</h3><p className="text-[11px] text-slate-400">Checkpoint dibuat tanpa token. Generate token lalu QR setelah data lokasi benar.</p></div><button type="button" onClick={() => setShowAddModal(false)}>✕</button></div>
          <div className="grid grid-cols-2 gap-2 text-xs"><label>Customer<select value={newCustomerId} onChange={(e) => { const customerId = e.target.value; setNewCustomerId(customerId); setNewSiteId(sites.find((site) => site.customerId === customerId)?.id || ''); }} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label>Site<select required value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2">{sites.filter((site) => site.customerId === newCustomerId).map((site) => <option key={site.id} value={site.id}>{site.id} — {site.name}</option>)}</select></label><label>Jumlah Checkpoint<input readOnly value={checkpoints.filter((checkpoint) => checkpoint.siteId === newSiteId).length} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 p-2" /></label><button type="button" onClick={() => setNewRows((rows) => [...rows, emptyCheckpointRow()])} className="self-end rounded-xl bg-blue-600 p-2 font-bold"><Plus className="mr-1 inline h-4 w-4" />ADD ROW</button></div>
          <div className="space-y-3">{newRows.map((row, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs"><legend className="px-2 font-black text-blue-300">CHECKPOINT #{checkpoints.filter((checkpoint) => checkpoint.siteId === newSiteId).length + index + 1}</legend><label className="block font-semibold">Nama Titik Checkpoint<input required value={row.name} onChange={(e) => updateNewRow(index, { name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 font-normal" /></label><div><span className="block font-semibold">Metode Koordinat</span><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" onClick={() => updateNewRow(index, { coordinateMethod: 'MANUAL', accuracy: null, capturedAt: null, gpsMessage: null })} className={`rounded-lg p-2 font-bold ${row.coordinateMethod === 'MANUAL' ? 'bg-blue-600' : 'bg-slate-800'}`}>INPUT MANUAL</button><button type="button" onClick={() => captureGps(index)} className={`rounded-lg p-2 font-bold ${row.coordinateMethod === 'GPS' ? 'bg-blue-600' : 'bg-slate-800'}`}>📍 AMBIL GPS SAAT INI</button></div></div><div className="grid grid-cols-2 gap-2"><label className="font-semibold">Latitude<input required type="number" step="any" value={row.latitude} readOnly={row.coordinateMethod === 'GPS'} onChange={(e) => updateNewRow(index, { latitude: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 font-normal" /></label><label className="font-semibold">Longitude<input required type="number" step="any" value={row.longitude} readOnly={row.coordinateMethod === 'GPS'} onChange={(e) => updateNewRow(index, { longitude: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 font-normal" /></label></div><div className="grid grid-cols-2 gap-2"><div><span className="font-semibold">Akurasi GPS</span><div className={`mt-1 rounded-lg border p-2 ${row.accuracy !== null && row.accuracy > 25 ? 'border-amber-700 bg-amber-950 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-400'}`}>{row.accuracy !== null ? `± ${row.accuracy} meter` : '— (Input Manual)'}{row.capturedAt ? <div className="mt-1 text-[10px]">{new Date(row.capturedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</div> : null}</div></div><label className="font-semibold">Radius Geofence (meter)<input required type="number" min="1" value={row.radiusMeters} onChange={(e) => updateNewRow(index, { radiusMeters: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 font-normal" /></label></div>{row.gpsMessage ? <div className={`rounded-lg p-2 ${row.accuracy !== null && row.accuracy > 25 ? 'bg-amber-950 text-amber-200' : 'bg-emerald-950 text-emerald-200'}`}>{row.gpsMessage}{row.accuracy !== null && row.accuracy > 25 ? <button type="button" onClick={() => captureGps(index)} className="ml-2 rounded bg-amber-700 px-2 py-1 font-bold">COBA GPS LAGI</button> : null}</div> : null}<button type="button" disabled={saving} onClick={() => void handleCreateCheckpoint(index)} className="w-full rounded-xl bg-emerald-700 p-2 font-bold disabled:opacity-40">SIMPAN CHECKPOINT</button><div className="grid grid-cols-4 gap-1"><button type="button" disabled className="rounded bg-slate-800 p-2 opacity-40">GENERATE TOKEN</button><button type="button" disabled className="rounded bg-slate-800 p-2 opacity-40">GENERATE QR</button><button type="button" disabled className="rounded bg-slate-800 p-2 opacity-40">VIEW QR</button><button type="button" disabled className="rounded bg-slate-800 p-2 opacity-40">DOWNLOAD JPG</button></div></fieldset>)}</div>
        </div></div>
      )}

      {/* Edit Checkpoint Modal */}
      {showEditModal && selectedCp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Edit Checkpoint {selectedCp.code}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Nama Lokasi:</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Latitude:</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editLat}
                    onChange={(e) => setEditLat(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Longitude:</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editLng}
                    onChange={(e) => setEditLng(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Toleransi Radius Geofence (Meter):
                </label>
                <input
                  type="number"
                  required
                  min={5}
                  max={50}
                  value={editRadius}
                  onChange={(e) => setEditRadius(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Standar BB92: CP01/CP02/CP05 = 15m; CP03/CP04 = 10m.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Printable QR Card Modal */}
      {showPrintModal && selectedCp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl overflow-hidden shadow-2xl p-6 text-center space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Kartu Checkpoint Resmi
              </span>
              <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            {/* Tactical printable card preview */}
            <div
              id="printable-card"
              className="border-4 border-slate-900 p-5 rounded-2xl bg-white space-y-3"
            >
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                <div className="text-left">
                  <div className="text-sm font-black tracking-tight text-slate-950">OPS SIGAP</div>
                  <div className="text-[10px] font-bold text-slate-600">{customers.find((customer) => customer.id === sites.find((site) => site.id === selectedCp.siteId)?.customerId)?.name || 'CUSTOMER'}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-blue-600 font-mono">
                    {selectedCp.code}
                  </div>
                  <div className="text-[10px] font-bold text-slate-600 font-mono">
                    RADIUS {selectedCp.radiusMeters}M
                  </div>
                </div>
              </div>

              {/* QR Code image generated via quick SVG/Image helper */}
              <div className="py-2 flex flex-col items-center justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    JSON.stringify({ checkpointId: selectedCp.id, token: selectedCp.qrToken })
                  )}`}
                  alt="QR Code"
                  className="w-44 h-44 mx-auto border-2 border-slate-900 p-1 rounded-xl shadow-sm"
                />
                <span className="mt-2 font-mono text-[10px] font-bold text-slate-700">{selectedCp.siteId} • {selectedCp.code}</span>
              </div>

              <div className="border-t-2 border-slate-900 pt-2 text-left">
                <div className="text-xs font-bold text-slate-950 uppercase">{selectedCp.name}</div>
                <div className="text-[10px] text-slate-600 font-mono">
                  GPS: {selectedCp.latitude.toFixed(6)}, {selectedCp.longitude.toFixed(6)}
                </div>
              </div>

              <div className="bg-slate-950 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wider uppercase">
                SCAN DI LOKASI — GPS & FOTO WAJIB
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / Print</span>
              </button>
              <button onClick={() => void downloadQrCard(selectedCp)} className="rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white"><Download className="mr-1 inline h-4 w-4" />DOWNLOAD JPG</button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs rounded-xl transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
