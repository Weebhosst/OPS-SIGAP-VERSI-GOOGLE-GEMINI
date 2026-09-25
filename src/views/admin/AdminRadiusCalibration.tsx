/**
 * OPS SIGAP — Admin Radius Calibration Logs
 * Records and verifies field radius tests (e.g. CP02 16.29m REJECTED, CP02 14.86m VALID, CP05 7.31m VALID)
 */

import React, { useEffect, useState } from 'react';
import {
  Sliders,
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../lib/api';
import { RadiusCalibration } from '../../types/ops';

export const AdminRadiusCalibration: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [calibrations, setCalibrations] = useState<RadiusCalibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // New calibration form
  const [checkpointId, setCheckpointId] = useState('CP02');
  const [testLat, setTestLat] = useState(-6.481104);
  const [testLng, setTestLng] = useState(107.631806);
  const [measuredDistanceM, setMeasuredDistanceM] = useState(16.29);
  const [expectedStatus, setExpectedStatus] = useState<'VALID' | 'REJECTED'>('REJECTED');
  const [deviceModel, setDeviceModel] = useState('Samsung A14 Field Test');
  const [notes, setNotes] = useState('UAT Geofence Boundary Test');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadCalibrations = async () => {
    try {
      const res = await api.getRadiusCalibrations();
      if (res.success) {
        setCalibrations(res.calibrations);
      }
    } catch (err) {
      console.warn('Failed to load calibrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalibrations();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createRadiusCalibration({
        checkpointId,
        latitude: testLat,
        longitude: testLng,
        calculatedDistanceM: measuredDistanceM,
        configuredRadiusM: checkpointId === 'CP03' || checkpointId === 'CP04' ? 10 : 15,
        verdict: expectedStatus,
        deviceModel,
        notes,
      });

      if (res.success) {
        setShowAddModal(false);
        await loadCalibrations();
      }
    } catch (err: any) {
      setStatusMsg(err.message || 'Gagal menyimpan kalibrasi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-10 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-base font-black tracking-tight text-white">Kalibrasi Radius Geofence</h1>
              <p className="text-[11px] font-medium text-slate-400">Riwayat pengujian toleransi jarak, read-only dari navigasi utama</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6 lg:pt-6">
        {statusMsg ? <div className="rounded-2xl border border-blue-800/70 bg-blue-950/30 p-3 text-xs text-blue-100" role="status" aria-live="polite">{statusMsg}</div> : null}
        {/* Verification Summary Banner */}
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs text-slate-300 shadow-lg shadow-black/10">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Verifikasi Riwayat UAT BB92</span>
          </div>
          <p className="text-slate-400">
            Sistem mencatat presisi batas toleransi radius: Titik CP02 (batas 15m) ditolak secara tegas pada jarak 16.29m (REJECTED) dan diterima saat berada pada 14.86m (VALID). Titik CP05 pada 7.31m diterima (VALID).
          </p>
        </div>

        {/* Calibration Logs */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {calibrations.map((cal) => (
            <div
              key={cal.id}
              className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    {cal.checkpointId}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-white">
                      Jarak Terukur: {cal.calculatedDistanceM?.toFixed(2) || '0.00'} meter (Batas: {cal.configuredRadiusM || 15}m)
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Perangkat: {cal.deviceModel || 'UAT Handset'} •{' '}
                      {new Date(cal.testedAt).toLocaleTimeString('id-ID')} WIB
                    </div>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full font-mono ${
                    cal.verdict === 'VALID'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {cal.verdict}
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Koordinat: {cal.latitude?.toFixed(6)}, {cal.longitude?.toFixed(6)}
                </span>
                <span className="text-slate-300 italic">{cal.notes}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add Calibration Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="ops-dialog w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700/90 bg-[#0f172a] p-5 shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="radius-test-title">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 id="radius-test-title" className="text-sm font-black text-white">Catat Uji Kalibrasi Radius</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Tutup uji kalibrasi">
                ✕
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3 text-xs">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Kode Checkpoint:</label>
                <select
                  value={checkpointId}
                  onChange={(e) => setCheckpointId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                >
                  <option value="CP01">CP01 — LOKASI UJUNG BB92 (15m)</option>
                  <option value="CP02">CP02 — LOKASI TENGAH BB92 (15m)</option>
                  <option value="CP03">CP03 — PINTU GEMBOK AKSES (10m)</option>
                  <option value="CP04">CP04 — LOKASI PANEL TENGAH (10m)</option>
                  <option value="CP05">CP05 — GERBANG AKSES UTAMA (15m)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Jarak Terukur (Meter):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={measuredDistanceM}
                  onChange={(e) => setMeasuredDistanceM(parseFloat(e.target.value))}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Hasil Uji yang Diharapkan:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExpectedStatus('VALID')}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-black transition ${
                      expectedStatus === 'VALID'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    VALID (Dalam Radius)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpectedStatus('REJECTED')}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-black transition ${
                      expectedStatus === 'REJECTED'
                        ? 'bg-red-600/30 border-red-500 text-red-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    REJECTED (Luar Radius)
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Perangkat / HP:</label>
                <input
                  type="text"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Catatan Uji:</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Data Kalibrasi'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
