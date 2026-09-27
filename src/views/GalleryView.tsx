/**
 * OPS SIGAP — Unified Media Gallery
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Image as ImageIcon,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  User as UserIcon,
  Clock,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  getJakartaDateParts,
  getVisibleShiftCodes,
  MediaGalleryItem,
  resolveShift,
  ShiftCode,
} from '../types/ops';
import { useAuth } from '../context/AuthContext';
import {
  OpsDialog,
  OpsNoticeDialog,
  type OpsDialogTone,
} from '../components/OpsDialog';

const monthNames = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const documentTypeMap: Record<string, string> = {
  SEMUA: '',
  SERTIGAS: 'SERTIGAS',
  PATROL: 'PATROLI_QR',
  HANDOVER: 'SERAH_TERIMA_BARANG',
  TARUNA: 'TARUNA',
  INCIDENT: 'INSIDEN',
  LAINNYA: 'LAINNYA',
};

function sourceContextLabel(item: MediaGalleryItem): string {
  const context = item.sourceContext;
  if (item.sourceModule === 'PATROL') {
    return [
      context?.roundNumber ? `R${context.roundNumber}` : null,
      context?.checkpointCode || null,
      context?.validationStatus || null,
    ].filter(Boolean).join(' • ') || 'PATROLI';
  }
  if (item.sourceModule === 'HANDOVER') {
    return [
      context?.handoverType?.replaceAll('_', ' ') || null,
      context?.handoverStatus || null,
    ].filter(Boolean).join(' • ') || 'SERAH TERIMA';
  }
  if (item.sourceModule === 'INCIDENT') {
    return [
      context?.incidentSeverity || null,
      context?.incidentStatus || null,
    ].filter(Boolean).join(' • ') || 'INSIDEN';
  }
  return item.documentType || item.sourceModule;
}

function sourceContextTone(item: MediaGalleryItem): string {
  const context = item.sourceContext;
  if (context?.validationStatus === 'REJECTED' || context?.incidentSeverity === 'KRITIS') {
    return 'bg-red-600/90 text-white';
  }
  if (
    context?.validationStatus === 'REVIEW'
    || context?.incidentSeverity === 'TINGGI'
    || context?.handoverStatus === 'SUBMITTED'
  ) {
    return 'bg-amber-600/90 text-white';
  }
  if (
    context?.validationStatus === 'VALID'
    || context?.handoverStatus === 'ACKNOWLEDGED'
    || context?.incidentStatus === 'CLOSED'
  ) {
    return 'bg-emerald-600/90 text-white';
  }
  return 'bg-slate-900/90 text-slate-100';
}

export const GalleryView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const isWideAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'CHIEF';
  const jakartaNow = getJakartaDateParts();
  const currentShift = resolveShift();

  const [mediaList, setMediaList] = useState<MediaGalleryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<
    'SEMUA' | 'SERTIGAS' | 'PATROL' | 'HANDOVER' | 'TARUNA' | 'INCIDENT' | 'LAINNYA'
  >(() => {
    if (!user) return 'SEMUA';
    const saved = sessionStorage.getItem(`ops:galleryFilter:${user.id}`);
    return ['SEMUA', 'SERTIGAS', 'PATROL', 'HANDOVER', 'TARUNA', 'INCIDENT', 'LAINNYA'].includes(saved || '')
      ? (saved as any)
      : 'SEMUA';
  });

  const [selectedItem, setSelectedItem] = useState<MediaGalleryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(jakartaNow.month);
  const [selectedYear, setSelectedYear] = useState(jakartaNow.year);
  const [selectedDay, setSelectedDay] = useState(0);
  const [appliedPeriod, setAppliedPeriod] = useState({
    day: 0,
    month: jakartaNow.month,
    year: jakartaNow.year,
  });
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    today: true,
    [`today-${currentShift.code}`]: true,
  }));
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    tone: OpsDialogTone;
  } | null>(null);

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

      if (appliedPeriod.day) {
        params.date = `${appliedPeriod.year}-${String(appliedPeriod.month).padStart(2, '0')}-${String(
          appliedPeriod.day,
        ).padStart(2, '0')}`;
      }

      if (documentTypeMap[activeFilter]) params.documentType = documentTypeMap[activeFilter];

      const res = await api.getGallery(params);
      if (res.success) {
        setMediaList((current) => (offset ? [...current, ...res.media] : res.media));
        setPagination({ total: res.pagination.total, hasMore: res.pagination.hasMore });
        setCounts(res.counts || {});
      }
    } catch (error) {
      setNotice({
        title: 'Galeri Gagal Dimuat',
        message: error instanceof Error ? error.message : 'Dokumentasi media gagal dimuat.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) sessionStorage.setItem(`ops:galleryFilter:${user.id}`, activeFilter);
    void loadMedia();
  }, [activeFilter, appliedPeriod.day, appliedPeriod.month, appliedPeriod.year]);

  const applyHistoryFilter = () => {
    setShowAll({});
    if (
      selectedDay === appliedPeriod.day &&
      selectedMonth === appliedPeriod.month &&
      selectedYear === appliedPeriod.year
    ) {
      void loadMedia();
    } else {
      setAppliedPeriod({ day: selectedDay, month: selectedMonth, year: selectedYear });
    }
  };

  const handleDownload = (item: MediaGalleryItem) => {
    const anchor = document.createElement('a');
    anchor.href = item.photoUrl;
    anchor.download = `SIGAP-${item.sourceModule}-${item.sourceId}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, MediaGalleryItem[]>();

    [...mediaList]
      .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())
      .forEach((item) => {
        const dateKey = item.shiftDate || item.eventAt.slice(0, 10);
        const list = groups.get(dateKey) || [];
        list.push(item);
        groups.set(dateKey, list);
      });

    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [mediaList]);

  const todayItems = useMemo(
    () => mediaList.filter((item) => item.shiftDate === currentShift.operationalDate),
    [mediaList, currentShift.operationalDate],
  );

  const historyGroups = useMemo(
    () => groupedByDate.filter(([dateKey]) => dateKey !== currentShift.operationalDate),
    [groupedByDate, currentShift.operationalDate],
  );

  const todaySummary = useMemo(() => ({
    total: todayItems.length,
    patrol: todayItems.filter((item) => item.sourceModule === 'PATROL').length,
    handover: todayItems.filter((item) => item.sourceModule === 'HANDOVER').length,
    incident: todayItems.filter((item) => item.sourceModule === 'INCIDENT').length,
  }), [todayItems]);

  const availableYears = useMemo(() => {
    const currentYear = jakartaNow.year;
    return Array.from({ length: 4 }, (_, index) => currentYear - index);
  }, [jakartaNow.year]);

  const renderShiftGroup = (
    shiftCode: ShiftCode,
    items: MediaGalleryItem[],
    groupKey: string,
  ) => {
    const shiftItems = items
      .filter((item) => item.shiftCode === shiftCode)
      .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());

    if (shiftItems.length === 0) return null;

    const key = `${groupKey}-${shiftCode}`;
    const isExpanded = !!expanded[key];
    const isShowingAll = !!showAll[key];
    const visibleItems = isShowingAll ? shiftItems : shiftItems.slice(0, 8);

    return (
      <div key={shiftCode} className="rounded-xl border border-slate-800 bg-slate-950/55 p-2.5">
        <button
          type="button"
          onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}
          className="flex min-h-9 w-full items-center justify-between gap-2 text-xs font-black uppercase tracking-wide text-slate-300"
        >
          <span>{shiftCode.replace('_', ' ')}</span>
          <span className="flex items-center gap-2 text-[10px] text-slate-500">
            {shiftItems.length} foto
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {isExpanded ? (
          <div className="mt-2">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="group overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-left transition hover:border-blue-700/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  title={item.caption}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      loading="lazy"
                      src={item.photoUrl}
                      alt={item.caption}
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                    />
                    <div className="absolute left-1.5 top-1.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide shadow-sm ${sourceContextTone(item)}`}>
                        {sourceContextLabel(item)}
                      </span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-1.5 pb-1.5 pt-5">
                      <div className="truncate text-[8px] font-black uppercase tracking-wide text-white">
                        {item.sourceContext?.checkpointName
                          || item.sourceContext?.incidentTitle
                          || item.sourceContext?.itemName
                          || item.caption
                          || item.documentType
                          || item.sourceModule}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[7px] text-slate-300">
                        {new Date(item.eventAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {shiftItems.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAll((current) => ({ ...current, [key]: !current[key] }))}
                className="mt-2 flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 px-3 text-[10px] font-black text-blue-300 transition hover:bg-slate-800"
              >
                {isShowingAll ? 'RINGKAS FOTO' : `LIHAT SEMUA FOTO (${shiftItems.length})`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020817] pb-28 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl">
        <div className={`mx-auto flex items-center justify-between gap-3 ${isWideAdmin ? 'max-w-7xl' : 'max-w-md'}`}>
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
              <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-blue-300">Media & History</p>
              <h1 className="truncate text-base font-black tracking-tight text-white">Galeri & Riwayat</h1>
              <p className="text-[10px] font-medium text-slate-500">Bukti operasional • terbaru lebih dulu</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-blue-700/50 bg-blue-900/30 px-2.5 py-1 font-mono text-[10px] font-black text-blue-300">
            {mediaList.length}/{pagination.total || mediaList.length}
          </span>
        </div>
      </header>

      <main className={`mx-auto space-y-3 px-3 pt-3 sm:px-4 ${isWideAdmin ? 'max-w-7xl lg:px-6 lg:pt-5' : 'max-w-md'}`}>
        {!isWideAdmin ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 shadow-lg shadow-black/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-blue-300">Hari Ini</p>
                <p className="mt-1 text-sm font-black text-white">{todaySummary.total} bukti operasional</p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-[9px] font-black text-slate-400">
                {currentShift.operationalDate}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-2.5 text-center">
                <p className="text-lg font-black text-white">{todaySummary.patrol}</p>
                <p className="text-[8px] font-black uppercase tracking-wide text-blue-300">Patroli</p>
              </div>
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-2.5 text-center">
                <p className="text-lg font-black text-white">{todaySummary.handover}</p>
                <p className="text-[8px] font-black uppercase tracking-wide text-emerald-300">Serah Terima</p>
              </div>
              <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-2.5 text-center">
                <p className="text-lg font-black text-white">{todaySummary.incident}</p>
                <p className="text-[8px] font-black uppercase tracking-wide text-amber-300">Insiden</p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'SEMUA', label: 'SEMUA' },
            { id: 'SERTIGAS', label: 'SERTIGAS' },
            { id: 'PATROL', label: 'PATROLI QR' },
            { id: 'HANDOVER', label: 'SERAH TERIMA' },
            { id: 'TARUNA', label: 'TARUNA' },
            { id: 'INCIDENT', label: 'INSIDEN' },
            ...(counts.LAINNYA ? [{ id: 'LAINNYA', label: 'LAINNYA' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setShowAll({});
                setActiveFilter(tab.id as any);
              }}
              className={`min-h-9 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {tab.label} ({counts[documentTypeMap[tab.id] || 'SEMUA'] || 0})
            </button>
          ))}
        </div>

        <div className={`rounded-xl border border-slate-800 bg-slate-900/90 p-3 ${
          isWideAdmin ? 'lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-3' : 'space-y-3'
        }`}>
          <div>
            <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              FILTER HISTORI
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <label className="text-[10px] text-slate-300">
                <span className="mb-1 block">Tanggal</span>
                <select
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(Number(event.target.value))}
                  className="ops-input min-h-9 px-2 text-[10px]"
                >
                  <option value={0}>Semua</option>
                  {Array.from(
                    { length: new Date(selectedYear, selectedMonth, 0).getDate() },
                    (_, index) => index + 1,
                  ).map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </label>

              <label className="text-[10px] text-slate-300">
                <span className="mb-1 block">Bulan</span>
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(Number(event.target.value))}
                  className="ops-input min-h-9 px-2 text-[10px]"
                >
                  {monthNames.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </label>

              <label className="text-[10px] text-slate-300">
                <span className="mb-1 block">Tahun</span>
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  className="ops-input min-h-9 px-2 text-[10px]"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:mt-0 lg:flex">
            <button
              type="button"
              onClick={() => {
                setSelectedDay(0);
                setSelectedMonth(jakartaNow.month);
                setSelectedYear(jakartaNow.year);
                setAppliedPeriod({ day: 0, month: jakartaNow.month, year: jakartaNow.year });
                setShowAll({});
              }}
              className="ops-btn-secondary min-h-10 px-3 text-[10px]"
            >
              BULAN INI
            </button>
            <button
              type="button"
              onClick={applyHistoryFilter}
              className="ops-btn-primary min-h-10 px-4 text-xs"
            >
              TAMPILKAN
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl border border-slate-800 bg-slate-900/90" />
            ))}
          </div>
        ) : null}

        {!loading && groupedByDate.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center text-slate-400">
            <ImageIcon className="mx-auto mb-3 h-9 w-9 text-slate-600" />
            <p className="text-sm font-bold">Belum ada dokumentasi pada periode yang dipilih.</p>
          </div>
        ) : null}

        {!loading && groupedByDate.length > 0 ? (
          <div className="space-y-2.5">
            <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
              <button
                type="button"
                onClick={() => setExpanded((current) => ({ ...current, today: !current.today }))}
                className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
              >
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-300">
                  HARI INI
                </span>
                <span className="flex items-center gap-2 text-[10px] text-slate-500">
                  {todayItems.length} foto
                  {expanded.today ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
              </button>

              {expanded.today ? (
                <div className="mt-2 space-y-2">
                  {visibleToday.map((shiftCode) => renderShiftGroup(shiftCode, todayItems, 'today'))}
                  {todayItems.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-slate-500">Belum ada foto pada sesi shift hari ini.</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {historyGroups.map(([dateKey, items]) => {
              const key = `history-${dateKey}`;
              const isExpanded = !!expanded[key];

              return (
                <section key={key} className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}
                    className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-300">
                      {new Date(`${dateKey}T00:00:00`).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="flex items-center gap-2 text-[10px] text-slate-500">
                      {items.length} foto
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="mt-2 space-y-2">
                      {(['SHIFT_3', 'SHIFT_2', 'SHIFT_1'] as ShiftCode[]).map((shiftCode) =>
                        renderShiftGroup(shiftCode, items, key),
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}

            {pagination.hasMore ? (
              <button
                type="button"
                onClick={() => void loadMedia(mediaList.length)}
                className="flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-black text-slate-300 transition hover:bg-slate-800"
              >
                MUAT LEBIH BANYAK ({mediaList.length}/{pagination.total})
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      <OpsDialog
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.caption || 'DETAIL FOTO'}
        description={
          selectedItem
            ? `${sourceContextLabel(selectedItem)} • ${selectedItem.shiftCode}`
            : undefined
        }
        tone="neutral"
        size="lg"
        footer={
          selectedItem ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSelectedItem(null)} className="ops-btn-secondary px-4">
                TUTUP
              </button>
              <button
                type="button"
                onClick={() => handleDownload(selectedItem)}
                className="ops-btn-primary inline-flex items-center justify-center gap-1.5 px-4"
              >
                <Download className="h-4 w-4" />
                UNDUH FOTO
              </button>
            </div>
          ) : null
        }
      >
        {selectedItem ? (
          <div className="space-y-3">
            <div className="flex max-h-[58vh] items-center justify-center overflow-hidden rounded-xl bg-black p-1.5">
              <img
                src={selectedItem.photoUrl}
                alt={selectedItem.caption}
                className="max-h-[56vh] max-w-full rounded-lg object-contain"
              />
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
                  <Clock className="h-3 w-3" /> Waktu
                </div>
                <div className="mt-1 font-mono text-slate-300">
                  {new Date(selectedItem.eventAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Shift / Tanggal Operasional</div>
                <div className="mt-1 font-bold text-slate-300">
                  {selectedItem.shiftCode} • {selectedItem.shiftDate}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
                  <UserIcon className="h-3 w-3" /> Petugas
                </div>
                <div className="mt-1 font-bold text-slate-300">
                  {selectedItem.sourceContext?.memberName || 'Petugas'}{selectedItem.sourceContext?.npk ? ` • ${selectedItem.sourceContext.npk}` : ''}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Site</div>
                <div className="mt-1 font-bold text-slate-300">
                  {selectedItem.sourceContext?.siteName || selectedItem.siteId}
                </div>
              </div>
            </div>

            {selectedItem.sourceModule === 'PATROL' ? (
              <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide text-blue-300">Riwayat Patroli</p>
                    <p className="mt-1 text-sm font-black text-white">
                      {selectedItem.sourceContext?.checkpointCode || 'CP'} • {selectedItem.sourceContext?.checkpointName || 'Checkpoint'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${sourceContextTone(selectedItem)}`}>
                    {selectedItem.sourceContext?.validationStatus || 'STATUS'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded-lg bg-slate-950/60 p-2 text-slate-400">
                    Ronde <span className="font-black text-white">{selectedItem.sourceContext?.roundNumber || '-'}</span>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 p-2 text-slate-400">
                    Jarak <span className="font-black text-white">{selectedItem.sourceContext?.calculatedDistanceM != null ? `${selectedItem.sourceContext.calculatedDistanceM.toFixed(1)}m` : '-'}</span>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 p-2 text-slate-400">
                    Observasi <span className="font-black text-white">{selectedItem.sourceContext?.observationStatus || '-'}</span>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 p-2 text-slate-400">
                    Sumber <span className="font-black text-white">{selectedItem.sourceContext?.syncSource || '-'}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedItem.sourceModule === 'HANDOVER' ? (
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide text-emerald-300">Riwayat Serah Terima</p>
                    <p className="mt-1 text-sm font-black text-white">
                      {selectedItem.sourceContext?.itemName || selectedItem.sourceContext?.handoverType?.replaceAll('_', ' ') || 'Serah Terima'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${sourceContextTone(selectedItem)}`}>
                    {selectedItem.sourceContext?.handoverStatus || 'STATUS'}
                  </span>
                </div>
                <div className="space-y-1.5 text-[10px] text-slate-300">
                  <p>Dari <span className="font-black text-white">{selectedItem.sourceContext?.handedFrom || '-'}</span></p>
                  <p>Kepada <span className="font-black text-white">{selectedItem.sourceContext?.handedTo || '-'}</span></p>
                  {selectedItem.sourceContext?.itemQuantity ? <p>Jumlah <span className="font-black text-white">{selectedItem.sourceContext.itemQuantity}</span></p> : null}
                  {selectedItem.sourceContext?.itemCondition ? <p>Kondisi <span className="font-black text-white">{selectedItem.sourceContext.itemCondition}</span></p> : null}
                </div>
              </div>
            ) : null}

            {selectedItem.sourceModule === 'INCIDENT' ? (
              <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide text-amber-300">Riwayat Kejadian</p>
                    <p className="mt-1 text-sm font-black text-white">
                      {selectedItem.sourceContext?.incidentTitle || selectedItem.caption}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {selectedItem.sourceContext?.incidentCategory || '-'} • {selectedItem.sourceContext?.incidentLocation || '-'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${sourceContextTone(selectedItem)}`}>
                    {selectedItem.sourceContext?.incidentSeverity || 'INSIDEN'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-300">
                  Status <span className="font-black text-white">{selectedItem.sourceContext?.incidentStatus || '-'}</span>
                </p>
              </div>
            ) : null}

            {selectedItem.latitude != null && selectedItem.longitude != null ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs text-slate-400">
                <MapPin className="h-4 w-4 shrink-0 text-blue-400" />
                <span>
                  GPS {selectedItem.latitude.toFixed(6)}, {selectedItem.longitude.toFixed(6)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </OpsDialog>

      <OpsNoticeDialog
        isOpen={!!notice}
        onClose={() => setNotice(null)}
        title={notice?.title || 'Informasi'}
        message={notice?.message || ''}
        tone={notice?.tone || 'info'}
      />
    </div>
  );
};
