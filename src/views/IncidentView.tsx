/**
 * OPS SIGAP — Incident Report / Lapor Kejadian Module
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  IncidentCategory,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
  PatrolSession,
  Site,
} from '../types/ops';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { OpsDialog, OpsNoticeDialog, type OpsDialogTone } from '../components/OpsDialog';

type IncidentGps = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

const CATEGORY_OPTIONS: Array<{ value: IncidentCategory; label: string }> = [
  { value: 'INSIDENTIL', label: 'Insidentil' },
  { value: 'MENONJOL', label: 'Menonjol' },
  { value: 'KEAMANAN', label: 'Keamanan' },
  { value: 'K3', label: 'K3' },
  { value: 'KECELAKAAN', label: 'Kecelakaan' },
  { value: 'KERUSAKAN', label: 'Kerusakan Fasilitas' },
  { value: 'KEHILANGAN', label: 'Kehilangan' },
  { value: 'LAINNYA', label: 'Lainnya' },
];

const SEVERITY_OPTIONS: IncidentSeverity[] = ['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS'];

export const IncidentView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [activeSession, setActiveSession] = useState<PatrolSession | null>(null);
  const [siteInfo, setSiteInfo] = useState<Site | null>(null);
  const [gps, setGps] = useState<IncidentGps | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string; tone: OpsDialogTone } | null>(null);

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
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadIncidents = async () => {
    try {
      const [res, sessionRes] = await Promise.all([api.getIncidents(), api.getCurrentSession()]);
      if (res.success) {
        setIncidents(res.incidents);
      }
      setActiveSession(sessionRes.hasOpenSession ? sessionRes.session : null);
      setSiteInfo(sessionRes.site || null);
    } catch (err: any) {
      console.warn('Failed to load incidents:', err);
      setNotice({
        title: 'Data Kejadian Belum Termuat',
        message: err?.message || 'Riwayat kejadian belum dapat dimuat. Coba kembali beberapa saat lagi.',
        tone: 'warning',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
  }, []);

  useEffect(() => {
    if (!showCreateModal) return;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps(null);
      setGpsMessage('GPS tidak tersedia. Laporan tetap dapat dibuat dengan Area Kejadian yang wajib diisi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGpsMessage(null);
      },
      (error) => {
        console.warn('[Incident GPS]', error.message);
        setGps(null);
        setGpsMessage('GPS belum diperoleh. Pastikan Area Kejadian ditulis jelas.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  }, [showCreateModal]);

  const resetForm = () => {
    setCategory('INSIDENTIL');
    setSeverity('RENDAH');
    setTitle('');
    setLocationText('');
    setChronology('');
    setInitialAction('');
    setEscalated(false);
    setEscalatedTo('SUPERVISOR / DANRU');
    setPoliceReportNo('');
    setPhotoUrls([]);
    setNotes('');
    setGps(null);
    setGpsMessage(null);
  };

  const handleCreateIncident = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedLocation = locationText.trim();
    const normalizedChronology = chronology.trim();
    const normalizedInitialAction = initialAction.trim();

    if (!normalizedTitle || !normalizedLocation || !normalizedChronology || !normalizedInitialAction) {
      setNotice({
        title: 'Data Belum Lengkap',
        message: 'Judul, Area Kejadian, kronologi, dan tindakan awal wajib diisi.',
        tone: 'warning',
      });
      return;
    }
    if (photoUrls.length < 3 || photoUrls.length > 5) {
      setNotice({
        title: 'Dokumentasi Belum Lengkap',
        message: 'Laporan kejadian membutuhkan minimal 3 dan maksimal 5 foto live.',
        tone: 'warning',
      });
      return;
    }
    if (escalated && !escalatedTo.trim()) {
      setNotice({
        title: 'Tujuan Eskalasi Wajib',
        message: 'Isi pihak atau jabatan yang menerima eskalasi kejadian.',
        tone: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createIncident({
        category,
        severity,
        title: normalizedTitle,
        locationText: normalizedLocation,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        chronology: normalizedChronology,
        initialAction: normalizedInitialAction,
        escalated,
        escalatedTo: escalated ? escalatedTo.trim() : undefined,
        policeReportNo: policeReportNo.trim() || undefined,
        photoUrl: photoUrls[0],
        photoUrls,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        setShowCreateModal(false);
        resetForm();
        await loadIncidents();
        setNotice({
          title: 'Laporan Kejadian Tersimpan',
          message: 'Laporan berhasil dikirim dengan status OPEN dan bukti foto sudah tercatat.',
          tone: 'success',
        });
      }
    } catch (err: any) {
      setNotice({
        title: 'Laporan Kejadian Gagal',
        message: err?.message || 'Gagal menyimpan laporan kejadian.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canCreate = user?.role === 'ANGGOTA' && !!activeSession?.startDocumentationCompleted;
  const canManageStatus = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const sortedIncidents = useMemo(
    () => [...incidents].sort((a, b) => new Date(b.incidentAt).getTime() - new Date(a.incidentAt).getTime()),
    [incidents],
  );

  const openCount = incidents.filter((incident) => incident.status === 'OPEN').length;
  const criticalCount = incidents.filter(
    (incident) => incident.status !== 'CLOSED' && (incident.severity === 'TINGGI' || incident.severity === 'KRITIS'),
  ).length;

  const handleUpdateStatus = async (id: string, newStatus: IncidentStatus) => {
    try {
      const res = await api.updateIncidentStatus(id, newStatus);
      if (res.success) {
        await loadIncidents();
      }
    } catch (err: any) {
      setNotice({
        title: 'Status Tidak Berubah',
        message: err?.message || 'Gagal memperbarui status kejadian.',
        tone: 'danger',
      });
    }
  };

  const statusClass = (status: IncidentStatus) =>
    status === 'OPEN'
      ? 'border-red-500/30 bg-red-500/15 text-red-300'
      : status === 'FOLLOW_UP'
        ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
        : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';

  const severityClass = (value: IncidentSeverity) =>
    value === 'KRITIS'
      ? 'border-red-500/40 bg-red-600 text-white'
      : value === 'TINGGI'
        ? 'border-amber-500/40 bg-amber-600 text-white'
        : value === 'SEDANG'
          ? 'border-yellow-500/40 bg-yellow-600/20 text-yellow-300'
          : 'border-slate-700 bg-slate-800 text-slate-300';

  return (
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
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
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-300">Incident Report</p>
              <h1 className="mt-0.5 text-base font-black tracking-tight text-white">Lapor Kejadian</h1>
              <p className="truncate text-[11px] font-medium text-slate-400">{siteInfo?.name || user?.siteId || 'Site penugasan'}</p>
            </div>
          </div>
          {canCreate ? (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-amber-950/40 transition hover:bg-amber-500"
            >
              <Plus className="h-4 w-4" />
              <span>Lapor</span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 pt-4">
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-red-300">Open</p>
            <p className="mt-1 text-2xl font-black text-white">{openCount}</p>
            <p className="text-[10px] text-slate-500">kejadian aktif</p>
          </div>
          <div className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">Atensi</p>
            <p className="mt-1 text-2xl font-black text-white">{criticalCount}</p>
            <p className="text-[10px] text-slate-500">tinggi / kritis</p>
          </div>
        </section>

        {!canCreate && user?.role === 'ANGGOTA' ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-black text-white">LAPORAN LAPANGAN TERKUNCI</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  Kejadian dapat dibuat setelah Session aktif dan Naik Jaga selesai.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-900" />)}
          </div>
        ) : sortedIncidents.length === 0 ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-7 text-center text-slate-400">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500/60" />
            <p className="mt-3 text-sm font-bold">Belum ada laporan kejadian.</p>
            <p className="mt-1 text-xs text-slate-500">Situasi Site belum memiliki insiden tercatat.</p>
            {canCreate ? (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white"
              >
                <Plus className="h-4 w-4" />
                Buat Laporan
              </button>
            ) : null}
          </section>
        ) : (
          <section className="space-y-2">
            {sortedIncidents.map((incident) => {
              const expanded = expandedIncidentId === incident.id;
              const photos = incident.photoUrls?.length ? incident.photoUrls : incident.photoUrl ? [incident.photoUrl] : [];
              return (
                <article
                  key={incident.id}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-lg shadow-black/10"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedIncidentId(expanded ? null : incident.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${severityClass(incident.severity)}`}>
                            {incident.severity}
                          </span>
                          <span className="rounded-full border border-blue-800/60 bg-blue-950/30 px-2 py-0.5 font-mono text-[9px] font-black text-blue-300">
                            {incident.category}
                          </span>
                          {incident.escalated ? (
                            <span className="rounded-full border border-red-800 bg-red-950/40 px-2 py-0.5 text-[9px] font-black text-red-300">DIESKALASI</span>
                          ) : null}
                        </div>
                        <h2 className="mt-2 truncate text-sm font-black text-white">{incident.title}</h2>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{incident.locationText}</span>
                          <Clock className="ml-1 h-3 w-3" />
                          <span>{new Date(incident.incidentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(incident.status)}`}>
                          {incident.status}
                        </span>
                        {expanded ? <ChevronUp className="ml-auto mt-2 h-4 w-4 text-slate-500" /> : <ChevronDown className="ml-auto mt-2 h-4 w-4 text-slate-500" />}
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="space-y-3 border-t border-slate-800 px-4 pb-4 pt-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5">
                        <p><span className="font-bold text-slate-400">Kronologi:</span> <span className="text-slate-200">{incident.chronology}</span></p>
                        <p className="mt-2"><span className="font-bold text-slate-400">Tindakan Awal:</span> <span className="text-slate-200">{incident.initialAction}</span></p>
                        {incident.notes ? <p className="mt-2"><span className="font-bold text-slate-400">Catatan:</span> <span className="text-slate-200">{incident.notes}</span></p> : null}
                        {incident.escalatedTo ? <p className="mt-2"><span className="font-bold text-slate-400">Eskalasi:</span> <span className="text-amber-300">{incident.escalatedTo}</span></p> : null}
                        {incident.policeReportNo ? <p className="mt-2"><span className="font-bold text-slate-400">No. LP:</span> <span className="font-mono text-amber-300">{incident.policeReportNo}</span></p> : null}
                      </div>

                      {photos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {photos.slice(0, 3).map((photo, index) => (
                            <div key={index} className="aspect-square overflow-hidden rounded-xl border border-slate-800 bg-black">
                              <img src={photo} alt={`Bukti kejadian ${index + 1}`} className="h-full w-full object-cover" />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {photos.length > 3 ? <p className="text-[10px] font-bold text-slate-500">+{photos.length - 3} foto lain tersimpan di Galeri.</p> : null}

                      {canManageStatus ? (
                        <div className="flex flex-wrap justify-end gap-1.5 border-t border-slate-800/80 pt-3">
                          {incident.status !== 'OPEN' ? (
                            <button type="button" onClick={() => void handleUpdateStatus(incident.id, 'OPEN')} className="rounded-lg border border-red-800/50 bg-slate-800 px-2.5 py-1.5 text-[10px] font-black text-red-300">OPEN</button>
                          ) : null}
                          {incident.status !== 'FOLLOW_UP' ? (
                            <button type="button" onClick={() => void handleUpdateStatus(incident.id, 'FOLLOW_UP')} className="rounded-lg border border-amber-800/50 bg-slate-800 px-2.5 py-1.5 text-[10px] font-black text-amber-300">FOLLOW UP</button>
                          ) : null}
                          {incident.status !== 'CLOSED' ? (
                            <button type="button" onClick={() => void handleUpdateStatus(incident.id, 'CLOSED')} className="rounded-lg border border-emerald-800/50 bg-slate-800 px-2.5 py-1.5 text-[10px] font-black text-emerald-300">CLOSED</button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </main>

      <OpsDialog
        isOpen={showCreateModal}
        onClose={() => {
          if (!submitting) setShowCreateModal(false);
        }}
        title="Laporan Kejadian Lapangan"
        description="Isi fakta kejadian, tindakan awal, dan 3–5 foto live."
        tone="warning"
        size="md"
        busy={submitting}
        footer={
          <button
            type="button"
            disabled={submitting || photoUrls.length < 3 || photoUrls.length > 5}
            onClick={() => {
              const form = document.getElementById('incident-create-form') as HTMLFormElement | null;
              form?.requestSubmit();
            }}
            className="ops-btn-primary min-h-12 w-full px-4 disabled:opacity-40"
          >
            {submitting ? 'MENYIMPAN LAPORAN...' : 'KIRIM LAPORAN KEJADIAN'}
          </button>
        }
      >
        <form id="incident-create-form" onSubmit={handleCreateIncident} className="space-y-4 text-xs">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">1. Identitas Kejadian</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="font-semibold text-slate-300">Kategori
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as IncidentCategory)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-normal text-white outline-none"
                >
                  {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="font-semibold text-slate-300">Area Kejadian
                <input
                  required
                  value={locationText}
                  onChange={(event) => setLocationText(event.target.value)}
                  placeholder="Gerbang / jalur / pos"
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-normal text-white outline-none"
                />
              </label>
            </div>

            <label className="mt-3 block font-semibold text-slate-300">Judul Ringkas
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Contoh: Pagar perimeter timur ditemukan kendur"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-normal text-white outline-none"
              />
            </label>

            <div className="mt-3">
              <p className="mb-1.5 font-semibold text-slate-300">Severity</p>
              <div className="grid grid-cols-4 gap-1.5">
                {SEVERITY_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSeverity(value)}
                    className={`min-h-10 rounded-xl border px-1 text-[10px] font-black ${
                      severity === value ? severityClass(value) : 'border-slate-700 bg-slate-800 text-slate-500'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="flex items-center gap-2">
                <MapPin className={`h-4 w-4 ${gps ? 'text-emerald-300' : 'text-slate-500'}`} />
                <div>
                  <p className="text-[10px] font-black text-slate-300">{gps ? 'GPS TERCATAT' : 'GPS OPSIONAL'}</p>
                  <p className="text-[9px] text-slate-500">
                    {gps ? `Akurasi ±${gps.accuracy.toFixed(0)}m` : gpsMessage || 'Mengambil posisi perangkat...'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">2. Kronologi & Tindakan</p>
            <label className="mt-3 block font-semibold text-slate-300">Kronologi
              <textarea
                required
                rows={4}
                value={chronology}
                onChange={(event) => setChronology(event.target.value)}
                placeholder="Uraikan apa yang terjadi, waktu, dan kondisi awal..."
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal leading-5 text-white outline-none"
              />
            </label>
            <label className="mt-3 block font-semibold text-slate-300">Tindakan Awal
              <textarea
                required
                rows={3}
                value={initialAction}
                onChange={(event) => setInitialAction(event.target.value)}
                placeholder="Jelaskan tindakan pengamanan awal yang sudah dilakukan..."
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal leading-5 text-white outline-none"
              />
            </label>
            <label className="mt-3 block font-semibold text-slate-300">Catatan Tambahan
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal text-white outline-none"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">3. Eskalasi</p>
            <label className="mt-3 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={escalated}
                onChange={(event) => setEscalated(event.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="font-semibold text-slate-300">Kejadian sudah / perlu dieskalasi</span>
            </label>

            {escalated ? (
              <label className="mt-3 block font-semibold text-slate-300">Ditujukan Kepada
                <input
                  required
                  value={escalatedTo}
                  onChange={(event) => setEscalatedTo(event.target.value)}
                  placeholder="Danru / Chief / Supervisor / Polisi"
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-normal text-white outline-none"
                />
              </label>
            ) : null}

            {(category === 'KECELAKAAN' || category === 'KEHILANGAN' || category === 'MENONJOL') ? (
              <label className="mt-3 block font-semibold text-slate-300">No. Laporan Polisi <span className="font-normal text-slate-500">(opsional)</span>
                <input
                  value={policeReportNo}
                  onChange={(event) => setPoliceReportNo(event.target.value)}
                  placeholder="LP/B/..."
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-normal text-white outline-none"
                />
              </label>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">4. Bukti Foto Live</p>
                <p className="mt-1 text-[10px] text-slate-500">Minimal 3, maksimal 5 foto.</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                photoUrls.length >= 3
                  ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300'
                  : 'border-amber-700 bg-amber-950/40 text-amber-300'
              }`}>
                {photoUrls.length}/5
              </span>
            </div>

            {photoUrls.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {photoUrls.map((photo, index) => (
                  <div key={index} className="relative aspect-square overflow-hidden rounded-xl border border-slate-800 bg-black">
                    <img src={photo} alt={`Bukti ${index + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setPhotoUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                      className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              disabled={photoUrls.length >= 5 || submitting}
              onClick={() => setShowCameraModal(true)}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-dashed border-amber-800/70 px-3 py-2 text-xs font-black text-amber-200 disabled:opacity-40"
            >
              <Camera className="mr-1 h-4 w-4" />
              AMBIL FOTO LIVE ({photoUrls.length}/5)
            </button>
          </section>
        </form>
      </OpsDialog>

      <OpsNoticeDialog
        isOpen={!!notice}
        onClose={() => setNotice(null)}
        title={notice?.title || 'Informasi'}
        message={notice?.message || ''}
        tone={notice?.tone || 'info'}
      />

      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(base64) => setPhotoUrls((items) => items.length < 5 ? [...items, base64] : items)}
        latitude={gps?.latitude}
        longitude={gps?.longitude}
        gpsAccuracyM={gps?.accuracy}
        siteLabel={siteInfo?.code || siteInfo?.id || activeSession?.siteId}
      />
    </div>
  );
};
