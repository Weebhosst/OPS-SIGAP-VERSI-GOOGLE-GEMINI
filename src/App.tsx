/**
 * OPS SIGAP — Security Operations System
 * Main Application Shell & Navigation
 */

import React, { useEffect, useState } from 'react';
import {
  Shield,
  Activity,
  FileText,
  AlertTriangle,
  Image as ImageIcon,
  User as UserIcon,
  Users,
  QrCode,
  Sliders,
  History,
  Home,
  LogOut,
  Radio,
  Building2,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineBanner } from './components/OfflineBanner';
import { LoginView } from './views/LoginView';
import { ChangePasswordView } from './views/ChangePasswordView';
import { MemberHome } from './views/MemberHome';
import { PatrolActiveView } from './views/PatrolActiveView';
import { HandoverView } from './views/HandoverView';
import { IncidentView } from './views/IncidentView';
import { GalleryView } from './views/GalleryView';
import { ProfileView } from './views/ProfileView';
import { AdminCommandCenter } from './views/admin/AdminCommandCenter';
import { AdminCheckpoints } from './views/admin/AdminCheckpoints';
import { AdminUsers } from './views/admin/AdminUsers';
import { AdminRadiusCalibration } from './views/admin/AdminRadiusCalibration';
import { AdminAuditLogs } from './views/admin/AdminAuditLogs';
import { MasterMonitoringView } from './views/admin/MasterMonitoringView';

