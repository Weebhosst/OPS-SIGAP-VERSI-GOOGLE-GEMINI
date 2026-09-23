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
} from 'lucide-react';
import { api } from '../../lib/api';

export const AdminCheckpoints: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCp, setSelectedCp] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [confirmRegenCp, setConfirmRegenCp] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editLat, setEditLat] = useState(0);
  const [editLng, setEditLng] = useState(0);
  const [editRadius, setEditRadius] = useState(15);
  const [saving, setSaving] = useState(false);

  const loadCheckpoints = async () => {
    try {
      const res = await api.getAdminCheckpoints();
      if (res.success) {
        setCheckpoints(res.checkpoints);
      }
    } catch (err) {
      console.warn('Failed to load checkpoints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCheckpoints();
  }, []);

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

  const handleConfirmRegenerateQr = async () => {
    if (!confirmRegenCp) return;
    try {
      const res = await api.regenerateCheckpointQr(confirmRegenCp.id);
      if (res.success) {
        setConfirmRegenCp(null);
        setStatusMsg(`QR Token untuk ${confirmRegenCp.code} berhasil diganti (Tercatat di Audit Log).`);
        await loadCheckpoints();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal meregenerasi QR');
    }
  };

  const handleOpenPrint = (cp: any) => {
    setSelectedCp(cp);
    setShowPrintModal(true);
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
              <h1 className="font-extrabold text-white text-base">Master Checkpoint BB92</h1>
              <p className="text-[11px] text-slate-400 font-medium">Radius Geofence, Koordinat & QR Card</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-blue-400">
            {checkpoints.length} Titik Wajib
          </span>
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

        {/* Checkpoint Table / Cards */}
        <div className="space-y-3">
          {checkpoints.map((cp) => (
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
                    onClick={() => handleOpenPrint(cp)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-1 transition"
                    title="Cetak Kartu Barcode QR"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak QR</span>
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
                  <span className="text-slate-500">QR Token Aktif:</span>
                  <span className="text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 truncate max-w-[200px]">
                    {cp.qrToken}
                  </span>
                </div>
                <button
                  onClick={() => setConfirmRegenCp(cp)}
                  className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Regenerasi Token</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

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

      {/* Confirmation Dialog for QR Token Regeneration */}
      {confirmRegenCp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-800/80 rounded-2xl p-5 space-y-3 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="font-bold text-white text-sm">Regenerasi Token QR?</h3>
            <p className="text-xs text-slate-300">
              Apakah Anda yakin ingin mengganti QR Token untuk{' '}
              <strong>{confirmRegenCp.code} — {confirmRegenCp.name}</strong>?
            </p>
            <p className="text-[11px] text-amber-300 bg-amber-950/50 p-2 rounded-xl border border-amber-900">
              Barcode lama yang tertempel di lapangan tidak akan berlaku lagi sampai stiker baru dicetak dan dipasang.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <button
                onClick={() => setConfirmRegenCp(null)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmRegenerateQr}
                className="py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold"
              >
                Ya, Ganti Token
              </button>
            </div>
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
                  <div className="text-[10px] font-bold text-slate-600">POS BB92 • KM 92</div>
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
                    selectedCp.qrToken
                  )}`}
                  alt="QR Code"
                  className="w-44 h-44 mx-auto border-2 border-slate-900 p-1 rounded-xl shadow-sm"
                />
                <span className="font-mono text-[10px] font-bold text-slate-700 mt-2 truncate max-w-[240px]">
                  TOKEN: {selectedCp.qrToken}
                </span>
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

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / Print</span>
              </button>
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
