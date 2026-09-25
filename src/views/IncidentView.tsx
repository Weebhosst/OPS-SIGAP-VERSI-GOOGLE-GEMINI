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
import { IncidentReport, IncidentCategory, IncidentSeverity, IncidentStatus, PatrolSession } from '../types/ops';
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
  const [locationText, setLocationText] = useState('');
  const [chronology, setChronology] = useState('');
  const [initialAction, setInitialAction] = useState('');
  const [escalated, setEscalated] = useState(false);
  const [escalatedTo, setEscalatedTo] = useState('SUPERVISOR / DANRU');
  const [policeReportNo, setPoliceReportNo] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [activeSession, setActiveSession] = useState<PatrolSession | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadIncidents = async () => {
    try {
      const [res, sessionRes] = await Promise.all([api.getIncidents(), api.getCurrentSession()]);
      if (res.success) {
        setIncidents(res.incidents);
      }
      setActiveSession(sessionRes.hasOpenSession ? sessionRes.session : null);
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
    if (!title || !locationText || !chronology || !initialAction) {
      alert('Judul, Area Kejadian, kronologi, dan tindakan awal wajib diisi.');
      return;
    }
    if (photoUrls.length < 3) {
      alert('Dokumentasi kejadian minimal 3 foto.');
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
        photoUrl: photoUrls[0],
        photoUrls,
        notes,
      });

      if (res.success) {
        setShowCreateModal(false);
        setTitle('');
        setChronology('');
        setInitialAction('');
        setPhotoUrl(null);
        setPhotoUrls([]);
        setNotes('');
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

  const canCreate = user?.role === 'ANGGOTA' && !!activeSession?.startDocumentationCompleted;
  const canManageStatus = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

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
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-300">Incident Report</p><h1 className="mt-0.5 text-base font-black tracking-tight text-white">Lapor Kejadian</h1></div>
              <p className="text-[11px] font-medium text-slate-400">Insiden, K3, & Keamanan</p>
            </div>
          </div>
          {canCreate ? <button
            onClick={() => setShowCreateModal(true)}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-amber-950/40 transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <Plus className="w-4 h-4" />
            <span>Lapor Insiden</span>
          </button> : null}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 pt-4">
        {incidents.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center text-slate-400 shadow-lg shadow-black/10">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm font-bold">Belum ada laporan kejadian aktif.</p>
            <p className="text-xs text-slate-500 mt-1">Situasi site KM 92 kondusif aman.</p>
            {canCreate ? <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white transition hover:bg-amber-500"
            >
              <Plus className="w-4 h-4" /> Buat Laporan Insiden
            </button> : null}
          </div>
        ) : (
          incidents.map((inc) => (
            <div
              key={inc.id}
              className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10"
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
                  <h3 className="mt-2 text-sm font-black text-white">{inc.title}</h3>
                  <div className="font-mono text-[11px] text-slate-400">
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
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5">
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
                <div className="aspect-video max-h-44 overflow-hidden rounded-xl border border-slate-800">
                  <img src={inc.photoUrl} alt="Bukti Kejadian" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Status Update Quick Toggles */}
              {canManageStatus ? <div className="flex items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-xs">
                <span className="text-slate-500">Ubah Status:</span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {inc.status !== 'OPEN' && (
                    <button
                      onClick={() => handleUpdateStatus(inc.id, 'OPEN')}
                      className="rounded-lg border border-red-800/50 bg-slate-800 px-2.5 py-1.5 text-[10px] font-black text-red-300 transition hover:bg-slate-700"
                    >
                      OPEN
                    </button>
                  )}
                  {inc.status !== 'FOLLOW_UP' && (
                    <button
                      onClick={() => handleUpdateStatus(inc.id, 'FOLLOW_UP')}
                      className="rounded-lg border border-amber-800/50 bg-slate-800 px-2.5 py-1.5 text-[10px] font-black text-amber-300 transition hover:bg-slate-700"
                    >
                      FOLLOW UP
                    </button>
                  )}
                  {inc.status !== 'CLOSED' && (
                    <button
                      onClick={() => handleUpdateStatus(inc.id, 'CLOSED')}
                      className="rounded-lg border border-emerald-800/50 bg-slate-800 px-2.5 py-1.5 text-[10px] font-black text-emerald-300 transition hover:bg-slate-700"
                    >
                      SELESAI (CLOSED)
                    </button>
                  )}
                </div>
              </div> : null}
            </div>
          ))
        )}
      </main>

      {/* Create Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700/90 bg-[#0f172a] p-5 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white">Formulir Laporan Kejadian Lapangan</h3>
              <button onClick={() => setShowCreateModal(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Tutup formulir laporan kejadian">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-slate-300"><div>Member: <b>{user?.name}</b> ({user?.npk})</div><div>Customer: {activeSession?.customerId}</div><div>Site: {activeSession?.siteId}</div><div>{activeSession?.shiftCode} • Operational Date {activeSession?.shiftDate}</div><div>Session ID: {activeSession?.id}</div></div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Kategori Kejadian:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
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
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Tingkat Keparahan (Severity):</label>
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
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Judul Ringkas Kejadian:</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pagar kawat perimeter timur ditemukan kendur"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">AREA KEJADIAN:</label>
                <input
                  type="text"
                  required
                  placeholder="Gerbang Utama / Jalur A / Rest Area / Pos Barat"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
                />
              </div>

              <div><label className="mb-1.5 block text-xs font-bold text-slate-300">Catatan:</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-white" /></div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Kronologi Kejadian Lengkap:</label>
                <textarea
                  rows={2}
                  required
                  value={chronology}
                  onChange={(e) => setChronology(e.target.value)}
                  placeholder="Uraikan waktu, kronologi kejadian, dan indikasi awal..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Tindakan Awal yang Diambil:</label>
                <textarea
                  rows={2}
                  required
                  value={initialAction}
                  onChange={(e) => setInitialAction(e.target.value)}
                  placeholder="Langkah pengamanan awal yang telah dilakukan petugas di TKP..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
                />
              </div>

              {/* Escalation & Police Report Fields */}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={escalated}
                    onChange={(e) => setEscalated(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600 focus:ring-0"
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
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-white outline-none focus:border-amber-500"
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
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-white outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Photo Evidence Capture */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Dokumentasi Foto (minimum 3, maksimum 5):</label>
                <div className="grid grid-cols-3 gap-2">{photoUrls.map((photo, index) => <div key={index} className="relative aspect-square overflow-hidden rounded-xl"><img src={photo} alt={`Bukti ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => setPhotoUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1">✕</button></div>)}</div>
                <button type="button" disabled={photoUrls.length >= 5} onClick={() => setShowCameraModal(true)} className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-700 py-2.5 text-slate-400 disabled:opacity-40"><Camera className="mr-1 inline h-4 w-4" />Tambah Foto ({photoUrls.length}/5)</button>
                {photoUrls.length < 3 ? <p className="mt-1 text-amber-300">Dokumentasi kejadian minimal 3 foto.</p> : <p className="mt-1 text-emerald-300">Dokumentasi valid.</p>}
              </div>

              <button
                type="submit"
                disabled={submitting || photoUrls.length < 3 || photoUrls.length > 5}
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
        onCapture={(base64) => setPhotoUrls((items) => items.length < 5 ? [...items, base64] : items)}
      />
    </div>
  );
};
