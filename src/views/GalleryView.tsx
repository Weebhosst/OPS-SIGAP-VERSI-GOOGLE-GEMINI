/**
 * OPS SIGAP — Unified Media Gallery
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon,
  ArrowLeft,
  MapPin,
  Download,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { getJakartaDateParts, getVisibleShiftCodes, MediaGalleryItem, resolveShift, ShiftCode } from '../types/ops';
import { useAuth } from '../context/AuthContext';

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const documentTypeMap: Record<string, string> = { SEMUA: '', SERTIGAS: 'SERTIGAS', PATROL: 'PATROLI_QR', HANDOVER: 'SERAH_TERIMA_BARANG', TARUNA: 'TARUNA', INCIDENT: 'INSIDEN', LAINNYA: 'LAINNYA' };

export const GalleryView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const isSuperAdminDesktop = user?.role === 'SUPER_ADMIN';
  const jakartaNow = getJakartaDateParts();
  const currentShift = resolveShift();
  const [mediaList, setMediaList] = useState<MediaGalleryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'SEMUA' | 'SERTIGAS' | 'PATROL' | 'HANDOVER' | 'TARUNA' | 'INCIDENT' | 'LAINNYA'>(() => {
    if (!user) return 'SEMUA';
    const saved = sessionStorage.getItem(`ops:galleryFilter:${user.id}`);
    return ['SEMUA', 'SERTIGAS', 'PATROL', 'HANDOVER', 'TARUNA', 'INCIDENT', 'LAINNYA'].includes(saved || '') ? saved as any : 'SEMUA';
  });
  const [selectedItem, setSelectedItem] = useState<MediaGalleryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(jakartaNow.month);
  const [selectedYear, setSelectedYear] = useState(jakartaNow.year);
  const [selectedDay, setSelectedDay] = useState(0);
  const [appliedPeriod, setAppliedPeriod] = useState({ day: 0, month: jakartaNow.month, year: jakartaNow.year });
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({ today: true, [`today-${currentShift.code}`]: true }));
  const visibleToday = useMemo(() => getVisibleShiftCodes(), []);

  const loadMedia = async (offset = 0) => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        month: String(appliedPeriod.month),
        year: String(appliedPeriod.year),
        limit: '48',
        offset: String(offset),
      };
      if (appliedPeriod.day) params.date = `${appliedPeriod.year}-${String(appliedPeriod.month).padStart(2, '0')}-${String(appliedPeriod.day).padStart(2, '0')}`;
      if (documentTypeMap[activeFilter]) params.documentType = documentTypeMap[activeFilter];
      const res = await api.getGallery(params);
      if (res.success) {
        setMediaList((current) => offset ? [...current, ...res.media] : res.media);
        setPagination({ total: res.pagination.total, hasMore: res.pagination.hasMore });
        setCounts(res.counts || {});
      }
    } catch (err) {
      console.warn('Failed to load media:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) sessionStorage.setItem(`ops:galleryFilter:${user.id}`, activeFilter);
    void loadMedia();
  }, [activeFilter, appliedPeriod.day, appliedPeriod.month, appliedPeriod.year]);

  const applyHistoryFilter = () => {
    if (selectedDay === appliedPeriod.day && selectedMonth === appliedPeriod.month && selectedYear === appliedPeriod.year) void loadMedia();
    else setAppliedPeriod({ day: selectedDay, month: selectedMonth, year: selectedYear });
  };

  const handleDownload = (item: MediaGalleryItem) => {
    const a = document.createElement('a');
    a.href = item.photoUrl;
    a.download = `SIGAP-${item.sourceModule}-${item.sourceId}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, MediaGalleryItem[]>();
    mediaList.forEach((item) => {
      const dateKey = item.shiftDate || item.eventAt.slice(0, 10);
      const list = groups.get(dateKey) || [];
      list.push(item);
      groups.set(dateKey, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [mediaList]);

  const todayItems = useMemo(() => mediaList.filter((item) => item.shiftDate === currentShift.operationalDate), [mediaList, currentShift.operationalDate]);
  const historyGroups = useMemo(() => groupedByDate.filter(([dateKey]) => dateKey !== currentShift.operationalDate), [groupedByDate, currentShift.operationalDate]);

  const renderShiftGroup = (shiftCode: ShiftCode, items: MediaGalleryItem[], groupKey: string) => {
    const shiftItems = items.filter((item) => item.shiftCode === shiftCode);
    if (shiftItems.length === 0) return null;
    const key = `${groupKey}-${shiftCode}`;
    const isExpanded = !!expanded[key];

    return (
      <div key={shiftCode} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
        <button type="button" onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))} className="flex min-h-10 w-full items-center justify-between text-xs font-black uppercase tracking-wide text-slate-300">
          <span>{shiftCode}</span>
          <span className="flex items-center gap-2 text-slate-500">{shiftItems.length} foto {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
        </button>
        {isExpanded ? <div className={`mt-2 grid grid-cols-2 gap-2 ${isSuperAdminDesktop ? 'lg:grid-cols-4' : ''}`}>
          {shiftItems.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-left transition hover:border-blue-800/70"
            >
              <div className="relative aspect-square">
                <img loading="lazy" src={item.photoUrl} alt={item.caption} className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full border border-blue-700/40 bg-slate-950/85 px-2 py-0.5 text-[9px] font-black text-blue-300">
                  {item.documentType || item.sourceModule}
                </span>
              </div>
            </button>
          ))}
        </div> : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className={`mx-auto flex items-center justify-between ${isSuperAdminDesktop ? 'max-w-7xl' : 'max-w-md'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-300">Media & History</p><h1 className="mt-0.5 text-base font-black tracking-tight text-white">Dokumentasi Shift</h1></div>
              <p className="text-[11px] text-slate-400 font-medium">Hari Ini & Historis</p>
            </div>
          </div>
          <span className="rounded-full border border-blue-700/50 bg-blue-900/30 px-2.5 py-1 font-mono text-[10px] font-black text-blue-300">{mediaList.length} Foto</span>
        </div>
      </header>

      <main className={`mx-auto space-y-4 px-4 pt-4 ${isSuperAdminDesktop ? 'max-w-7xl lg:px-6 lg:pt-6' : 'max-w-md'}`}>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'SEMUA', label: 'SEMUA MEDIA' },
            { id: 'SERTIGAS', label: 'SERTIGAS' },
            { id: 'PATROL', label: 'PATROLI QR' },
            { id: 'HANDOVER', label: 'SERAH TERIMA BARANG' },
            { id: 'TARUNA', label: 'TARUNA' },
            { id: 'INCIDENT', label: 'INSIDEN' },
            ...(counts.LAINNYA ? [{ id: 'LAINNYA', label: 'LAINNYA' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`min-h-10 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black transition ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800'
              }`}
            >
              {tab.label} ({counts[documentTypeMap[tab.id] || 'SEMUA'] || 0})
            </button>
          ))}
        </div>

        <div className={`space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-black/10 ${isSuperAdminDesktop ? 'lg:grid lg:grid-cols-[180px_1fr_auto] lg:items-end lg:gap-4 lg:space-y-0' : ''}`}>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Filter Histori</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-slate-300">
              <span className="mb-1 block">Tanggal</span>
              <select value={selectedDay} onChange={(e) => setSelectedDay(Number(e.target.value))} className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-200 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15">
                <option value={0}>Semua</option>
                {Array.from({ length: new Date(selectedYear, selectedMonth, 0).getDate() }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-slate-300">
              <span className="mb-1 block">Bulan</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-200 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              >
                {monthNames.map((month, index) => (
                  <option key={month} value={index + 1}>{month}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-300">
              <span className="mb-1 block">Tahun</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-200 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              >
                {[2024, 2025, 2026].map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={applyHistoryFilter}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
          >
            TAMPILKAN
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/90" />
            ))}
          </div>
        ) : null}

        {!loading && groupedByDate.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center text-slate-400 shadow-lg shadow-black/10">
            <ImageIcon className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm font-bold">Belum ada dokumentasi pada periode yang dipilih.</p>
          </div>
        )}

        {!loading && groupedByDate.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-black/10">
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, today: !prev.today }))}
                className="flex min-h-10 w-full items-center justify-between text-left"
              >
                <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-300">
                  DOKUMENTASI SESI SHIFT HARI INI
                </span>
                {expanded.today ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>

              {expanded.today && (
                <div className="mt-3 space-y-3">
                  {visibleToday.map((shiftCode) => renderShiftGroup(shiftCode, todayItems, 'today'))}
                  {todayItems.length === 0 ? <p className="text-xs text-slate-500">Belum ada foto pada sesi shift hari ini.</p> : null}
                </div>
              )}
            </div>

            {historyGroups.map(([dateKey, items]) => {
              const key = `history-${dateKey}`;
              const isExpanded = !!expanded[key];
              return (
                <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-black/10">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="flex min-h-10 w-full items-center justify-between text-left"
                  >
                    <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-300">
                      DOKUMENTASI {new Date(`${dateKey}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {['SHIFT_3', 'SHIFT_2', 'SHIFT_1'].map((shiftCode) => renderShiftGroup(shiftCode as ShiftCode, items, key))}
                    </div>
                  )}
                </div>
              );
            })}
            {pagination.hasMore ? <button type="button" onClick={() => void loadMedia(mediaList.length)} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs font-black text-slate-300 transition hover:bg-slate-800">MUAT LEBIH BANYAK ({mediaList.length}/{pagination.total})</button> : null}
          </div>
        )}
      </main>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#08111f] p-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-300">
                  {selectedItem.sourceModule} • {selectedItem.category}
                </span>
                <p className="mt-1 truncate text-xs font-bold text-white">{selectedItem.caption}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Tutup detail foto">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-2">
              <img src={selectedItem.photoUrl} alt={selectedItem.caption} className="max-h-[55vh] max-w-full rounded-xl object-contain" />
            </div>

            <div className="space-y-3 border-t border-slate-800 bg-[#08111f] p-4 text-xs">
              <div className="flex items-center justify-between text-slate-400 font-mono">
                <span>Waktu: {new Date(selectedItem.eventAt).toLocaleString('id-ID')} WIB</span>
                <span>Shift: {selectedItem.shiftCode}</span>
              </div>
              {selectedItem.latitude && selectedItem.longitude && (
                <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    GPS: {selectedItem.latitude.toFixed(6)}, {selectedItem.longitude.toFixed(6)}
                  </span>
                </div>
              )}

              <button
                onClick={() => handleDownload(selectedItem)}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 font-bold text-slate-200 transition hover:bg-slate-700"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Foto Resolusi Penuh</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
