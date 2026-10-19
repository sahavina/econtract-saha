import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MisaConfig {
  configured: boolean;
  enabled?: boolean;
  baseUrl: string;
  clientId?: string | null;
  hasSecret?: boolean;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
}

export interface MisaStatus {
  ready: boolean;
  account: {
    username: string;
    displayName: string | null;
    linked: boolean;
    pendingOtp: boolean;
    certAlias: string | null;
    certSubject: string | null;
  } | null;
}

export interface MisaCertificate {
  keyAlias: string;
  keyStatus?: string;
  subject: string | null;
  appName?: string;
}

export interface MisaSession {
  id: string;
  status: 'PENDING' | 'ATTACHING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  error: string | null;
  expiresAt: string;
  resultDocumentId: string | null;
}

export const DEFAULT_MISA_BASE_URL = 'https://developer.misa.vn/apis';

export function useMisaConfig(enabled = true) {
  return useQuery({ queryKey: ['esign', 'config'], queryFn: () => api<MisaConfig>('/esign/misa/config'), enabled });
}

export function useMisaStatus(enabled = true) {
  return useQuery({ queryKey: ['esign', 'status'], queryFn: () => api<MisaStatus>('/esign/misa/status'), enabled });
}
