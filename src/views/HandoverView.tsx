/**
 * OPS SIGAP — Handover / Serah Terima Jaga Module
 */

import React, { useEffect, useState } from 'react';
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
import { ShiftHandover, ConditionStatus, PatrolSession } from '../types/ops';
import { CameraCaptureModal } from '../components/CameraCaptureModal';

export const HandoverView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [activeSession, setActiveSession] = useState<PatrolSession | null>(null);
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
  const [handedFrom, setHandedFrom] = useState('');
  const [handedTo, setHandedTo] = useState('');
  const [isTaruna, setIsTaruna] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadHandovers = async () => {
    try {
      const [res, sessionRes] = await Promise.all([api.getHandovers(), api.getCurrentSession()]);
      if (res.success) {
        setHandovers(res.handovers);
      }
      setActiveSession(sessionRes.hasOpenSession ? sessionRes.session : null);
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
        handedFrom,
        handedTo,
        isTaruna,
      });

      if (res.success) {
        setShowCreateModal(false);
        setPhotoUrls([]);
        setItemName('');
        setItemQuantity('');
        setOutstandingIssues('');
        await loadHandovers();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan serah terima jaga');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartDocumentation = async () => {
    if (!activeSession || !startPhotoUrl) return;
    setSubmitting(true);
    try {
      await api.submitStartDocumentation(activeSession.id, startPhotoUrl);
      setStartPhotoUrl(null);
      await loadHandovers();
      setActiveTab('SERTIGAS');
    } catch (error: any) { alert(error.message || 'Gagal menyimpan Sertigas Naik Jaga.'); }
    finally { setSubmitting(false); }
  };

  const canCreate = user?.role === 'ANGGOTA';
  const filteredHandovers = handovers.filter((handover) => activeTab === 'SERTIGAS' ? handover.handoverType === 'NAIK_JAGA' || handover.handoverType === 'TURUN_JAGA' : handover.handoverType === 'SERAH_TERIMA');

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await api.ackHandover(id);
      if (res.success) {
        await loadHandovers();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mengonfirmasi');
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

              {/* Ack Action */}
              {h.status !== 'ACKNOWLEDGED' && h.fromUserId !== user?.id && (
                <button
                  onClick={() => handleAcknowledge(h.id)}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Konfirmasi Terima Jaga</span>
                </button>
              )}
            </div>
          ))
        )}
      </main>

      {/* Create Handover Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md backdrop-blur-md">
          <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700/90 bg-[#0f172a] p-5 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white">Serah Terima Barang / TARUNA</h3>
              <button onClick={() => setShowCreateModal(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Tutup formulir serah terima">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateHandover} className="space-y-4 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-slate-300"><div>Member: <b>{user?.name}</b> ({user?.npk})</div><div>Customer: {activeSession?.customerId} • Site: {activeSession?.siteId}</div><div>{activeSession?.shiftCode} • Operational Date {activeSession?.shiftDate}</div></div>
              <div className="grid grid-cols-2 gap-2"><label className="font-semibold">Jenis / Nama Barang atau Taruna<input required value={itemName} onChange={(e) => setItemName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></label><label className="font-semibold">Jumlah<input required value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></label><label className="font-semibold">Diserahkan Dari<input required value={handedFrom} onChange={(e) => setHandedFrom(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></label><label className="font-semibold">Diserahkan Kepada<input required value={handedTo} onChange={(e) => setHandedTo(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></label></div>
              <label className="block font-semibold">Kondisi Barang<input required value={itemCondition} onChange={(e) => setItemCondition(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></label>
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
                disabled={submitting || (!isTaruna && photoUrls.length < 1) || (isTaruna && (photoUrls.length < 3 || photoUrls.length > 5 || !outstandingIssues.trim()))}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'SIMPAN SERAH TERIMA BARANG'}
              </button>
            </form>
          </div>
        </div>
      )}

      {canCreate && activeSession && !activeSession.startDocumentationCompleted ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"><div className="w-full max-w-md space-y-4 rounded-3xl border border-blue-800/80 bg-[#0f172a] p-5 shadow-2xl shadow-black/50"><div><h2 id="sertigas-start-title" className="font-black text-blue-300">SERTIGAS NAIK JAGA</h2><p className="text-xs text-slate-400">Wajib disimpan sebelum patroli dapat dimulai.</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs"><div>Member: <b>{user?.name}</b></div><div>NPK: {user?.npk}</div><div>Customer: {activeSession.customerId}</div><div>Site: {activeSession.siteId}</div><div>Shift: {activeSession.shiftCode}</div><div>Tanggal Operasional: {activeSession.shiftDate}</div><div>Waktu: {new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</div></div>{startPhotoUrl ? <img src={startPhotoUrl} alt="Sertigas Naik Jaga" className="max-h-64 w-full rounded-xl object-cover" /> : <button onClick={() => { setCameraTarget('START'); setShowCameraModal(true); }} className="flex min-h-14 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-700 p-4 text-sm font-black text-slate-200 transition hover:border-blue-600 hover:bg-blue-950/20"><Camera className="mr-2 inline h-5 w-5" />AMBIL FOTO SERTIGAS</button>}<button disabled={!startPhotoUrl || submitting} onClick={() => void handleStartDocumentation()} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 p-3 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-40">SIMPAN & LANJUT PATROLI</button></div></div> : null}

      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(base64) => { if (cameraTarget === 'START') setStartPhotoUrl(base64); else setPhotoUrls((items) => items.length < 5 ? [...items, base64] : items); }}
      />
    </div>
  );
};
