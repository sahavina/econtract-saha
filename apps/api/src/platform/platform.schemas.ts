import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const nullableText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());
const isoDate = z.iso.date('Ngày không hợp lệ (YYYY-MM-DD)');
const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());

// ── Doanh nghiệp ──

const tenantFields = z.object({
  name: z.string().trim().min(1, 'Nhập tên doanh nghiệp').max(255),
  taxCode: nullableText(20),
  address: nullableText(500),
  email: z.preprocess((v) => (v === '' ? null : v), z.email('Email không hợp lệ').nullable().optional()),
  phone: nullableText(30),
});

export const tenantCreateSchema = tenantFields.extend({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,29}$/, 'Mã doanh nghiệp 2–30 ký tự: chữ thường không dấu, số, dấu gạch ngang'),
  planId: z.uuid('Chọn gói dịch vụ'),
  subscriptionStatus: z.enum(['TRIAL', 'ACTIVE']).default('TRIAL'),
  /** Số ngày dùng thử / thời hạn gói; bỏ trống ⇒ không thời hạn. */
  durationDays: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(3650).optional()),
  admin: z.object({
    fullName: z.string().trim().min(1, 'Nhập họ tên quản trị viên').max(255),
    email: z.email('Email quản trị viên không hợp lệ').trim().toLowerCase(),
    password: z.string().refine(isStrongPassword, PASSWORD_RULE_MESSAGE),
  }),
});
export type TenantCreate = z.infer<typeof tenantCreateSchema>;

export const tenantUpdateSchema = tenantFields.partial();
export type TenantUpdate = z.infer<typeof tenantUpdateSchema>;

export const tenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']),
  reason: nullableText(500),
});
export type TenantStatusInput = z.infer<typeof tenantStatusSchema>;

export const tenantQuerySchema = paginationSchema.extend({
  q: optionalString,
  status: z.preprocess(emptyToUndefined, z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional()),
  planId: optionalUuid,
});
export type TenantQuery = z.infer<typeof tenantQuerySchema>;

// ── Gói dịch vụ ──

const planFields = z.object({
  name: z.string().trim().min(1, 'Nhập tên gói').max(100),
  description: nullableText(500),
  maxUsers: z.coerce.number().int().min(1).max(100_000),
  maxContractsYear: z.coerce.number().int().min(1).max(10_000_000),
  storageQuotaMb: z.coerce.number().int().min(1).max(100_000_000),
  priceMonthly: z.coerce.number().min(0).max(1e12),
  isActive: z.boolean(),
});

export const planCreateSchema = planFields.extend({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,29}$/, 'Mã gói 2–30 ký tự: chữ thường không dấu, số, gạch ngang/gạch dưới'),
  isActive: planFields.shape.isActive.default(true),
});
export type PlanCreate = z.infer<typeof planCreateSchema>;

export const planUpdateSchema = planFields.partial();
export type PlanUpdate = z.infer<typeof planUpdateSchema>;

// ── Subscription ──

export const subscriptionCreateSchema = z.object({
  planId: z.uuid('Chọn gói dịch vụ'),
  status: z.enum(['TRIAL', 'ACTIVE']).default('ACTIVE'),
  startsAt: z.preprocess(emptyToUndefined, isoDate.optional()),
  endsAt: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional()),
  note: nullableText(500),
});
export type SubscriptionCreate = z.infer<typeof subscriptionCreateSchema>;

export const subscriptionUpdateSchema = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']).optional(),
  endsAt: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional()),
  note: nullableText(500),
});
export type SubscriptionUpdate = z.infer<typeof subscriptionUpdateSchema>;

// ── Hóa đơn ──

export const invoiceCreateSchema = z.object({
  tenantId: z.uuid('Chọn doanh nghiệp'),
  periodStart: isoDate,
  months: z.coerce.number().int().min(1).max(36),
  /** Bỏ trống ⇒ đơn giá tháng của gói hiện hành × số tháng. */
  amount: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(1e13).optional()),
  dueDate: z.preprocess(emptyToUndefined, isoDate.optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  note: nullableText(500),
});
export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;

export const invoiceQuerySchema = paginationSchema.extend({
  tenantId: optionalUuid,
  status: z.preprocess(emptyToUndefined, z.enum(['ISSUED', 'PAID', 'VOID', 'OVERDUE']).optional()),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

export const invoiceVoidSchema = z.object({ reason: z.string().trim().min(1, 'Nhập lý do hủy').max(500) });

// ── Nhật ký hệ thống ──

export const platformAuditQuerySchema = paginationSchema.extend({
  tenantId: optionalUuid,
  action: optionalString,
  platformOnly: z.preprocess((v) => v === true || v === 'true', z.boolean()),
});
export type PlatformAuditQuery = z.infer<typeof platformAuditQuerySchema>;

/** Kỳ hóa đơn: từ periodStart đến hết (periodStart + months tháng − 1 ngày). */
export function invoicePeriodEnd(periodStart: string, months: number): Date {
  const [y, m, d] = periodStart.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d - 1));
}
