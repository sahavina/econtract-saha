import { SHIPPING_NOTE_STATUSES } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const nullableText = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const nullableUuid = z.preprocess(emptyToNull, z.uuid().nullable().optional());
const isoDate = z.iso.date('Ngày không hợp lệ (YYYY-MM-DD)');
const optionalUuid = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional());

const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,18}(\.\d{1,2})?$/.test(v), 'Giá trị tiền không hợp lệ (tối đa 2 chữ số thập phân)');
const quantity = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,15}(\.\d{1,3})?$/.test(v), 'Số lượng không hợp lệ (tối đa 3 chữ số thập phân)');

// ───────── Phiếu xuất kho ─────────

export const stockIssueItemSchema = z.object({
  productId: nullableUuid,
  /** Dòng hàng của đơn đặt hàng (khi lập từ đơn). */
  orderItemId: nullableUuid,
  code: nullableText(60),
  name: z.string().trim().min(1, 'Nhập tên hàng hóa').max(500),
  unit: nullableText(30),
  requestedQty: quantity,
  quantity: quantity.refine((v) => Number(v) > 0, 'Số lượng thực xuất phải lớn hơn 0'),
  unitPrice: money.default('0'),
});
export type StockIssueItemInput = z.infer<typeof stockIssueItemSchema>;

const stockIssueHeader = z.object({
  issueDate: isoDate,
  receiverName: z.string().trim().min(1, 'Nhập họ tên người nhận hàng').max(255),
  receiverUnit: nullableText(255),
  receiverAddress: nullableText(500),
  reason: nullableText(500),
  warehouse: nullableText(255),
  warehouseAddress: nullableText(500),
  debitAccount: nullableText(30),
  creditAccount: nullableText(30),
  attachments: nullableText(255),
  note: nullableText(2000),
});

export const stockIssueCreateSchema = stockIssueHeader.extend({
  orderId: nullableUuid,
  items: z.array(stockIssueItemSchema).min(1, 'Phiếu xuất kho cần ít nhất một dòng hàng').max(200),
});
export type StockIssueCreate = z.infer<typeof stockIssueCreateSchema>;

/** Sau khi xuất chỉ sửa thông tin chung; số lượng sai thì hủy phiếu và lập lại. */
export const stockIssueUpdateSchema = stockIssueHeader.partial();
export type StockIssueUpdate = z.infer<typeof stockIssueUpdateSchema>;

export const stockIssueCancelSchema = z.object({ reason: z.string().trim().min(1, 'Nhập lý do hủy phiếu').max(500) });
export type StockIssueCancel = z.infer<typeof stockIssueCancelSchema>;

export const stockIssueQuerySchema = paginationSchema.extend({
  q: optionalString,
  orderId: optionalUuid,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['ISSUED', 'CANCELLED']).optional()),
  from: optionalDate,
  to: optionalDate,
});
export type StockIssueQuery = z.infer<typeof stockIssueQuerySchema>;

// ───────── Phiếu gửi hàng ─────────

const shippingNoteBase = z.object({
  sendDate: isoDate,
  stockIssueId: nullableUuid,
  orderId: nullableUuid,
  fromContact: nullableText(255),
  fromPhone: nullableText(60),
  fromCompany: nullableText(255),
  fromAddress: nullableText(500),
  warning: nullableText(255),
  toCompany: z.string().trim().min(1, 'Nhập công ty / người nhận').max(255),
  toContact: nullableText(255),
  toAddress: z.string().trim().min(1, 'Nhập địa chỉ giao').max(500),
  toPhones: nullableText(120),
  footNote: nullableText(255),
  boxes: z.coerce.number().int().min(1).max(200),
  showBoxNumber: z.boolean(),
  layout: z.enum(['A4', 'A5x2']),
  carrier: nullableText(255),
  carrierPhone: nullableText(60),
  vehicle: nullableText(60),
  trackingNo: nullableText(60),
  freight: z.preprocess(emptyToNull, money.nullable().optional()),
  freightPayer: z.preprocess(emptyToNull, z.enum(['SENDER', 'RECEIVER']).nullable().optional()),
  status: z.enum(SHIPPING_NOTE_STATUSES),
  note: nullableText(2000),
});
// Zod 4: `.partial()` vẫn áp default ⇒ schema sửa dựng từ object không default.
export const shippingNoteCreateSchema = shippingNoteBase.extend({
  boxes: shippingNoteBase.shape.boxes.default(1),
  showBoxNumber: z.boolean().default(true),
  layout: shippingNoteBase.shape.layout.default('A4'),
  status: shippingNoteBase.shape.status.default('DRAFT'),
});
export type ShippingNoteCreate = z.infer<typeof shippingNoteCreateSchema>;
export const shippingNoteUpdateSchema = shippingNoteBase.partial();
export type ShippingNoteUpdate = z.infer<typeof shippingNoteUpdateSchema>;

export const shippingNoteQuerySchema = paginationSchema.extend({
  q: optionalString,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SHIPPING_NOTE_STATUSES).optional()),
  orderId: optionalUuid,
  stockIssueId: optionalUuid,
  from: optionalDate,
  to: optionalDate,
});
export type ShippingNoteQuery = z.infer<typeof shippingNoteQuerySchema>;
