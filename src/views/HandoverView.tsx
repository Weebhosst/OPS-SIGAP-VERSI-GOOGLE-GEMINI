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
import { ShiftHandover, HandoverType, ConditionStatus } from '../types/ops';
import { CameraCaptureModal } from '../components/CameraCaptureModal';

export const HandoverView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Form state
  const [handoverType, setHandoverType] = useState<HandoverType>('SERAH_TERIMA');
  const [conditionStatus, setConditionStatus] = useState<ConditionStatus>('BAIK');
  const [personnelStatus, setPersonnelStatus] = useState('Regu lengkap 4 personil siap');
  const [equipmentStatus, setEquipmentStatus] = useState('HT, senter, rompi lengkap & normal');
  const [keysStatus, setKeysStatus] = useState('Kunci pos BB92 & portal lengkap di papan');
  const [vehicleStatus, setVehicleStatus] = useState('Kendaraan operasional patroli prima');
  const [outstandingIssues, setOutstandingIssues] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadHandovers = async () => {
    try {
      const res = await api.getHandovers();
      if (res.success) {
        setHandovers(res.handovers);
      }
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
        handoverType,
        conditionStatus,
        personnelStatus,
        equipmentStatus,
        keysStatus,
        vehicleStatus,
        outstandingIssues,
        handoverNotes,
        photoUrl: photoUrl || undefined,
      });

      if (res.success) {
        setShowCreateModal(false);
        setPhotoUrl(null);
        setOutstandingIssues('');
        setHandoverNotes('');
        await loadHandovers();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan serah terima jaga');
    } finally {
      setSubmitting(false);
    }
  };

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
              <h1 className="font-extrabold text-white text-base">Serah Terima Jaga</h1>
              <p className="text-[11px] text-slate-400 font-medium">Buku Mutasi Operasional</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-lg shadow-blue-950/50"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Mutasi</span>
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {handovers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium">Belum ada catatan serah terima jaga hari ini.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Buat Serah Terima Baru
            </button>
          </div>
        ) : (
          handovers.map((h) => (
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
              <h3 className="font-bold text-white text-sm">Formulir Serah Terima Jaga</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateHandover} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Jenis Mutasi:</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['SERAH_TERIMA', 'NAIK_JAGA', 'TURUN_JAGA'] as HandoverType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setHandoverType(t)}
                      className={`py-2 px-1 text-center rounded-xl font-bold border ${
                        handoverType === t
                          ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

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
                <label className="font-semibold text-slate-300 block mb-1">Status Personil:</label>
                <input
                  type="text"
                  value={personnelStatus}
                  onChange={(e) => setPersonnelStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Status Peralatan & HT:</label>
                <input
                  type="text"
                  value={equipmentStatus}
                  onChange={(e) => setEquipmentStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Kunci & Inventaris Pos:</label>
                <input
                  type="text"
                  value={keysStatus}
                  onChange={(e) => setKeysStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Catatan Khusus / Pendingan:</label>
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
                <label className="font-semibold text-slate-300 block mb-1">Bukti Foto Serah Terima:</label>
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
                    <span>Ambil Foto Live Bukti Pos/Regu</span>
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                {submitting ? 'Menyimpan...' : 'KIRIM SERAH TERIMA JAGA'}
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
