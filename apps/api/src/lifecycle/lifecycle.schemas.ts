import { z } from 'zod';

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const nullableText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const nullableDate = z.preprocess(emptyToNull, z.iso.date('Ngày không hợp lệ').nullable().optional());
const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^-?\d{1,18}(\.\d{1,2})?$/.test(v), 'Số tiền không hợp lệ');
const positiveMoney = money.refine((v) => Number(v) > 0, 'Số tiền phải lớn hơn 0');

// ───── Phụ lục ─────
const appendixFields = z.object({
  title: z.string().trim().min(1, 'Nhập tiêu đề phụ lục').max(500),
  kind: z.enum(['AMENDMENT', 'EXTENSION', 'OTHER']),
  contentHtml: z.string().max(2_000_000).nullable().optional(),
  valueChange: z.preprocess(emptyToNull, money.nullable().optional()),
  newExpiryDate: nullableDate,
  effectiveDate: nullableDate,
});
export const appendixCreateSchema = appendixFields.refine((v) => v.kind !== 'EXTENSION' || !!v.newExpiryDate, {
  message: 'Phụ lục gia hạn cần ngày hết hạn mới',
  path: ['newExpiryDate'],
});
export const appendixUpdateSchema = appendixFields.partial();
export type AppendixCreate = z.infer<typeof appendixCreateSchema>;
export type AppendixUpdate = z.infer<typeof appendixUpdateSchema>;

// ───── Nghĩa vụ ─────
const obligationFields = z.object({
  title: z.string().trim().min(1, 'Nhập nội dung nghĩa vụ').max(500),
  description: nullableText(5000),
  partyRole: z.preprocess(emptyToNull, z.enum(['PARTY_A', 'PARTY_B', 'PARTY_C', 'RELATED']).nullable().optional()),
  assigneeId: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  dueDate: nullableDate,
  progress: z.coerce.number().int().min(0).max(100),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
});
export const obligationCreateSchema = obligationFields.extend({
  progress: obligationFields.shape.progress.default(0),
  status: obligationFields.shape.status.default('OPEN'),
});
export const obligationUpdateSchema = obligationFields.partial();
export type ObligationCreate = z.infer<typeof obligationCreateSchema>;
export type ObligationUpdate = z.infer<typeof obligationUpdateSchema>;

// ───── Thanh toán ─────
const paymentFields = z.object({
  title: z.string().trim().min(1, 'Nhập nội dung đợt thanh toán').max(500),
  amount: positiveMoney,
  dueDate: nullableDate,
  note: nullableText(2000),
});
export const paymentCreateSchema = paymentFields;
export const paymentUpdateSchema = paymentFields.partial().extend({ cancelled: z.boolean().optional() });
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;

export const recordPaymentSchema = z.object({
  amount: positiveMoney,
  paidDate: z.iso.date('Ngày không hợp lệ'),
  invoiceNo: nullableText(100),
});
export type RecordPayment = z.infer<typeof recordPaymentSchema>;

// ───── Nghiệm thu ─────
export const acceptanceCreateSchema = z.object({
  title: z.string().trim().min(1, 'Nhập nội dung nghiệm thu').max(500),
  acceptedDate: z.iso.date('Ngày không hợp lệ'),
  result: z.enum(['PASSED', 'CONDITIONAL', 'FAILED']),
  note: nullableText(5000),
});
export type AcceptanceCreate = z.infer<typeof acceptanceCreateSchema>;

// ───── Thanh lý ─────
export const liquidateSchema = z.object({
  liquidationDate: z.iso.date('Ngày không hợp lệ'),
  note: z.string().trim().min(1, 'Nhập nội dung/biên bản thanh lý').max(5000),
  /** Xác nhận thanh lý dù còn thanh toán/nghĩa vụ chưa hoàn tất. */
  force: z.boolean().default(false),
});
export type LiquidateInput = z.infer<typeof liquidateSchema>;

// ───── Tra cứu chung ─────
export const lifecycleListSchema = z.object({
  kind: z.enum(['appendices', 'obligations', 'payments', 'acceptances']),
  view: z.enum(['all', 'open', 'overdue', 'mine', 'due_soon', 'done']).default('all'),
});
export type LifecycleListQuery = z.infer<typeof lifecycleListSchema>;

export const calendarSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Tháng dạng YYYY-MM') });
