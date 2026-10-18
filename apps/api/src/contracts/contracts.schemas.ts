import { CONTRACT_STATUSES } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const nullableText = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const nullableDate = z.preprocess(emptyToNull, z.iso.date('Ngày không hợp lệ (YYYY-MM-DD)').nullable().optional());
const nullableUuid = z.preprocess(emptyToNull, z.uuid().nullable().optional());

const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,18}(\.\d{1,2})?$/.test(v), 'Giá trị tiền không hợp lệ (tối đa 2 chữ số thập phân)');

export const partySchema = z.object({
  role: z.enum(['PARTY_A', 'PARTY_B', 'PARTY_C', 'RELATED']),
  partnerId: nullableUuid,
  isInternal: z.boolean().default(false),
  entityType: z.enum(['ORGANIZATION', 'INDIVIDUAL']).default('ORGANIZATION'),
  name: z.string().trim().min(1, 'Vui lòng nhập tên bên tham gia').max(255),
  taxCode: nullableText(20),
  address: nullableText(),
  email: z.preprocess(emptyToNull, z.email('Email không hợp lệ').nullable().optional()),
  phone: nullableText(30),
  representative: nullableText(255),
  position: nullableText(255),
  authorizationRef: nullableText(500),
  bankAccount: nullableText(255),
});
export type PartyInput = z.infer<typeof partySchema>;

const contractBase = z.object({
  code: z.preprocess(emptyToNull, z.string().trim().max(60).nullable().optional()),
  title: z.string().trim().min(1, 'Vui lòng nhập tên hợp đồng').max(500),
  contractTypeId: nullableUuid,
  group: nullableText(100),
  description: nullableText(5000),
  value: money,
  currency: z.string().trim().length(3).toUpperCase(),
  vatRate: z.preprocess(emptyToNull, z.coerce.number().min(0).max(100).nullable().optional()),
  expectedSignDate: nullableDate,
  effectiveDate: nullableDate,
  expiryDate: nullableDate,
  departmentId: nullableUuid,
  ownerId: nullableUuid,
  confidentiality: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET']),
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  note: nullableText(5000),
  contentHtml: z.string().max(2_000_000).nullable().optional(),
  parties: z.array(partySchema).max(20),
});

const datesInOrder = (v: { effectiveDate?: string | null; expiryDate?: string | null }) =>
  !v.effectiveDate || !v.expiryDate || v.effectiveDate <= v.expiryDate;
const DATE_ORDER_MSG = { message: 'Ngày hết hạn phải sau hoặc bằng ngày hiệu lực', path: ['expiryDate'] };

// Default chỉ áp cho tạo mới. Lưu ý Zod 4: `.partial()` vẫn áp default ⇒ schema cập nhật
// phải dựng từ contractBase (không default) để PATCH một phần không ghi đè trường khác.
export const contractCreateSchema = contractBase
  .extend({
    value: money.default('0'),
    currency: contractBase.shape.currency.default('VND'),
    confidentiality: contractBase.shape.confidentiality.default('INTERNAL'),
    tags: contractBase.shape.tags.default([]),
    parties: contractBase.shape.parties.default([]),
    // Lập hợp đồng từ mẫu: sao chép nội dung & loại hợp đồng của mẫu (nếu không truyền).
    templateId: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  })
  .refine(datesInOrder, DATE_ORDER_MSG);
export type ContractCreate = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = contractBase.omit({ code: true }).partial().refine(datesInOrder, DATE_ORDER_MSG);
export type ContractUpdate = z.infer<typeof contractUpdateSchema>;

export const CONTRACT_VIEWS = [
  'all',
  'mine',
  'draft',
  'pending_approval',
  'pending_signature',
  'active',
  'expiring',
  'expired',
  'liquidated',
  'archived',
  'trash',
] as const;

export const CONTRACT_SORT_FIELDS = [
  'code',
  'title',
  'value',
  'createdAt',
  'signedDate',
  'effectiveDate',
  'expiryDate',
] as const;

export const contractQuerySchema = paginationSchema.extend({
  view: z.enum(CONTRACT_VIEWS).default('all'),
  q: optionalString,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CONTRACT_STATUSES).optional()),
  contractTypeId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  departmentId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  ownerId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  partnerId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  createdFrom: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  createdTo: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  sort: z.enum(CONTRACT_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ContractQuery = z.infer<typeof contractQuerySchema>;

export const contractExportSchema = contractQuerySchema.omit({ page: true, pageSize: true });
export type ContractExportQuery = z.infer<typeof contractExportSchema>;
