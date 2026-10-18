import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Partner } from '@/lib/types';

export interface OdooConfig {
  configured: boolean;
  enabled?: boolean;
  url?: string;
  db?: string;
  username?: string;
  hasApiKey?: boolean;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
}

export interface OdooPartnerResult {
  odooId: number;
  name: string;
  isCompany: boolean;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  ref: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  imported: { id: string; code: string } | null;
}

export type OdooKind = 'CUSTOMER' | 'SUPPLIER';

export function useOdooConfig(enabled = true) {
  return useQuery({ queryKey: ['odoo', 'config'], queryFn: () => api<OdooConfig>('/integrations/odoo'), enabled, staleTime: 60_000 });
}

/** Odoo đã cấu hình và đang bật ⇒ hiện các nút nhập/chọn từ Odoo. */
export const odooReady = (c: OdooConfig | undefined) => !!c?.configured && !!c.enabled;

export const importOdooPartner = (odooId: number, type?: OdooKind) =>
  api<Partner>('/integrations/odoo/partners/import', { method: 'POST', body: { odooId, type } });

export const isOdooPartner = (p: Pick<Partner, 'externalRef'>) => !!p.externalRef?.startsWith('odoo:');