function AppContent() {
  const { user, loading, logout } = useAuth();
  const [memberTab, setMemberTab] = useState<
    'home' | 'patrol' | 'handover' | 'incidents' | 'gallery' | 'profile'
  >('home');
  const [adminTab, setAdminTab] = useState<
    'command' | 'master' | 'checkpoints' | 'users' | 'calibration' | 'audit' | 'handovers' | 'incidents' | 'gallery' | 'patrol_test' | 'profile'
  >('command');
  const [routeReadyUserId, setRouteReadyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setRouteReadyUserId(null); return; }
    const key = `ops:lastRoute:${user.id}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '{}');
      const adminAllowed = ['command', 'master', 'checkpoints', 'users', 'calibration', 'audit', 'handovers', 'incidents', 'gallery', 'patrol_test', 'profile'];
      const chiefAllowed = ['command', 'master', 'handovers', 'incidents', 'gallery', 'profile'];
      const memberAllowed = ['home', 'patrol', 'handover', 'incidents', 'gallery', 'profile'];
      if (user.role === 'ANGGOTA' && memberAllowed.includes(saved.view)) setMemberTab(saved.view);
      if (user.role !== 'ANGGOTA' && (user.role === 'CHIEF' ? chiefAllowed : adminAllowed).includes(saved.view)) setAdminTab(saved.view);
    } catch { /* invalid session state falls back to the authorized default */ }
    setRouteReadyUserId(user.id);
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user || routeReadyUserId !== user.id) return;
    const view = user.role === 'ANGGOTA' ? memberTab : adminTab;
    const search = new URLSearchParams(window.location.search);
    search.set('view', view);
    const nextUrl = `${window.location.pathname}?${search.toString()}`;
    window.history.replaceState({}, '', nextUrl);
    sessionStorage.setItem(`ops:lastRoute:${user.id}`, JSON.stringify({ pathname: window.location.pathname, search: search.toString(), view }));
  }, [adminTab, memberTab, routeReadyUserId, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020817] flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-300 flex items-center justify-center animate-pulse shadow-xl shadow-blue-950/30">
          <Shield className="w-6 h-6" />
        </div>
        <div className="mt-4 text-sm text-slate-400 font-semibold">Memuat OPS SIGAP...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <OfflineBanner />
        <LoginView />
      </>
    );
  }

  if (user.mustChangePassword) {
    return (
      <>
        <OfflineBanner />
        <ChangePasswordView />
      </>
    );
  }

  if (routeReadyUserId !== user.id) {
    return <div className="min-h-screen bg-[#020817] flex items-center justify-center text-sm font-semibold text-slate-400">Memulihkan tampilan terakhir...</div>;
  }

  // SUPER ADMIN / ADMIN WORKSPACE
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return (
      <div className="min-h-screen bg-[#020817] text-slate-100 flex flex-col">
        <OfflineBanner />

        <div className="flex-1">
          {adminTab === 'command' && (
            <AdminCommandCenter onNavigateTab={(t: any) => setAdminTab(t)} />
          )}
          {adminTab === 'master' && (
            <MasterMonitoringView onBack={() => setAdminTab('command')} onNavigate={setAdminTab} />
          )}
          {adminTab === 'checkpoints' && (
            <AdminCheckpoints onBack={() => setAdminTab('command')} />
          )}
          {adminTab === 'users' && <AdminUsers onBack={() => setAdminTab('command')} />}
          {adminTab === 'calibration' && (
            <AdminRadiusCalibration onBack={() => setAdminTab('command')} />
          )}
          {adminTab === 'audit' && <AdminAuditLogs onBack={() => setAdminTab('command')} />}
          {adminTab === 'handovers' && <HandoverView onBack={() => setAdminTab('command')} />}
          {adminTab === 'incidents' && <IncidentView onBack={() => setAdminTab('command')} />}
          {adminTab === 'gallery' && <GalleryView onBack={() => setAdminTab('command')} />}
          {adminTab === 'profile' && <ProfileView onBack={() => setAdminTab('command')} />}
          {adminTab === 'patrol_test' && (
            <PatrolActiveView onBack={() => setAdminTab('command')} />
          )}
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#08111f]/95 px-2 py-2 shadow-[0_-12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl" aria-label="Navigasi Admin">
          <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto sm:justify-center">
            <button
              onClick={() => setAdminTab('command')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                adminTab === 'command'
                  ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                  : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Command</span>
            </button>

            <button
              onClick={() => setAdminTab('master')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${adminTab === 'master' ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'}`}
            >
              <Building2 className="w-4 h-4" />
              <span>Master</span>
            </button>

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <button
              onClick={() => setAdminTab('checkpoints')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                adminTab === 'checkpoints'
                  ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                  : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Titik QR</span>
            </button>}

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <button
              onClick={() => setAdminTab('users')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                adminTab === 'users'
                  ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                  : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Petugas</span>
            </button>}

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <button
              onClick={() => setAdminTab('calibration')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                adminTab === 'calibration'
                  ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                  : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Radius</span>
            </button>}

            <button
              onClick={() => setAdminTab('gallery')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${adminTab === 'gallery' ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'}`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Galeri</span>
            </button>

            <button
              onClick={() => setAdminTab('audit')}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                adminTab === 'audit'
                  ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                  : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Audit</span>
            </button>

          </div>
        </nav>
      </div>
    );
  }

  // CHIEF WORKSPACE (READ-ONLY MONITORING)
  if (user.role === 'CHIEF') {
    return (
      <div className="min-h-screen bg-[#020817] text-slate-100 flex flex-col">
        <OfflineBanner />
        <div className="flex-1">
          {adminTab === 'command' && <AdminCommandCenter onNavigateTab={(tab: any) => setAdminTab(tab)} />}
          {adminTab === 'master' && <MasterMonitoringView onBack={() => setAdminTab('command')} onNavigate={setAdminTab} />}
          {adminTab === 'gallery' && <GalleryView onBack={() => setAdminTab('command')} />}
          {adminTab === 'handovers' && <HandoverView onBack={() => setAdminTab('command')} />}
          {adminTab === 'incidents' && <IncidentView onBack={() => setAdminTab('command')} />}
          {adminTab === 'profile' && <ProfileView onBack={() => setAdminTab('command')} />}
        </div>
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#08111f]/95 px-2 py-2 shadow-[0_-12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl" aria-label="Navigasi Utama">
          <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
            <button
              onClick={() => setAdminTab('command')}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
                adminTab === 'command' ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Monitor</span>
            </button>
            <button
              onClick={() => setAdminTab('master')}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
                adminTab === 'master' ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Session</span>
            </button>
            <button
              onClick={() => setAdminTab('gallery')}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
                adminTab === 'gallery' ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Galeri</span>
            </button>
            <button
              onClick={() => setAdminTab('profile')}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
                adminTab === 'profile' ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Profil</span>
            </button>
          </div>
        </nav>
      </div>
    );
  }

  // MEMBER / GUARD WORKSPACE
  return (
    <div className="min-h-screen bg-[#020817] text-slate-100 flex flex-col">
      <OfflineBanner />

      {/* Member View Router */}
      <div className="flex-1">
        {memberTab === 'home' && <MemberHome onNavigate={setMemberTab} />}
        {memberTab === 'patrol' && <PatrolActiveView onBack={() => setMemberTab('home')} />}
        {memberTab === 'handover' && <HandoverView onBack={() => setMemberTab('home')} />}
        {memberTab === 'incidents' && <IncidentView onBack={() => setMemberTab('home')} />}
        {memberTab === 'gallery' && <GalleryView onBack={() => setMemberTab('home')} />}
        {memberTab === 'profile' && <ProfileView onBack={() => setMemberTab('home')} />}
      </div>

      {/* Member Mobile Tactical Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#08111f]/95 px-2 py-2 shadow-[0_-12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl" aria-label="Navigasi Anggota">
        <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
          <button
            onClick={() => setMemberTab('home')}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
              memberTab === 'home'
                ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Beranda</span>
          </button>

          <button
            onClick={() => setMemberTab('patrol')}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
              memberTab === 'patrol'
                ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Patroli</span>
          </button>

          <button
            onClick={() => setMemberTab('handover')}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
              memberTab === 'handover'
                ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Mutasi</span>
          </button>

          <button
            onClick={() => setMemberTab('incidents')}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
              memberTab === 'incidents'
                ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Insiden</span>
          </button>

          <button
            onClick={() => setMemberTab('gallery')}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
              memberTab === 'gallery'
                ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Galeri</span>
          </button>

          <button
            onClick={() => setMemberTab('profile')}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold transition ${
              memberTab === 'profile'
                ? 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Profil</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
