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
              <h1 className="font-extrabold text-white text-base">Buku Mutasi</h1>
              <p className="text-[11px] text-slate-400 font-medium">Sertigas & Serah Terima Barang</p>
            </div>
          </div>
          {canCreate && activeSession?.startDocumentationCompleted ? <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-blue-950/50"
          >
            <Plus className="w-4 h-4" />
            <span>Serah Terima Barang</span>
          </button> : null}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-2"><button onClick={() => setActiveTab('SERTIGAS')} className={`rounded-xl p-2 text-xs font-bold ${activeTab === 'SERTIGAS' ? 'bg-blue-600' : 'text-slate-400'}`}>SERTIGAS</button><button onClick={() => setActiveTab('BARANG')} className={`rounded-xl p-2 text-xs font-bold ${activeTab === 'BARANG' ? 'bg-blue-600' : 'text-slate-400'}`}>SERAH TERIMA BARANG</button></div>
        {filteredHandovers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium">Belum ada catatan {activeTab === 'SERTIGAS' ? 'Sertigas' : 'Serah Terima Barang'}.</p>
            {canCreate && activeTab === 'BARANG' && activeSession?.startDocumentationCompleted ? <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Buat Serah Terima Barang
            </button> : null}
          </div>
        ) : (
          filteredHandovers.map((h) => (
            <div
              key={h.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{h.handoverType}</span>
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
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
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
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 font-mono">
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
                <div className="text-xs p-2.5 bg-amber-950/30 border border-amber-900/40 rounded-xl text-amber-200">
                  <strong>Catatan Pending:</strong> {h.outstandingIssues}
                </div>
              )}
              {h.itemName ? <div className="rounded-xl bg-slate-950 p-2.5 text-xs"><b>{h.itemName}</b> • Jumlah {h.itemQuantity} • {h.itemCondition}<div className="mt-1 text-slate-400">Dari {h.handedFrom} → {h.handedTo}</div></div> : null}

              {h.photoUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-800 aspect-video max-h-40">
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
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1.5 transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Serah Terima Barang / TARUNA</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateHandover} className="space-y-3 text-xs">
              <div className="rounded-xl bg-slate-950 p-3 text-slate-300"><div>Member: <b>{user?.name}</b> ({user?.npk})</div><div>Customer: {activeSession?.customerId} • Site: {activeSession?.siteId}</div><div>{activeSession?.shiftCode} • Operational Date {activeSession?.shiftDate}</div></div>
              <div className="grid grid-cols-2 gap-2"><label className="font-semibold">Jenis / Nama Barang atau Taruna<input required value={itemName} onChange={(e) => setItemName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-normal" /></label><label className="font-semibold">Jumlah<input required value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-normal" /></label><label className="font-semibold">Diserahkan Dari<input required value={handedFrom} onChange={(e) => setHandedFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-normal" /></label><label className="font-semibold">Diserahkan Kepada<input required value={handedTo} onChange={(e) => setHandedTo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-normal" /></label></div>
              <label className="block font-semibold">Kondisi Barang<input required value={itemCondition} onChange={(e) => setItemCondition(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-normal" /></label>
              <div><span className="font-semibold">Apakah ini TARUNA / dokumentasi khusus?</span><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" onClick={() => setIsTaruna(false)} className={`rounded-xl p-2 font-bold ${!isTaruna ? 'bg-blue-600' : 'bg-slate-800'}`}>TIDAK</button><button type="button" onClick={() => setIsTaruna(true)} className={`rounded-xl p-2 font-bold ${isTaruna ? 'bg-amber-600' : 'bg-slate-800'}`}>YA</button></div></div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Status Kondisi Pos/Site:</label>
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
                <label className="font-semibold text-slate-300 block mb-1">Catatan {isTaruna ? '(Wajib)' : ''}:</label>
                <textarea
                  rows={2}
                  value={outstandingIssues}
                  onChange={(e) => setOutstandingIssues(e.target.value)}
                  placeholder="Informasi penting untuk shift berikutnya..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              {/* Photo Evidence Capture */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Dokumentasi {isTaruna ? '(3–5 foto wajib)' : '(minimal 1 foto)'}:</label>
                <div className="grid grid-cols-3 gap-2">{photoUrls.map((photo, index) => <div key={index} className="relative aspect-square overflow-hidden rounded-xl"><img src={photo} alt={`Dokumentasi ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => setPhotoUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1">✕</button></div>)}</div>
                <button type="button" disabled={photoUrls.length >= 5} onClick={() => { setCameraTarget('ITEM'); setShowCameraModal(true); }} className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-700 py-2.5 text-slate-400 disabled:opacity-40"><Camera className="mr-1 inline h-4 w-4" />Tambah Foto ({photoUrls.length}/5)</button>
              </div>

              <button
                type="submit"
                disabled={submitting || (!isTaruna && photoUrls.length < 1) || (isTaruna && (photoUrls.length < 3 || photoUrls.length > 5 || !outstandingIssues.trim()))}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                {submitting ? 'Menyimpan...' : 'SIMPAN SERAH TERIMA BARANG'}
              </button>
            </form>
          </div>
        </div>
      )}

      {canCreate && activeSession && !activeSession.startDocumentationCompleted ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl border border-blue-800 bg-slate-900 p-5"><div><h2 className="font-black text-blue-300">SERTIGAS NAIK JAGA</h2><p className="text-xs text-slate-400">Wajib disimpan sebelum patroli dapat dimulai.</p></div><div className="rounded-xl bg-slate-950 p-3 text-xs"><div>Member: <b>{user?.name}</b></div><div>NPK: {user?.npk}</div><div>Customer: {activeSession.customerId}</div><div>Site: {activeSession.siteId}</div><div>Shift: {activeSession.shiftCode}</div><div>Tanggal Operasional: {activeSession.shiftDate}</div><div>Waktu: {new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</div></div>{startPhotoUrl ? <img src={startPhotoUrl} alt="Sertigas Naik Jaga" className="max-h-64 w-full rounded-xl object-cover" /> : <button onClick={() => { setCameraTarget('START'); setShowCameraModal(true); }} className="w-full rounded-xl border-2 border-dashed border-slate-700 p-4 text-sm font-bold"><Camera className="mr-2 inline h-5 w-5" />AMBIL FOTO SERTIGAS</button>}<button disabled={!startPhotoUrl || submitting} onClick={() => void handleStartDocumentation()} className="w-full rounded-xl bg-blue-600 p-3 text-sm font-bold disabled:opacity-40">SIMPAN & LANJUT PATROLI</button></div></div> : null}

      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(base64) => { if (cameraTarget === 'START') setStartPhotoUrl(base64); else setPhotoUrls((items) => items.length < 5 ? [...items, base64] : items); }}
      />
    </div>
  );
};
