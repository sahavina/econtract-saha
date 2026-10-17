'use client';

import type { Permission } from '@saha/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshAccessToken, setAccessToken, setSessionExpiredHandler } from './api';
import type { Me } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: Me | null;
  login: (input: { tenantCode: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: Permission[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Me | null>(null);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Khôi phục phiên từ refresh cookie khi tải trang.
  useEffect(() => {
    setSessionExpiredHandler(clear);
    let cancelled = false;
    (async () => {
      const ok = await refreshAccessToken();
      if (cancelled) return;
      if (!ok) return setStatus('anonymous');
      try {
        const me = await api<Me>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (!cancelled) clear();
      }
    })();
    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, [clear]);

  const login = useCallback<AuthContextValue['login']>(async (input) => {
    const tokens = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: input });
    setAccessToken(tokens.accessToken);
    const me = await api<Me>('/auth/me');
    setUser(me);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo<AuthContextValue>(() => {
    const perms = new Set(user?.permissions ?? []);
    return { status, user, login, logout, can: (...p) => p.some((x) => perms.has(x)) };
  }, [status, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
