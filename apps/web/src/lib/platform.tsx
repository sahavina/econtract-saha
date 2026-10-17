'use client';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxUsers: number;
  maxContractsYear: number;
  storageQuotaMb: number;
  priceMonthly: string;
  isActive: boolean;
  tenantCount: number;
}

export interface Usage {
  users: number;
  contractsThisYear: number;
  storageBytes: number;
}

export interface PlanRef {
  id: string;
  code: string;
  name: string;
  priceMonthly: string;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
  note: string | null;
  createdAt: string;
  plan: PlanRef;
}

export interface TenantRef {
  id: string;
  code: string;
  name: string;
}

export interface TenantRow extends TenantRef {
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  status: TenantStatus;
  createdAt: string;
  subscription: { id: string; status: SubscriptionStatus; endsAt: string | null; plan: PlanRef } | null;
  usage: Usage;
}

export interface Invoice {
  id: string;
  tenantId: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  description: string;
  amount: string;
  status: InvoiceStatus;
  dueDate: string;
  issuedAt: string;
  paidAt: string | null;
  note: string | null;
  overdue: boolean;
  tenant?: TenantRef;
}

export interface TenantDetail extends Omit<TenantRow, 'subscription'> {
  currentSubscriptionId: string | null;
  limits: { planName: string; maxUsers: number; maxContractsYear: number; storageQuotaMb: number } | null;
  subscriptions: Subscription[];
  admins: { id: string; fullName: string; email: string; status: string; lastLoginAt: string | null }[];
  invoices: Invoice[];
}

export interface PlatformOverview {
  tenants: { total: number; byStatus: Partial<Record<TenantStatus, number>>; newThisMonth: number; withoutSubscription: number };
  subscriptions: { active: number; trial: number; mrr: string };
  byPlan: { planId: string; name: string; tenants: number; mrr: string }[];
  invoices: { unpaidCount: number; unpaidAmount: string; overdueCount: number; overdueAmount: string; paidThisMonth: string };
  expiring: (Subscription & { tenantId: string; tenant: TenantRef })[];
}

const TONE = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  muted: 'bg-muted text-muted-foreground',
};

export const TENANT_STATUS: Record<TenantStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Hoạt động', tone: TONE.green },
  SUSPENDED: { label: 'Tạm ngưng', tone: TONE.amber },
  CLOSED: { label: 'Đã đóng', tone: TONE.muted },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: string }> = {
  TRIAL: { label: 'Dùng thử', tone: TONE.sky },
  ACTIVE: { label: 'Đang dùng', tone: TONE.green },
  PAST_DUE: { label: 'Quá hạn thanh toán', tone: TONE.amber },
  CANCELLED: { label: 'Đã hủy', tone: TONE.muted },
  EXPIRED: { label: 'Hết hạn', tone: TONE.muted },
};

export function invoiceState(inv: Pick<Invoice, 'status' | 'overdue'>) {
  if (inv.status === 'PAID') return { label: 'Đã thanh toán', tone: TONE.green };
  if (inv.status === 'VOID') return { label: 'Đã hủy', tone: TONE.muted };
  return inv.overdue ? { label: 'Quá hạn', tone: TONE.rose } : { label: 'Chờ thanh toán', tone: TONE.amber };
}

export function Pill({ label, tone }: { label: string; tone: string }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', tone)}>{label}</span>;
}

export function formatStorage(bytes: number) {
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.ceil(bytes / 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatQuotaMb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB` : `${mb} MB`;
}

/** Thanh mức sử dụng so với hạn mức gói; chuyển màu khi ≥ 80% và ≥ 100%. */
export function UsageBar({ label, used, limit, display }: { label: string; used: number; limit: number | null; display: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
      {limit !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** Khối hiển thị khi người dùng không phải Super Admin truy cập trang nền tảng. */
export function usePlatformGate() {
  const { user } = useAuth();
  const allowed = !!user?.isPlatformAdmin;
  const denied = <p className="text-sm text-muted-foreground">Chức năng chỉ dành cho Super Admin (quản trị nền tảng).</p>;
  return { allowed, denied };
}

export const todayInput = () => new Date().toISOString().slice(0, 10);

/** Danh sách thông báo lỗi để hiển thị trong form (lỗi từng trường hoặc thông điệp chung). */
export function errorList(err: unknown): string[] {
  if (err instanceof ApiError && err.errors.length) return err.errors.map((e) => e.message);
  return [err instanceof Error ? err.message : 'Thao tác thất bại'];
}

export function FormErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

/** Nhãn trạng thái thuê bao trong lịch sử: gói còn trạng thái dùng được nhưng đã qua ngày kết thúc ⇒ "Đã kết thúc". */
export function subscriptionPill(s: Pick<Subscription, 'status' | 'endsAt'>) {
  const usable = s.status === 'TRIAL' || s.status === 'ACTIVE' || s.status === 'PAST_DUE';
  if (usable && s.endsAt && new Date(s.endsAt) <= new Date()) return { label: 'Đã kết thúc', tone: TONE.muted };
  return SUBSCRIPTION_STATUS[s.status];
}
