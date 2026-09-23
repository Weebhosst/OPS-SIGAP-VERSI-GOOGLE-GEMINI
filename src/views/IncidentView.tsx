/**
 * OPS SIGAP — Incident Report / Lapor Kejadian Module
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Plus,
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { IncidentReport, IncidentCategory, IncidentSeverity, IncidentStatus } from '../types/ops';
import { CameraCaptureModal } from '../components/CameraCaptureModal';

export const IncidentView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Form State
  const [category, setCategory] = useState<IncidentCategory>('INSIDENTIL');
  const [severity, setSeverity] = useState<IncidentSeverity>('RENDAH');
  const [title, setTitle] = useState('');
  const [locationText, setLocationText] = useState('Area Site BB92');
  const [chronology, setChronology] = useState('');
  const [initialAction, setInitialAction] = useState('');
  const [escalated, setEscalated] = useState(false);
  const [escalatedTo, setEscalatedTo] = useState('SUPERVISOR / DANRU');
  const [policeReportNo, setPoliceReportNo] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadIncidents = async () => {
    try {
      const res = await api.getIncidents();
      if (res.success) {
        setIncidents(res.incidents);
      }
    } catch (err) {
      console.warn('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !chronology || !initialAction) {
      alert('Judul, kronologi, dan tindakan awal wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createIncident({
        category,
        severity,
        title,
        locationText,
        chronology,
        initialAction,
        escalated,
        escalatedTo: escalated ? escalatedTo : undefined,
        policeReportNo: policeReportNo || undefined,
        photoUrl: photoUrl || undefined,
      });

      if (res.success) {
        setShowCreateModal(false);
        setTitle('');
        setChronology('');
        setInitialAction('');
        setPhotoUrl(null);
        setEscalated(false);
        setPoliceReportNo('');
        await loadIncidents();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan laporan kejadian');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: IncidentStatus) => {
    try {
      const res = await api.updateIncidentStatus(id, newStatus);
      if (res.success) {
        await loadIncidents();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui status');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-extrabold text-white text-base">Lapor Kejadian</h1>
              <p className="text-[11px] text-slate-400 font-medium">Insiden, K3, & Keamanan</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-amber-950/50"
          >
            <Plus className="w-4 h-4" />
            <span>Lapor Insiden</span>
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {incidents.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <AlertTriangle className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium">Belum ada laporan kejadian aktif.</p>
            <p className="text-xs text-slate-500 mt-1">Situasi site KM 92 kondusif aman.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Buat Laporan Insiden
            </button>
          </div>
        ) : (
          incidents.map((inc) => (
            <div
              key={inc.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        inc.severity === 'KRITIS'
                          ? 'bg-red-600 text-white'
                          : inc.severity === 'TINGGI'
                          ? 'bg-amber-600 text-white'
                          : inc.severity === 'SEDANG'
                          ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-600/40'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {inc.severity}
                    </span>
                    <span className="text-xs font-mono font-semibold text-blue-400">
                      {inc.category}
                    </span>
                    {inc.escalated && (
                      <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.5 rounded font-bold">
                        DIESKALASI
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-white text-sm mt-1">{inc.title}</h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {inc.locationText} • {new Date(inc.incidentAt).toLocaleTimeString('id-ID')} WIB
                  </div>
                </div>

                <div>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      inc.status === 'OPEN'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : inc.status === 'FOLLOW_UP'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {inc.status}
                  </span>
                </div>
              </div>

              {/* Chronology & Initial Action */}
              <div className="text-xs bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div>
                  <span className="text-slate-400 font-semibold">Kronologi:</span>{' '}
                  <span className="text-slate-200">{inc.chronology}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold">Tindakan Awal:</span>{' '}
                  <span className="text-slate-200">{inc.initialAction}</span>
                </div>
                {inc.policeReportNo && (
                  <div>
                    <span className="text-slate-400 font-semibold">No. Laporan Polisi:</span>{' '}
                    <span className="text-amber-300 font-mono">{inc.policeReportNo}</span>
                  </div>
                )}
              </div>

              {inc.photoUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-800 aspect-video max-h-40">
                  <img src={inc.photoUrl} alt="Bukti Kejadian" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Status Update Quick Toggles */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-500">Ubah Status:</span>
                <div className="flex gap-1.5">
                  {inc.status !== 'OPEN' && (
                    <button
                      onClick={() => handleUpdateStatus(inc.id, 'OPEN')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-red-300 rounded-lg text-[10px] font-bold"
                    >
                      OPEN
                    </button>
                  )}
                  {inc.status !== 'FOLLOW_UP' && (
                    <button
                      onClick={() => handleUpdateStatus(inc.id, 'FOLLOW_UP')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[10px] font-bold"
                    >
                      FOLLOW UP
                    </button>
                  )}
                  {inc.status !== 'CLOSED' && (
                    <button
                      onClick={() => handleUpdateStatus(inc.id, 'CLOSED')}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg text-[10px] font-bold"
                    >
                      SELESAI (CLOSED)
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Create Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Formulir Laporan Kejadian Lapangan</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Kategori Kejadian:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="INSIDENTIL">INSIDENTIL</option>
                  <option value="MENONJOL">MENONJOL (Perlu Atensi Super Admin)</option>
                  <option value="KEAMANAN">KEAMANAN (Penyusupan/Pencurian/Perkelahian)</option>
                  <option value="K3">K3 (Kesehatan & Keselamatan Kerja)</option>
                  <option value="KECELAKAAN">KECELAKAAN</option>
                  <option value="KERUSAKAN">KERUSAKAN FASILITAS</option>
                  <option value="KEHILANGAN">KEHILANGAN</option>
                  <option value="LAINNYA">LAINNYA</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Tingkat Keparahan (Severity):</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS'] as IncidentSeverity[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={`py-2 text-center rounded-xl font-bold border ${
                        severity === s
                          ? s === 'KRITIS'
                            ? 'bg-red-600 text-white border-red-500'
                            : s === 'TINGGI'
                            ? 'bg-amber-600 text-white border-amber-500'
                            : s === 'SEDANG'
                            ? 'bg-yellow-600/30 text-yellow-300 border-yellow-500'
                            : 'bg-slate-700 text-slate-200 border-slate-600'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Judul Ringkas Kejadian:</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pagar kawat perimeter timur ditemukan kendur"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Lokasi Kejadian:</label>
                <input
                  type="text"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Kronologi Kejadian Lengkap:</label>
                <textarea
                  rows={2}
                  required
                  value={chronology}
                  onChange={(e) => setChronology(e.target.value)}
                  placeholder="Uraikan waktu, kronologi kejadian, dan indikasi awal..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Tindakan Awal yang Diambil:</label>
                <textarea
                  rows={2}
                  required
                  value={initialAction}
                  onChange={(e) => setInitialAction(e.target.value)}
                  placeholder="Langkah pengamanan awal yang telah dilakukan petugas di TKP..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              {/* Escalation & Police Report Fields */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={escalated}
                    onChange={(e) => setEscalated(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0"
                  />
                  <span className="font-semibold text-slate-300">Eskalasi ke Pihak Luar / Supervisor</span>
                </label>

                {escalated && (
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Eskalasi Ditujukan Kepada:</label>
                    <input
                      type="text"
                      value={escalatedTo}
                      onChange={(e) => setEscalatedTo(e.target.value)}
                      placeholder="Supervisor Operasional / Polsek Patokbeusi / Babinsa"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                )}

                {(category === 'KECELAKAAN' || category === 'KEHILANGAN' || category === 'MENONJOL') && (
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">No. Laporan Polisi (Opsional):</label>
                    <input
                      type="text"
                      value={policeReportNo}
                      onChange={(e) => setPoliceReportNo(e.target.value)}
                      placeholder="LP/B/..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                )}
              </div>

              {/* Photo Evidence Capture */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Bukti Foto TKP / Kejadian:</label>
                {photoUrl ? (
                  <div className="relative rounded-xl overflow-hidden aspect-video border border-slate-800">
                    <img src={photoUrl} alt="Evidence" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="absolute top-2 right-2 p-1 rounded-lg bg-black/70 text-white"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="w-full py-2.5 border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:text-white transition"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Ambil Foto Bukti TKP</span>
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-950/40 transition"
              >
                {submitting ? 'Menyimpan Laporan...' : 'KIRIM LAPORAN KEJADIAN'}
              </button>
            </form>
          </div>
        </div>
      )}

      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(base64) => setPhotoUrl(base64)}
      />
    </div>
  );
};
