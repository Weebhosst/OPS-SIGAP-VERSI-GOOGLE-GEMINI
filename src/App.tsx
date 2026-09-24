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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center animate-pulse">
          <Shield className="w-6 h-6" />
        </div>
        <div className="mt-4 text-xs text-slate-400 font-mono">Memuat OPS SIGAP...</div>
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
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-xs font-mono text-slate-400">Memulihkan tampilan terakhir...</div>;
  }

  // SUPER ADMIN / ADMIN WORKSPACE
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
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

        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 shadow-2xl">
          <div className="max-w-xl mx-auto flex items-center justify-around">
            <button
              onClick={() => setAdminTab('command')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'command'
                  ? 'text-blue-400 bg-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Command</span>
            </button>

            <button
              onClick={() => setAdminTab('master')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${adminTab === 'master' ? 'text-blue-400 bg-blue-950/50' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Building2 className="w-4 h-4" />
              <span>Master</span>
            </button>

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <button
              onClick={() => setAdminTab('checkpoints')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'checkpoints'
                  ? 'text-blue-400 bg-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Titik QR</span>
            </button>}

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <button
              onClick={() => setAdminTab('users')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'users'
                  ? 'text-blue-400 bg-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Petugas</span>
            </button>}

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <button
              onClick={() => setAdminTab('calibration')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'calibration'
                  ? 'text-blue-400 bg-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Radius</span>
            </button>}

            <button
              onClick={() => setAdminTab('gallery')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${adminTab === 'gallery' ? 'text-blue-400 bg-blue-950/50' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Galeri</span>
            </button>

            <button
              onClick={() => setAdminTab('audit')}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'audit'
                  ? 'text-blue-400 bg-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200'
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <OfflineBanner />
        <div className="flex-1">
          {adminTab === 'command' && <AdminCommandCenter onNavigateTab={(tab: any) => setAdminTab(tab)} />}
          {adminTab === 'master' && <MasterMonitoringView onBack={() => setAdminTab('command')} onNavigate={setAdminTab} />}
          {adminTab === 'gallery' && <GalleryView onBack={() => setAdminTab('command')} />}
          {adminTab === 'handovers' && <HandoverView onBack={() => setAdminTab('command')} />}
          {adminTab === 'incidents' && <IncidentView onBack={() => setAdminTab('command')} />}
          {adminTab === 'profile' && <ProfileView onBack={() => setAdminTab('command')} />}
        </div>
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2 shadow-2xl">
          <div className="max-w-md mx-auto flex items-center justify-around">
            <button
              onClick={() => setAdminTab('command')}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'command' ? 'text-blue-400 bg-blue-950/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Monitor</span>
            </button>
            <button
              onClick={() => setAdminTab('master')}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'master' ? 'text-blue-400 bg-blue-950/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Session</span>
            </button>
            <button
              onClick={() => setAdminTab('gallery')}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'gallery' ? 'text-blue-400 bg-blue-950/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Galeri</span>
            </button>
            <button
              onClick={() => setAdminTab('profile')}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
                adminTab === 'profile' ? 'text-blue-400 bg-blue-950/60' : 'text-slate-400 hover:text-slate-200'
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => setMemberTab('home')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
              memberTab === 'home'
                ? 'text-blue-400 bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Beranda</span>
          </button>

          <button
            onClick={() => setMemberTab('patrol')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
              memberTab === 'patrol'
                ? 'text-blue-400 bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Patroli</span>
          </button>

          <button
            onClick={() => setMemberTab('handover')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
              memberTab === 'handover'
                ? 'text-blue-400 bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Mutasi</span>
          </button>

          <button
            onClick={() => setMemberTab('incidents')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
              memberTab === 'incidents'
                ? 'text-blue-400 bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Insiden</span>
          </button>

          <button
            onClick={() => setMemberTab('gallery')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
              memberTab === 'gallery'
                ? 'text-blue-400 bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Galeri</span>
          </button>

          <button
            onClick={() => setMemberTab('profile')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold transition ${
              memberTab === 'profile'
                ? 'text-blue-400 bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-200'
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
