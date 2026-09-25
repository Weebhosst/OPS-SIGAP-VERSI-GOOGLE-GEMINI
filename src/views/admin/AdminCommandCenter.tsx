/**
 * OPS SIGAP — Super Admin Command Center
 * Tactical Monitoring Hub with 4 KPIs, persistent global filters, and operational alert panels
 */

import React, { useEffect, useState } from 'react';
import {
  Shield,
  Activity,
  AlertTriangle,
  XCircle,
  FileText,
  Filter,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Clock,
  User as UserIcon,
  ChevronRight,
  ExternalLink,
  Users,
  QrCode,
  Sliders,
  History,
  LogOut,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  AdminFilterState,
  AdminKpis,
  PatrolSession,
  PatrolLog,
  ShiftHandover,
  IncidentReport,
  MediaGalleryItem,
  ValidationAlert,
  isAdministrator,
} from '../../types/ops';

interface AdminCommandCenterProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminCommandCenter: React.FC<AdminCommandCenterProps> = ({ onNavigateTab }) => {
  const { user, logout } = useAuth();
  const isChief = user?.role === 'CHIEF';
  const [filterState, setFilterState] = useState<AdminFilterState | null>(null);
  const [kpis, setKpis] = useState<AdminKpis>({
    patroliAktif: 0,
    kejadianOpen: 0,
    rejectedHariIni: 0,
    serahTerimaHariIni: 0,
  });
  const [panels, setPanels] = useState<{
    activePatrols: PatrolSession[];
    validationAlerts: Array<ValidationAlert & { patrolLog?: PatrolLog | null }>;
    recentHandovers: ShiftHandover[];
    criticalIncidents: IncidentReport[];
    recentMedia: MediaGalleryItem[];
  }>({
    activePatrols: [],
    validationAlerts: [],
    recentHandovers: [],
    criticalIncidents: [],
    recentMedia: [],
  });

