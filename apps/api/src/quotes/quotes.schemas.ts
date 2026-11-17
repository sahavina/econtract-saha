import { PAYMENT_SEND_METHODS, QUOTE_CODE_TOKENS, QUOTE_DECISIONS, QUOTE_FILTER_STATUSES, validateCodePattern } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const nullableText = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const nullableUuid = z.preprocess(emptyToNull, z.uuid().nullable().optional());
const isoDate = z.iso.date('Ngày không hợp lệ (YYYY-MM-DD)');
const nullableDate = z.preprocess(emptyToNull, isoDate.nullable().optional());
const optionalUuid = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional());
const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,18}(\.\d{1,2})?$/.test(v), 'Đơn giá không hợp lệ (tối đa 2 chữ số thập phân)');
const quantity = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,15}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Số lượng phải lớn hơn 0 (tối đa 3 chữ số thập phân)');
const rate = z.preprocess(
  emptyToNull,
  z
    .union([z.number(), z.string()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Thuế VAT không hợp lệ')
    .nullable()
    .optional(),
);

export const quoteItemSchema = z.object({
  productId: nullableUuid,
  code: nullableText(60),
  name: z.string().trim().min(1, 'Nhập tên hàng hóa').max(500),
  unit: nullableText(30),
  quantity,
  unitPrice: money,
});

const base = z.object({
  date: isoDate,
  validUntil: nullableDate,
  partnerId: nullableUuid,
  customerName: z.string().trim().min(1, 'Nhập tên khách hàng').max(255),
  customerTaxCode: nullableText(30),
  customerAddress: nullableText(500),
  customerContact: nullableText(255),
  customerPhone: nullableText(60),
  customerEmail: z.preprocess(emptyToNull, z.email('Email khách hàng không hợp lệ').nullable().optional()),
  vatRate: rate,
  paymentTerms: nullableText(2000),
  deliveryTerms: nullableText(2000),
  note: nullableText(2000),
  items: z.array(quoteItemSchema).min(1, 'Báo giá cần ít nhất một dòng hàng').max(200),
});
export const quoteCreateSchema = base;
export type QuoteCreate = z.infer<typeof quoteCreateSchema>;
export const quoteUpdateSchema = base.partial();
export type QuoteUpdate = z.infer<typeof quoteUpdateSchema>;

export const quoteMarkSentSchema = z.object({ method: z.enum(PAYMENT_SEND_METHODS), note: nullableText(500) });
export type QuoteMarkSent = z.infer<typeof quoteMarkSentSchema>;

/** Khách đồng ý, từ chối, hoặc mở lại (chưa có quyết định). */
export const quoteDecisionSchema = z.object({ decision: z.enum(QUOTE_DECISIONS) });
export type QuoteDecision = z.infer<typeof quoteDecisionSchema>;

export const quoteSendEmailSchema = z.object({
  to: z.email('Email người nhận không hợp lệ'),
  cc: z.preprocess((v) => (v === '' ? undefined : v), z.email('Email CC không hợp lệ').optional()),
  subject: z.string().trim().min(1, 'Nhập tiêu đề email').max(255),
  message: z.string().trim().min(1, 'Nhập nội dung email').max(5000),
});
export type QuoteSendEmail = z.infer<typeof quoteSendEmailSchema>;

export const quoteLinkOrderSchema = z.object({ orderId: z.uuid() });
export type QuoteLinkOrder = z.infer<typeof quoteLinkOrderSchema>;

export const quoteQuerySchema = paginationSchema.extend({
  q: optionalString,
  /** Gồm cả "Hết hạn" (suy ra từ ngày hiệu lực). */
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(QUOTE_FILTER_STATUSES).optional()),
  partnerId: optionalUuid,
  from: optionalDate,
  to: optionalDate,
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

/** Cấu hình mã báo giá của doanh nghiệp (lưu trong Tenant.settings). */
export const quoteCodeSettingsSchema = z.object({
  pattern: z
    .string()
    .trim()
    .max(100, 'Mẫu mã tối đa 100 ký tự')
    .superRefine((v, ctx) => {
      const err = validateCodePattern(v, QUOTE_CODE_TOKENS, 'mẫu mã báo giá');
      if (err) ctx.addIssue({ code: 'custom', message: err });
    }),
});
export type QuoteCodeSettings = z.infer<typeof quoteCodeSettingsSchema>;
