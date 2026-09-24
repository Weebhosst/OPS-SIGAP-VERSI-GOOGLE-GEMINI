/**
 * OPS SIGAP — Authentication Context
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types/ops';
import { api } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (npk: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  quickLogin: (npk: string, pass: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    api
      .getMe()
      .then((res) => {
        if (res.success && res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (npk: string, pass: string) => {
    const res = await api.login(npk, pass);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    if (user) sessionStorage.removeItem(`ops:lastRoute:${user.id}`);
    setUser(null);
  };

  const quickLogin = async (npk: string, pass: string) => {
    setLoading(true);
    try {
      await login(npk, pass);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await api.changePassword(currentPassword, newPassword);
    setUser(res.user);
  };

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      if (res.success) setUser(res.user);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, quickLogin, changePassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
