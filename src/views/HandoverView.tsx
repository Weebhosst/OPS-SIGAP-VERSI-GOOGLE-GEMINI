/**
 * OPS SIGAP — Handover / Serah Terima Jaga Module
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  ArrowLeft,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Camera,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { ShiftHandover, ConditionStatus, PatrolSession, Site } from '../types/ops';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { OpsConfirmDialog, OpsNoticeDialog, type OpsDialogTone } from '../components/OpsDialog';

export const HandoverView: React.FC<{ onBack: () => void; onProceedPatrol?: () => void }> = ({ onBack, onProceedPatrol }) => {
  const { user } = useAuth();
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [activeSession, setActiveSession] = useState<PatrolSession | null>(null);
  const [siteInfo, setSiteInfo] = useState<Site | null>(null);
  const [siteMembers, setSiteMembers] = useState<Array<{ id: string; name: string; npk: string }>>([]);
  const [activeTab, setActiveTab] = useState<'SERTIGAS' | 'BARANG'>('SERTIGAS');
  const [cameraTarget, setCameraTarget] = useState<'START' | 'ITEM'>('ITEM');
  const [startPhotoUrl, setStartPhotoUrl] = useState<string | null>(null);

  // Form state
  const [conditionStatus, setConditionStatus] = useState<ConditionStatus>('BAIK');
  const [outstandingIssues, setOutstandingIssues] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [itemName, setItemName] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemCondition, setItemCondition] = useState('BAIK');
  const [toUserId, setToUserId] = useState('');
  const [isTaruna, setIsTaruna] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; tone: OpsDialogTone } | null>(null);
  const [ackTarget, setAckTarget] = useState<ShiftHandover | null>(null);

  const loadHandovers = async () => {
    try {
      const memberDirectoryPromise = user?.role === 'ANGGOTA'
        ? api.getFieldSiteMembers()
        : Promise.resolve({ success: true, members: [] as Array<{ id: string; name: string; npk: string }> });
      const [res, sessionRes, memberRes] = await Promise.all([
        api.getHandovers(),
        api.getCurrentSession(),
        memberDirectoryPromise,
      ]);
      if (res.success) {
        setHandovers(res.handovers);
      }
      if (memberRes.success) {
        setSiteMembers(memberRes.members);
      }
      setActiveSession(sessionRes.hasOpenSession ? sessionRes.session : null);
      setSiteInfo(sessionRes.site || null);
    } catch (err) {
      console.warn('Failed to load handovers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHandovers();
  }, []);

  const handleCreateHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createHandover({
        handoverType: 'SERAH_TERIMA',
        conditionStatus,
        personnelStatus: 'Tercatat otomatis dari shift aktif',
        equipmentStatus: 'Tercatat pada detail barang',
        keysStatus: 'Tercatat pada detail barang',
        vehicleStatus: 'Tercatat pada detail barang',
        outstandingIssues,
        handoverNotes: outstandingIssues,
        photoUrl: photoUrls[0] || undefined,
        photoUrls,
        itemName,
        itemQuantity,
        itemCondition,
        toUserId,
        isTaruna,
      });

      if (res.success) {
        setShowCreateModal(false);
        setPhotoUrls([]);
        setItemName('');
        setItemQuantity('');
        setToUserId('');
        setOutstandingIssues('');
        setConditionStatus('BAIK');
        setItemCondition('BAIK');
        setIsTaruna(false);
        await loadHandovers();
        setNotice({
          title: 'Serah Terima Tersimpan',
          message: 'Data berhasil disimpan dan menunggu konfirmasi dari anggota penerima.',
          tone: 'success',
        });
      }
    } catch (err: any) {
      setNotice({ title: 'Serah Terima Gagal', message: err.message || 'Gagal menyimpan serah terima jaga.', tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartDocumentation = async () => {
    if (!activeSession || !startPhotoUrl) return;
    setSubmitting(true);
    try {
      const res = await api.submitStartDocumentation(activeSession.id, startPhotoUrl);
      if (res.success) {
        setStartPhotoUrl(null);
        await loadHandovers();
        setActiveTab('SERTIGAS');
        if (onProceedPatrol) {
          onProceedPatrol();
        } else {
          setNotice({
            title: 'Naik Jaga Tersimpan',
            message: 'Sertigas Naik Jaga selesai. Patroli sudah dapat dimulai.',
            tone: 'success',
          });
        }
      }
    } catch (error: any) {
      setNotice({ title: 'Sertigas Gagal', message: error.message || 'Gagal menyimpan Sertigas Naik Jaga.', tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  const canCreate = user?.role === 'ANGGOTA';
  const filteredHandovers = useMemo(
    () =>
      handovers
        .filter((handover) =>
          activeTab === 'SERTIGAS'
            ? handover.handoverType === 'NAIK_JAGA' || handover.handoverType === 'TURUN_JAGA'
            : handover.handoverType === 'SERAH_TERIMA',
        )
        .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime()),
    [activeTab, handovers],
  );

  const incomingPending = handovers.filter(
    (handover) =>
      handover.handoverType === 'SERAH_TERIMA'
      && handover.toUserId === user?.id
      && handover.status !== 'ACKNOWLEDGED',
  ).length;
  const outgoingPending = handovers.filter(
    (handover) =>
      handover.handoverType === 'SERAH_TERIMA'
      && handover.fromUserId === user?.id
      && handover.status !== 'ACKNOWLEDGED',
  ).length;

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await api.ackHandover(id);
      if (res.success) {
        setAckTarget(null);
        await loadHandovers();
        setNotice({
          title: 'Serah Terima Diterima',
          message: 'Konfirmasi penerimaan sudah tercatat pada sistem.',
          tone: 'success',
        });
      }
    } catch (err: any) {
      setNotice({ title: 'Konfirmasi Gagal', message: err.message || 'Gagal mengonfirmasi serah terima.', tone: 'danger' });
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-300">Shift Handover</p><h1 className="mt-0.5 text-base font-black tracking-tight text-white">Buku Mutasi</h1></div>
              <p className="text-[11px] text-slate-400 font-medium">Sertigas & Serah Terima Barang</p>
            </div>
          </div>
          {canCreate && activeSession?.startDocumentationCompleted ? <button
            onClick={() => setShowCreateModal(true)}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
          >
            <Plus className="w-4 h-4" />
            <span>Serah Terima Barang</span>
          </button> : null}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 pt-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-2 shadow-lg shadow-black/10"><button onClick={() => setActiveTab('SERTIGAS')} className={`min-h-10 rounded-xl px-3 py-2 text-xs font-black transition ${activeTab === 'SERTIGAS' ? 'bg-blue-600' : 'text-slate-400'}`}>SERTIGAS</button><button onClick={() => setActiveTab('BARANG')} className={`min-h-10 rounded-xl px-3 py-2 text-xs font-black transition ${activeTab === 'BARANG' ? 'bg-blue-600' : 'text-slate-400'}`}>SERAH TERIMA BARANG</button></div>
        {activeTab === 'BARANG' ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-amber-800/60 bg-amber-950/25 p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">Untuk Saya</p>
              <p className="mt-1 text-2xl font-black text-white">{incomingPending}</p>
              <p className="text-[10px] text-slate-400">menunggu konfirmasi</p>
            </div>
            <div className="rounded-2xl border border-blue-800/60 bg-blue-950/25 p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-blue-300">Dari Saya</p>
              <p className="mt-1 text-2xl font-black text-white">{outgoingPending}</p>
              <p className="text-[10px] text-slate-400">belum diterima</p>
            </div>
          </div>
        ) : null}
        {filteredHandovers.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center text-slate-400 shadow-lg shadow-black/10">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm font-bold">Belum ada catatan {activeTab === 'SERTIGAS' ? 'Sertigas' : 'Serah Terima Barang'}.</p>
            {canCreate && activeTab === 'BARANG' && activeSession?.startDocumentationCompleted ? <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-500"
            >
              <Plus className="w-4 h-4" /> Buat Serah Terima Barang
            </button> : null}
          </div>
        ) : (
          filteredHandovers.map((h) => (
            <div
              key={h.id}
              className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">{h.handoverType}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        h.conditionStatus === 'BAIK'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : h.conditionStatus === 'PERLU_PERHATIAN'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}
                    >
                      {h.conditionStatus}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-400">
                    {h.shiftCode} • {new Date(h.eventAt).toLocaleTimeString('id-ID')} WIB
                  </div>
                  {h.handoverType === 'SERAH_TERIMA' ? (
                    <p className={`mt-1 text-[10px] font-bold ${
                      h.toUserId === user?.id ? 'text-amber-300' : h.fromUserId === user?.id ? 'text-blue-300' : 'text-slate-500'
                    }`}>
                      {h.toUserId === user?.id ? 'MASUK UNTUK SAYA' : h.fromUserId === user?.id ? 'DIKIRIM DARI SAYA' : 'MONITORING SITE'}
                    </p>
                  ) : null}
                </div>

                <div className="text-right">
                  {h.status === 'ACKNOWLEDGED' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Diterima
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-amber-400">
                      Menunggu Konfirmasi
                    </span>
                  )}
                </div>
              </div>

              {/* Status details */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs">
                <div>
                  <span className="text-slate-500">Personil:</span> {h.personnelStatus}
                </div>
                <div>
                  <span className="text-slate-500">Peralatan:</span> {h.equipmentStatus}
                </div>
                <div>
                  <span className="text-slate-500">Kunci:</span> {h.keysStatus}
                </div>
                <div>
                  <span className="text-slate-500">Kendaraan:</span> {h.vehicleStatus}
                </div>
              </div>

              {h.outstandingIssues && (
                <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200">
                  <strong>Catatan Pending:</strong> {h.outstandingIssues}
                </div>
              )}
              {h.itemName ? <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs"><b>{h.itemName}</b> • Jumlah {h.itemQuantity} • {h.itemCondition}<div className="mt-1 text-slate-400">Dari {h.handedFrom} → {h.handedTo}</div></div> : null}

              {h.photoUrl && (
                <div className="aspect-video max-h-44 overflow-hidden rounded-xl border border-slate-800">
                  <img
                    src={h.photoUrl}
                    alt="Handover Evidence"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Ack Action — only field members can acknowledge. Monitoring roles are read-only. */}
              {h.status !== 'ACKNOWLEDGED' && user?.role === 'ANGGOTA' && h.toUserId === user?.id && h.fromUserId !== user?.id ? (
                <button
                  onClick={() => setAckTarget(h)}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Konfirmasi Terima Jaga</span>
                </button>
              ) : h.status !== 'ACKNOWLEDGED' && user?.role !== 'ANGGOTA' ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[11px] leading-5 text-slate-400">
                  Konfirmasi penerimaan dilakukan oleh anggota penerima melalui akun ANGGOTA. Admin, Super Admin, dan Chief hanya memonitor status.
                </div>
              ) : null}
            </div>
          ))
        )}
      </main>

      {/* Create Handover Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
          <div className="ops-dialog w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700/90 bg-[#0f172a] p-5 shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="handover-create-title">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="handover-create-title" className="text-sm font-black text-white">Serah Terima Barang / TARUNA</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Tutup formulir serah terima">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateHandover} className="space-y-4 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-slate-300"><div>Member: <b>{user?.name}</b> ({user?.npk})</div><div>Customer: {activeSession?.customerId} • Site: {activeSession?.siteId}</div><div>{activeSession?.shiftCode} • Operational Date {activeSession?.shiftDate}</div></div>
              <div className="grid grid-cols-2 gap-2">
                <label className="font-semibold">Nama Barang / TARUNA
                  <input required value={itemName} onChange={(e) => setItemName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
                </label>
                <label className="font-semibold">Jumlah
                  <input required value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
                </label>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Penyerah</p>
                <p className="mt-1 text-xs font-black text-slate-200">{user?.name} • {user?.npk}</p>
                <p className="mt-1 text-[10px] text-slate-500">Identitas penyerah diambil otomatis dari akun login.</p>
              </div>
              <label className="block font-semibold">Penerima Akun
                <select required value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15">
                  <option value="">Pilih Anggota penerima</option>
                  {siteMembers.map((member) => <option key={member.id} value={member.id}>{member.name} • {member.npk}</option>)}
                </select>
              </label>
              <label className="block font-semibold">Kondisi Barang
                <select required value={itemCondition} onChange={(e) => setItemCondition(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15">
                  <option value="BAIK">BAIK</option>
                  <option value="PERLU_PERHATIAN">PERLU PERHATIAN</option>
                  <option value="BERMASALAH">BERMASALAH</option>
                </select>
              </label>
              <div><span className="font-semibold">Apakah ini TARUNA / dokumentasi khusus?</span><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" onClick={() => setIsTaruna(false)} className={`min-h-10 rounded-xl px-3 py-2 font-black transition ${!isTaruna ? 'bg-blue-600' : 'bg-slate-800'}`}>TIDAK</button><button type="button" onClick={() => setIsTaruna(true)} className={`min-h-10 rounded-xl px-3 py-2 font-black transition ${isTaruna ? 'bg-amber-600' : 'bg-slate-800'}`}>YA</button></div></div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Status Kondisi Pos/Site:</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['BAIK', 'PERLU_PERHATIAN', 'BERMASALAH'] as ConditionStatus[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setConditionStatus(c)}
                      className={`py-2 px-1 text-center rounded-xl font-bold border ${
                        conditionStatus === c
                          ? c === 'BAIK'
                            ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                            : c === 'PERLU_PERHATIAN'
                            ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                            : 'bg-red-600/30 border-red-500 text-red-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {c.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Catatan {isTaruna ? '(Wajib)' : ''}:</label>
                <textarea
                  rows={2}
                  value={outstandingIssues}
                  onChange={(e) => setOutstandingIssues(e.target.value)}
                  placeholder="Informasi penting untuk shift berikutnya..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {/* Photo Evidence Capture */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Dokumentasi {isTaruna ? '(3–5 foto wajib)' : '(minimal 1 foto)'}:</label>
                <div className="grid grid-cols-3 gap-2">{photoUrls.map((photo, index) => <div key={index} className="relative aspect-square overflow-hidden rounded-xl"><img src={photo} alt={`Dokumentasi ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => setPhotoUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1">✕</button></div>)}</div>
                <button type="button" disabled={photoUrls.length >= 5} onClick={() => { setCameraTarget('ITEM'); setShowCameraModal(true); }} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:border-slate-600 hover:bg-slate-800/40 disabled:opacity-40"><Camera className="mr-1 inline h-4 w-4" />Tambah Foto ({photoUrls.length}/5)</button>
              </div>

              <button
                type="submit"
                disabled={submitting || !toUserId || (!isTaruna && photoUrls.length < 1) || (isTaruna && (photoUrls.length < 3 || photoUrls.length > 5 || !outstandingIssues.trim()))}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'SIMPAN SERAH TERIMA BARANG'}
              </button>
            </form>
          </div>
        </div>
      )}

      {canCreate && activeSession && !activeSession.startDocumentationCompleted ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
          <div
            className="ops-dialog w-full max-w-md overflow-hidden rounded-3xl border border-blue-800/80 bg-[#0f172a] shadow-2xl shadow-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sertigas-start-title"
          >
            <div className="border-b border-slate-800 bg-[#08111f] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Step 2 dari 3</p>
              <h2 id="sertigas-start-title" className="mt-1 text-lg font-black text-white">NAIK JAGA</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Session sudah dibuat. Ambil satu foto live Sertigas untuk membuka akses patroli.
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-2 py-2.5">
                  <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black text-white">✓</div>
                  <p className="mt-1 text-[9px] font-black text-emerald-300">SESSION</p>
                </div>
                <div className="rounded-xl border border-blue-700 bg-blue-950/30 px-2 py-2.5">
                  <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">2</div>
                  <p className="mt-1 text-[9px] font-black text-blue-300">NAIK JAGA</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-2 py-2.5">
                  <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-black text-slate-500">3</div>
                  <p className="mt-1 text-[9px] font-black text-slate-500">PATROLI</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Petugas</span>
                  <span className="truncate font-bold text-slate-200">{user?.name} • {user?.npk}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-slate-500">Site</span>
                  <span className="truncate font-bold text-slate-200">{siteInfo?.name || activeSession.siteId}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-slate-500">Shift</span>
                  <span className="font-mono font-bold text-slate-200">{activeSession.shiftCode} • {activeSession.shiftDate}</span>
                </div>
              </div>

              {startPhotoUrl ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-800/70 bg-black">
                    <img src={startPhotoUrl} alt="Sertigas Naik Jaga" className="max-h-72 w-full object-contain" />
                    <span className="absolute left-3 top-3 rounded-full border border-emerald-400/30 bg-emerald-600/90 px-2.5 py-1 text-[10px] font-black text-white">
                      FOTO SIAP
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => { setStartPhotoUrl(null); setCameraTarget('START'); setShowCameraModal(true); }}
                    className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"
                  >
                    AMBIL ULANG FOTO
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setCameraTarget('START'); setShowCameraModal(true); }}
                  className="flex min-h-16 w-full items-center justify-center rounded-2xl border-2 border-dashed border-blue-700/70 bg-blue-950/20 p-4 text-sm font-black text-blue-200 transition hover:bg-blue-950/35"
                >
                  <Camera className="mr-2 h-5 w-5" />
                  AMBIL FOTO NAIK JAGA
                </button>
              )}

              <div className="rounded-xl border border-amber-900/60 bg-amber-950/25 p-3 text-[11px] leading-5 text-amber-200">
                Patroli QR tetap terkunci sampai foto ini tersimpan di server.
              </div>

              <button
                type="button"
                disabled={!startPhotoUrl || submitting}
                onClick={() => void handleStartDocumentation()}
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-blue-600 p-3 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {submitting ? 'MENYIMPAN NAIK JAGA...' : 'SIMPAN & MULAI PATROLI'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OpsConfirmDialog
        isOpen={!!ackTarget}
        onCancel={() => setAckTarget(null)}
        onConfirm={() => ackTarget ? handleAcknowledge(ackTarget.id) : Promise.resolve()}
        title="Konfirmasi Serah Terima"
        message={ackTarget
          ? `Pastikan barang / informasi dari ${ackTarget.handedFrom || 'petugas sebelumnya'} sudah diterima dan diperiksa.`
          : 'Pastikan serah terima sudah diterima.'}
        tone="warning"
        confirmLabel="YA, SAYA TERIMA"
        cancelLabel="BATAL"
      >
        {ackTarget ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5">
            <p className="font-black text-white">{ackTarget.itemName || 'Serah Terima'}</p>
            <p className="mt-1 text-slate-400">Jumlah {ackTarget.itemQuantity || '-'} • {ackTarget.itemCondition || '-'}</p>
            {ackTarget.outstandingIssues ? <p className="mt-2 text-amber-300">{ackTarget.outstandingIssues}</p> : null}
          </div>
        ) : null}
      </OpsConfirmDialog>

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
        onCapture={(base64) => { if (cameraTarget === 'START') setStartPhotoUrl(base64); else setPhotoUrls((items) => items.length < 5 ? [...items, base64] : items); }}
        siteLabel={siteInfo?.code || siteInfo?.id || activeSession?.siteId}
      />
    </div>
  );
};
