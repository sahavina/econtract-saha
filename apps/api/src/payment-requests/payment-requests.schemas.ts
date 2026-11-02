import { PAYMENT_REQUEST_STATUSES } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const nullableText = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const nullableUuid = z.preprocess(emptyToNull, z.uuid().nullable().optional());
const isoDate = z.iso.date('Ngày không hợp lệ (YYYY-MM-DD)');
const optionalUuid = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional());

const base = z.object({
  number: z.string().trim().min(1, 'Nhập số đề nghị').max(120),
  date: isoDate,
  place: nullableText(120),
  company: z.string().trim().min(1, 'Nhập công ty đề nghị').max(255),
  recipient: z.string().trim().min(1, 'Nhập nơi kính gửi').max(255),
  basis: nullableText(2000),
  /** Số tiền nguyên đồng, như trên giấy đề nghị. */
  amount: z
    .string()
    .regex(/^\d{1,18}$/, 'Số tiền không hợp lệ')
    .refine((v) => Number(v) > 0, 'Số tiền phải lớn hơn 0'),
  beneficiary: z.string().trim().min(1, 'Nhập đơn vị thụ hưởng').max(255),
  account: nullableText(255),
  accountHolder: nullableText(255),
  signerPosition: nullableText(120),
  signerName: nullableText(255),
  contractId: nullableUuid,
  templateId: nullableUuid,
  status: z.enum(PAYMENT_REQUEST_STATUSES),
});
// Zod 4: `.partial()` vẫn áp default ⇒ schema sửa dựng từ object không default.
export const paymentRequestCreateSchema = base.extend({ status: base.shape.status.default('DRAFT') });
export type PaymentRequestCreate = z.infer<typeof paymentRequestCreateSchema>;
export const paymentRequestUpdateSchema = base.partial();
export type PaymentRequestUpdate = z.infer<typeof paymentRequestUpdateSchema>;

export const paymentRequestQuerySchema = paginationSchema.extend({
  q: optionalString,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PAYMENT_REQUEST_STATUSES).optional()),
  contractId: optionalUuid,
  /** Đề nghị gắn hợp đồng, đơn đặt hàng của đối tác này. */
  partnerId: optionalUuid,
  from: optionalDate,
  to: optionalDate,
});
export type PaymentRequestQuery = z.infer<typeof paymentRequestQuerySchema>;