  const [options, setOptions] = useState<{
    sites: any[];
    users: any[];
    shifts: any[];
  }>({ sites: [], users: [], shifts: [] });

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detailAlert, setDetailAlert] = useState<(ValidationAlert & { patrolLog?: PatrolLog | null }) | null>(null);
  const [closeAlert, setCloseAlert] = useState<(ValidationAlert & { patrolLog?: PatrolLog | null }) | null>(null);
  const [closeNote, setCloseNote] = useState('');

  const loadDashboard = async () => {
    try {
      const res = await api.getCommandCenter();
      if (res.success) {
        setFilterState(res.filterState);
        setKpis(res.kpis);
        setPanels(res.panels);
        setOptions(res.options);

        setSelectedSite(res.filterState.siteId || '');
        setSelectedShift(res.filterState.shiftCode || '');
        setSelectedMember(res.filterState.memberUserId || '');
      }
    } catch (err) {
      console.warn('Failed to load command center:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // Auto refresh every 20 seconds
    const interval = setInterval(loadDashboard, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleApplyFilter = async () => {
    try {
      const res = await api.setAdminFilter({
        siteId: selectedSite || null,
        shiftCode: (selectedShift as any) || null,
        memberUserId: selectedMember || null,
      });
      if (res.success) {
        setShowFilterModal(false);
        await loadDashboard();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah filter');
    }
  };

  const handleResetFilter = async () => {
    try {
      const res = await api.resetAdminFilter();
      if (res.success) {
        setSelectedSite('');
        setSelectedShift('');
        setSelectedMember('');
        setShowFilterModal(false);
        await loadDashboard();
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mereset filter');
    }
  };

  const mutateAlert = async (alert: ValidationAlert, action: 'REVIEW' | 'CLOSE' | 'REOPEN') => {
    try {
      await api.updateValidationAlert(alert.id, action, action === 'CLOSE' ? closeNote.trim() : undefined);
      setCloseAlert(null); setCloseNote('');
      await loadDashboard();
    } catch (error: any) { window.alert(error.message || 'Gagal memperbarui validation alert.'); }
  };

  // Helper for active filter text
  const getFilterSummaryText = () => {
    const siteText = filterState?.siteId
      ? options.sites.find((s) => s.id === filterState.siteId)?.name || filterState.siteId
      : 'SEMUA SITE';
    const shiftText = filterState?.shiftCode || 'SEMUA SHIFT';
    const memberText = filterState?.memberUserId
      ? options.users.find((u) => u.id === filterState.memberUserId)?.name || filterState.memberUserId
      : 'SEMUA ANGGOTA';

    return `${siteText} • ${shiftText} • ${memberText}`;
  };

  return (
    <div className={`min-h-screen bg-[#020817] text-slate-100 ${isChief ? 'pb-28' : 'pb-28 lg:pb-8'}`}>
      {/* Tactical Top Header */}
      <header className={`sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl ${isChief ? '' : 'lg:px-6'}`}>
        <div className={`mx-auto flex items-center justify-between ${isChief ? 'max-w-md' : 'max-w-7xl'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-500/40 bg-blue-600/20 text-blue-400">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black leading-tight tracking-tight text-white">{isChief ? 'MONITOR OPERASIONAL' : 'COMMAND CENTER'}</h1>
                {!isChief && (
                  <span className="rounded border border-red-800 bg-red-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300">
                    SUPER ADMIN
                  </span>
                )}
              </div>
              <p className={`mt-0.5 font-medium text-slate-400 ${isChief ? 'text-[10px] leading-4' : 'text-xs'}`}>
                {isChief ? 'CHIEF • READ ONLY · Monitoring site & operasional' : 'OPS SIGAP — Security Operations System'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowFilterModal(true)}
              className="flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-2.5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-white"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto space-y-5 px-4 pt-4 ${isChief ? 'max-w-md' : 'max-w-7xl lg:px-6 lg:pt-6'}`}>
        {/* Active Filter Indicator Bar */}
        <div className={`flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-black/10 ${isChief ? '' : 'sm:flex-row sm:items-center sm:justify-between'}`}>
          <div className={`text-xs ${isChief ? 'space-y-2' : 'flex items-center gap-2'}`}>
            <span className={`${isChief ? 'block text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500' : 'text-slate-400 font-semibold'}`}>{isChief ? 'Filter Operasional' : 'Filter Aktif:'}</span>
            <span className={`font-mono font-bold text-blue-300 bg-blue-950/60 border border-blue-900/60 px-2.5 py-1 rounded-lg ${isChief ? 'block break-words leading-5' : ''}`}>
              {getFilterSummaryText()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilterModal(true)}
              className="text-xs text-slate-300 hover:text-white font-semibold underline underline-offset-2"
            >
              Ubah Filter
            </button>
            {(filterState?.siteId || filterState?.shiftCode || filterState?.memberUserId) && (
              <button
                onClick={handleResetFilter}
                className="text-xs text-red-400 hover:text-red-300 font-semibold"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {isChief && (
          <section className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('handovers')}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-800 bg-slate-900/90 px-2 text-[10px] font-black text-slate-300 shadow-sm transition hover:border-blue-800 hover:bg-slate-800"
            >
              <FileText className="h-4 w-4 text-blue-300" />
              <span>Mutasi</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('incidents')}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-800 bg-slate-900/90 px-2 text-[10px] font-black text-slate-300 shadow-sm transition hover:border-amber-800 hover:bg-slate-800"
            >
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span>Insiden</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('gallery')}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-800 bg-slate-900/90 px-2 text-[10px] font-black text-slate-300 shadow-sm transition hover:border-violet-800 hover:bg-slate-800"
            >
              <ImageIcon className="h-4 w-4 text-violet-300" />
              <span>Galeri</span>
            </button>
          </section>
        )}

        {/* 4 TOP KPI CARDS */}
        <div className={`grid grid-cols-2 gap-3 ${isChief ? '' : 'lg:grid-cols-4'}`}>
          {/* 1. Patroli Aktif */}
          <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm ${isChief ? 'p-3.5' : 'p-4'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Patroli Aktif
              </span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-3xl font-black text-white mt-2 font-mono">
              {kpis.patroliAktif}
            </div>
            <p className="text-[11px] text-blue-400 font-medium mt-1">Sesi ronde OPEN</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
          </div>

          {/* 2. Kejadian Open */}
          <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm ${isChief ? 'p-3.5' : 'p-4'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Kejadian Open
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-black text-amber-400 mt-2 font-mono">
              {kpis.kejadianOpen}
            </div>
            <p className="text-[11px] text-amber-300 font-medium mt-1">Perlu atensi & tindak lanjut</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
          </div>

          {/* 3. Rejected Hari Ini */}
          <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm ${isChief ? 'p-3.5' : 'p-4'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Rejected Hari Ini
              </span>
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-3xl font-black text-red-400 mt-2 font-mono">
              {kpis.rejectedHariIni}
            </div>
            <p className="text-[11px] text-red-300 font-medium mt-1">Luar radius / duplikasi</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-500" />
          </div>

          {/* 4. Serah Terima Hari Ini */}
          <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm ${isChief ? 'p-3.5' : 'p-4'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Serah Terima Hari Ini
              </span>
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-black text-emerald-400 mt-2 font-mono">
              {kpis.serahTerimaHariIni}
            </div>
            <p className="text-[11px] text-emerald-300 font-medium mt-1">Mutasi regu tercatat</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
          </div>
        </div>

        {/* Tactical Panels Grid */}
        <div className={`grid grid-cols-1 gap-3 ${isChief ? '' : 'lg:grid-cols-2'}`}>
          {/* Panel: Patroli Aktif */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-black text-white">{isChief ? 'PATROLI AKTIF' : 'PATROLI AKTIF LAPANGAN'}</h2>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                {panels.activePatrols.length} Sesi
              </span>
            </div>

            {panels.activePatrols.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Tidak ada sesi patroli yang sedang aktif saat ini.
              </p>
            ) : (
              <div className="space-y-2.5">
                {panels.activePatrols.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                  >
                    <div className={`flex gap-2 ${isChief ? 'flex-col' : 'items-center justify-between'}`}>
                      <div>
                        <div className="font-bold text-white text-xs">
                          {options.users.find((u) => u.id === s.userId)?.name || s.userId}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {s.siteId} • Ronde #{s.roundNumber || 1} • {s.shiftCode}
                        </div>
                      </div>
                      <span className={`font-mono text-xs font-bold text-emerald-400 ${isChief ? 'self-start' : ''}`}>
                        {s.totalValid}/{s.totalRequired} CP ({s.completionPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full"
                        style={{ width: `${s.completionPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel: Validation Alerts (REJECTED / REVIEW) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className={`flex border-b border-slate-800 pb-2 ${isChief ? 'items-start justify-between gap-2' : 'items-center justify-between'}`}>
              <div className="flex min-w-0 items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                <h2 className="text-sm font-black text-white">{isChief ? 'ALERT VALIDASI' : 'VALIDATION ALERTS (REJECTED & REVIEW)'}</h2>
              </div>
              <span className="text-xs font-mono font-bold text-red-400">
                {panels.validationAlerts.length} Peringatan
              </span>
            </div>

            {panels.validationAlerts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Tidak ada alert penolakan atau scan mencurigakan.
              </p>
            ) : (
              <div className={`space-y-2 ${isChief ? '' : 'max-h-72 overflow-y-auto pr-1'}`}>
                {panels.validationAlerts.map((l) => (
                  <div
                    key={l.id}
                    className="space-y-2 rounded-xl border border-red-950/80 bg-slate-950 p-3"
                  >
                    <div className={`flex gap-2 ${isChief ? 'flex-col' : 'items-center justify-between'}`}>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="text-[10px] bg-red-950 border border-red-800 text-red-300 font-mono px-1.5 rounded font-bold">
                          {l.patrolLog?.validationStatus || 'ALERT'}
                        </span>
                        <span className={`text-[10px] rounded px-1.5 font-bold ${l.status === 'CLOSED' ? 'bg-slate-700 text-slate-200' : l.status === 'UNDER_REVIEW' ? 'bg-amber-950 text-amber-300' : 'bg-blue-950 text-blue-300'}`}>{l.status.replace('_', ' ')}</span>
                        <span className="break-words text-xs font-bold text-white">
                          {options.users.find((u) => u.id === l.userId)?.name || l.userId}
                        </span>
                      </div>
                      <span className={`font-mono text-[10px] text-slate-400 ${isChief ? 'self-start' : ''}`}>
                        {new Date(l.createdAt).toLocaleTimeString('id-ID')} WIB
                      </span>
                    </div>

                    <div className="break-words text-xs font-medium leading-5 text-red-300">
                      {l.message}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words font-mono text-[10px] text-slate-500">
                      <span>{l.alertType} • {l.siteId}</span>
                      {l.patrolLog ? <span>Jarak: {l.patrolLog.calculatedDistanceM.toFixed(1)}m</span> : null}
                      {l.patrolLog?.isLowGpsAccuracy ? <span className="text-amber-400 font-bold">• GPS LOW ACCURACY</span> : null}
                    </div>
                    {l.status === 'CLOSED' ? <div className="text-[10px] text-slate-400">Closed by {options.users.find((u) => u.id === l.closedBy)?.name || l.closedBy || '-'} • {l.closedAt ? new Date(l.closedAt).toLocaleString('id-ID') : '-'}</div> : null}
                    <div className="flex flex-wrap gap-1 pt-1"><button onClick={() => setDetailAlert(l)} className="rounded bg-slate-800 px-2 py-1 text-[10px] font-bold">DETAIL</button>{isAdministrator(user?.role) && l.status === 'OPEN' ? <button onClick={() => void mutateAlert(l, 'REVIEW')} className="rounded bg-amber-900 px-2 py-1 text-[10px] font-bold">TANDAI DITINJAU</button> : null}{isAdministrator(user?.role) && l.status !== 'CLOSED' ? <button onClick={() => { setCloseAlert(l); setCloseNote(''); }} className="rounded bg-red-900 px-2 py-1 text-[10px] font-bold">CLOSE</button> : null}{isAdministrator(user?.role) && l.status === 'CLOSED' ? <button onClick={() => void mutateAlert(l, 'REOPEN')} className="rounded bg-blue-800 px-2 py-1 text-[10px] font-bold">BUKA KEMBALI</button> : null}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel: Kejadian Open / Menonjol / Kritis */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-black text-white">{isChief ? 'KEJADIAN PRIORITAS' : 'KEJADIAN OPEN & TINGGI / KRITIS'}</h2>
              </div>
              <button
                onClick={() => onNavigateTab('incidents')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
              >
                <span>{isChief ? 'Lihat' : 'Kelola'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {panels.criticalIncidents.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Tidak ada insiden open atau berkategori kritis.
              </p>
            ) : (
              <div className="space-y-2">
                {panels.criticalIncidents.map((i) => (
                  <div
                    key={i.id}
                    className={`rounded-xl border border-slate-800 bg-slate-950 p-3 ${isChief ? 'space-y-2' : 'flex items-start justify-between gap-3'}`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            i.severity === 'KRITIS'
                              ? 'bg-red-600 text-white'
                              : i.severity === 'TINGGI'
                              ? 'bg-amber-600 text-white'
                              : 'bg-yellow-600/30 text-yellow-300'
                          }`}
                        >
                          {i.severity}
                        </span>
                        <span className="font-bold text-xs text-white">{i.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{i.chronology}</p>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                      {i.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel: Serah Terima Terbaru */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-black text-white">{isChief ? 'SERAH TERIMA TERBARU' : 'SERAH TERIMA JAGA TERBARU'}</h2>
              </div>
              <button
                onClick={() => onNavigateTab('handovers')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
              >
                <span>{isChief ? 'Lihat' : 'Kelola'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {panels.recentHandovers.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Belum ada serah terima yang tercatat hari ini.
              </p>
            ) : (
              <div className="space-y-2">
                {panels.recentHandovers.map((h) => (
                  <div
                    key={h.id}
                    className={`rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs ${isChief ? 'space-y-2' : 'flex items-center justify-between'}`}
                  >
                    <div>
                      <div className="font-bold text-white">{h.handoverType}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {h.shiftCode} • Kondisi: {h.conditionStatus}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        h.status === 'ACKNOWLEDGED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {h.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dokumentasi Lapangan Terbaru Carousel */}
        {panels.recentMedia.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-white">{isChief ? 'DOKUMENTASI TERBARU' : 'DOKUMENTASI MEDIA LAPANGAN TERBARU'}</h2>
              <button
                onClick={() => onNavigateTab('gallery')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
              >
                <span>Lihat Semua Galeri</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={`grid grid-cols-2 gap-2.5 ${isChief ? '' : 'md:grid-cols-4'}`}>
              {panels.recentMedia.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video relative group"
                >
                  <img
                    src={m.photoUrl}
                    alt={m.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2">
                    <span className="text-[10px] text-white font-mono truncate">{m.caption}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {detailAlert ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="ops-dialog w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-[#0f172a] p-5 text-xs shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="validation-detail-title"><div className="flex justify-between gap-3"><h3 id="validation-detail-title" className="font-black">DETAIL VALIDATION ALERT</h3><button type="button" onClick={() => setDetailAlert(null)} aria-label="Tutup detail validation alert">✕</button></div><div className="mt-4 space-y-2 rounded-xl bg-slate-950 p-3"><div>Petugas: <b>{options.users.find((u) => u.id === detailAlert.userId)?.name || detailAlert.userId}</b></div><div>NPK: {options.users.find((u) => u.id === detailAlert.userId)?.npk || '-'}</div><div>Site: {detailAlert.siteId}</div><div>Jenis: {detailAlert.alertType}</div><div>Detail: {detailAlert.message}</div><div>Status: {detailAlert.status}</div>{detailAlert.closeNote ? <div>Catatan Penyelesaian: {detailAlert.closeNote}</div> : null}</div></div></div> : null}

      {closeAlert ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="ops-dialog w-full max-w-md overflow-y-auto rounded-3xl border border-red-900 bg-[#0f172a] p-5 text-xs shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="validation-close-title"><h3 id="validation-close-title" className="font-black text-red-300">TUTUP VALIDATION ALERT</h3><div className="my-3 rounded-xl bg-slate-950 p-3"><div>Petugas: <b>{options.users.find((u) => u.id === closeAlert.userId)?.name || closeAlert.userId}</b></div><div>NPK: {options.users.find((u) => u.id === closeAlert.userId)?.npk || '-'}</div><div>Site: {closeAlert.siteId}</div><div>Jenis: {closeAlert.alertType}</div><div className="mt-2">Detail: {closeAlert.message}</div></div><label className="font-bold">Catatan Penyelesaian<textarea autoFocus required value={closeNote} onChange={(event) => setCloseNote(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-normal" /></label><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setCloseAlert(null)} className="rounded-xl bg-slate-800 p-2 font-bold">BATAL</button><button disabled={!closeNote.trim()} onClick={() => void mutateAlert(closeAlert, 'CLOSE')} className="rounded-xl bg-red-700 p-2 font-bold disabled:opacity-40">CLOSE ALERT</button></div></div></div> : null}

      {/* Persistent Global Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="ops-dialog w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700 bg-[#0f172a] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="global-filter-title">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 id="global-filter-title" className="text-sm font-black text-white">Filter Global Command Center</h3>
              <button type="button" onClick={() => setShowFilterModal(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Tutup filter global">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Filter 1: Site */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Site / Lokasi:</label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">Semua Site (Global)</option>
                  {options.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 2: Shift */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Shift:</label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">Semua Shift</option>
                  {options.shifts.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 3: Anggota */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Anggota Security:</label>
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">Semua Anggota</option>
                  {options.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} (NPK: {u.npk})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handleResetFilter}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition"
              >
                Reset Semua
              </button>
              <button
                onClick={handleApplyFilter}
                className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                Terapkan Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
