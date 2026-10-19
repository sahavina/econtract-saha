import { PARTNER_TYPES } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const nullableText = (max = 500) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

const partnerFields = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã đối tác').max(50),
  type: z.enum(PARTNER_TYPES),
  entityType: z.enum(['ORGANIZATION', 'INDIVIDUAL']),
  name: z.string().trim().min(1, 'Vui lòng nhập tên đối tác').max(255),
  // Viết hoa, không dấu, không khoảng trắng – dùng trong mã hợp đồng ({PARTNER}).
  shortName: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v),
    z.string().max(30).regex(/^[A-Z0-9_-]+$/, 'Tên viết tắt chỉ gồm chữ không dấu, số, "-" hoặc "_"').nullable().optional(),
  ),
  taxCode: nullableText(20),
  idNumber: nullableText(30),
  address: nullableText(),
  email: z.preprocess((v) => (v === '' ? null : v), z.email('Email không hợp lệ').nullable().optional()),
  phone: nullableText(30),
  representative: nullableText(255),
  position: nullableText(255),
  externalRef: nullableText(100),
  note: nullableText(2000),
});

export const partnerInputSchema = partnerFields.extend({
  entityType: partnerFields.shape.entityType.default('ORGANIZATION'),
});
export type PartnerInput = z.infer<typeof partnerInputSchema>;

// Dựng từ partnerFields (không default) – Zod 4 `.partial()` vẫn áp default.
export const partnerUpdateSchema = partnerFields.partial();
export type PartnerUpdate = z.infer<typeof partnerUpdateSchema>;

export const partnerQuerySchema = paginationSchema.extend({
  q: optionalString,
  type: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PARTNER_TYPES).optional()),
});
export type PartnerQuery = z.infer<typeof partnerQuerySchema>;
