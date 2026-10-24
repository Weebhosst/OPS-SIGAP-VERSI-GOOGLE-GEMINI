/**
 * OPS SIGAP — Authentication Context
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types/ops';
import { api, ApiError } from '../lib/api';
import { offlineQueue } from '../lib/offlineQueue';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  offlineRecovered: boolean;
  login: (npk: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface OfflineIdentitySnapshot {
  user: User;
  sessionExpiresAt: string;
  verifiedAt: string;
}

const OFFLINE_IDENTITY_KEY = 'ops:offlineIdentity:v1';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function clearOfflineIdentity() {
  try {
    localStorage.removeItem(OFFLINE_IDENTITY_KEY);
  } catch {}
}

function saveOfflineIdentity(user: User, sessionExpiresAt?: string) {
  if (
    user.role !== 'ANGGOTA'
    || user.status !== 'ACTIVE'
    || user.mustChangePassword
    || !sessionExpiresAt
    || new Date(sessionExpiresAt).getTime() <= Date.now()
  ) {
    clearOfflineIdentity();
    return;
  }

  try {
    const { passwordHash: _passwordHash, ...safeUser } = user as User;
    void _passwordHash;
    const snapshot: OfflineIdentitySnapshot = {
      user: safeUser as User,
      sessionExpiresAt,
      verifiedAt: new Date().toISOString(),
    };
    localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify(snapshot));
  } catch {}
}

function readOfflineIdentity(): OfflineIdentitySnapshot | null {
  try {
    const raw = localStorage.getItem(OFFLINE_IDENTITY_KEY);
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as OfflineIdentitySnapshot;
    const expiresAt = new Date(snapshot.sessionExpiresAt).getTime();
    if (
      !snapshot.user
      || snapshot.user.role !== 'ANGGOTA'
      || snapshot.user.status !== 'ACTIVE'
      || snapshot.user.mustChangePassword
      || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now()
    ) {
      clearOfflineIdentity();
      return null;
    }

    return snapshot;
  } catch {
    clearOfflineIdentity();
    return null;
  }
}

function canRecoverFromError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return false;
    return !error.status || error.status >= 500;
  }
  return true;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineRecovered, setOfflineRecovered] = useState(false);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        const res = await api.getMe();
        if (!active) return;

        if (res.success && res.user) {
          setUser(res.user);
          setOfflineRecovered(false);
          if (res.user.role === 'ANGGOTA') {
            saveOfflineIdentity(res.user, res.sessionExpiresAt);
            offlineQueue.setActiveUser(res.user.id);
          } else {
            clearOfflineIdentity();
            offlineQueue.setActiveUser(null);
          }
        }
      } catch (error) {
        if (!active) return;

        if (!canRecoverFromError(error)) {
          clearOfflineIdentity();
          offlineQueue.setActiveUser(null);
          setUser(null);
          setOfflineRecovered(false);
          return;
        }

        const snapshot = readOfflineIdentity();
        if (snapshot) {
          setUser(snapshot.user);
          setOfflineRecovered(true);
          offlineQueue.setActiveUser(snapshot.user.id);
          await offlineQueue.recoverInterruptedSync(snapshot.user.id);
        } else {
          setUser(null);
          setOfflineRecovered(false);
          offlineQueue.setActiveUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!offlineRecovered || !user) return;

    const snapshot = readOfflineIdentity();
    if (!snapshot) {
      setUser(null);
      setOfflineRecovered(false);
      offlineQueue.setActiveUser(null);
      return;
    }

    const remainingMs = new Date(snapshot.sessionExpiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      clearOfflineIdentity();
      setUser(null);
      setOfflineRecovered(false);
      offlineQueue.setActiveUser(null);
      return;
    }

    const timer = window.setTimeout(() => {
      clearOfflineIdentity();
      setUser(null);
      setOfflineRecovered(false);
      offlineQueue.setActiveUser(null);
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [offlineRecovered, user?.id]);

  useEffect(() => {
    if (!user) return;

    const revalidateOnReconnect = async () => {
      try {
        const res = await api.getMe();
        if (!res.success || !res.user) return;

        setUser(res.user);
        setOfflineRecovered(false);
        if (res.user.role === 'ANGGOTA') {
          saveOfflineIdentity(res.user, res.sessionExpiresAt);
          offlineQueue.setActiveUser(res.user.id);
        } else {
          clearOfflineIdentity();
          offlineQueue.setActiveUser(null);
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearOfflineIdentity();
          offlineQueue.setActiveUser(null);
          setUser(null);
          setOfflineRecovered(false);
        }
      }
    };

    window.addEventListener('online', revalidateOnReconnect);
    return () => window.removeEventListener('online', revalidateOnReconnect);
  }, [user?.id]);

  const login = async (npk: string, pass: string) => {
    const res = await api.login(npk, pass);
    setUser(res.user);
    setOfflineRecovered(false);

    if (res.user.role === 'ANGGOTA') {
      saveOfflineIdentity(res.user, res.sessionExpiresAt);
      offlineQueue.setActiveUser(res.user.id);
    } else {
      clearOfflineIdentity();
      offlineQueue.setActiveUser(null);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}

    if (user) sessionStorage.removeItem(`ops:lastRoute:${user.id}`);
    clearOfflineIdentity();
    offlineQueue.setActiveUser(null);
    setUser(null);
    setOfflineRecovered(false);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await api.changePassword(currentPassword, newPassword);
    setUser(res.user);
    setOfflineRecovered(false);

    try {
      const verified = await api.getMe();
      if (verified.success) {
        setUser(verified.user);
        if (verified.user.role === 'ANGGOTA') {
          saveOfflineIdentity(verified.user, verified.sessionExpiresAt);
          offlineQueue.setActiveUser(verified.user.id);
        }
      }
    } catch {}
  };

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      if (res.success) {
        setUser(res.user);
        setOfflineRecovered(false);
        if (res.user.role === 'ANGGOTA') {
          saveOfflineIdentity(res.user, res.sessionExpiresAt);
          offlineQueue.setActiveUser(res.user.id);
        }
      }
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        offlineRecovered,
        login,
        logout,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
