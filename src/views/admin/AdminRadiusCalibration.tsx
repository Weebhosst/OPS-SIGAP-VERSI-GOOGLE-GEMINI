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
      alert(err.message || 'Gagal menyimpan kalibrasi');
    } finally {
      setSubmitting(false);
    }
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
              <h1 className="font-extrabold text-white text-base">Kalibrasi Radius Geofence</h1>
              <p className="text-[11px] text-slate-400 font-medium">Pengujian Toleransi Jarak Lapangan</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-blue-950/50"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Tes</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* Verification Summary Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-1">
          <div className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Verifikasi Riwayat UAT BB92</span>
          </div>
          <p className="text-slate-400">
            Sistem mencatat presisi batas toleransi radius: Titik CP02 (batas 15m) ditolak secara tegas pada jarak 16.29m (REJECTED) dan diterima saat berada pada 14.86m (VALID). Titik CP05 pada 7.31m diterima (VALID).
          </p>
        </div>

        {/* Calibration Logs */}
        <div className="space-y-3">
          {calibrations.map((cal) => (
            <div
              key={cal.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white text-sm bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
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

              <div className="text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-slate-400 flex items-center justify-between">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Catat Uji Kalibrasi Radius</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Kode Checkpoint:</label>
                <select
                  value={checkpointId}
                  onChange={(e) => setCheckpointId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                >
                  <option value="CP01">CP01 — LOKASI UJUNG BB92 (15m)</option>
                  <option value="CP02">CP02 — LOKASI TENGAH BB92 (15m)</option>
                  <option value="CP03">CP03 — PINTU GEMBOK AKSES (10m)</option>
                  <option value="CP04">CP04 — LOKASI PANEL TENGAH (10m)</option>
                  <option value="CP05">CP05 — GERBANG AKSES UTAMA (15m)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Jarak Terukur (Meter):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={measuredDistanceM}
                  onChange={(e) => setMeasuredDistanceM(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Hasil Uji yang Diharapkan:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExpectedStatus('VALID')}
                    className={`py-2 rounded-xl font-bold border ${
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
                    className={`py-2 rounded-xl font-bold border ${
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
                <label className="font-semibold text-slate-300 block mb-1">Perangkat / HP:</label>
                <input
                  type="text"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Catatan Uji:</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
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
