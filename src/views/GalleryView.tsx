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
      <div key={shiftCode} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
        <button type="button" onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))} className="flex w-full items-center justify-between text-xs text-slate-300 font-bold uppercase tracking-wide">
          <span>{shiftCode}</span>
          <span className="flex items-center gap-2 text-slate-500">{shiftItems.length} foto {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
        </button>
        {isExpanded ? <div className="mt-2 grid grid-cols-2 gap-2">
          {shiftItems.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className="text-left overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
            >
              <div className="relative aspect-square">
                <img loading="lazy" src={item.photoUrl} alt={item.caption} className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold text-blue-300">
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
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
              <h1 className="font-extrabold text-white text-base">DOKUMENTASI SESI SHIFT</h1>
              <p className="text-[11px] text-slate-400 font-medium">Hari Ini & Historis</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-blue-400">{mediaList.length} Foto</span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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
              className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {tab.label} ({counts[documentTypeMap[tab.id] || 'SEMUA'] || 0})
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Filter Histori</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-slate-300">
              <span className="mb-1 block">Tanggal</span>
              <select value={selectedDay} onChange={(e) => setSelectedDay(Number(e.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-slate-200">
                <option value={0}>Semua</option>
                {Array.from({ length: new Date(selectedYear, selectedMonth, 0).getDate() }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-slate-300">
              <span className="mb-1 block">Bulan</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-slate-200"
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
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-slate-200"
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
            className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
          >
            TAMPILKAN
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl border border-slate-800 bg-slate-900 animate-pulse" />
            ))}
          </div>
        ) : null}

        {!loading && groupedByDate.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <ImageIcon className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium">Belum ada dokumentasi pada periode yang dipilih.</p>
          </div>
        )}

        {!loading && groupedByDate.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, today: !prev.today }))}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
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
                <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
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
            {pagination.hasMore ? <button type="button" onClick={() => void loadMedia(mediaList.length)} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs font-bold">MUAT LEBIH BANYAK ({mediaList.length}/{pagination.total})</button> : null}
          </div>
        )}
      </main>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div>
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  {selectedItem.sourceModule} • {selectedItem.category}
                </span>
                <p className="text-xs text-white font-semibold truncate">{selectedItem.caption}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-black flex items-center justify-center overflow-hidden p-2">
              <img src={selectedItem.photoUrl} alt={selectedItem.caption} className="max-h-[50vh] max-w-full object-contain rounded-lg" />
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2 text-xs">
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
                className="w-full mt-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition"
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
