import { INSPECTION_STATUSES } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const isoDate = z.iso.date('Ngày không hợp lệ (YYYY-MM-DD)');
const nullableDate = z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional());

/** Hồ sơ được kiểm tra: hợp đồng/đơn (contractId) hoặc đề nghị thanh toán (paymentRequestId). */
export const inspectionCreateSchema = z
  .object({
    contractId: z.uuid('Hồ sơ không hợp lệ').optional(),
    paymentRequestId: z.uuid('Đề nghị thanh toán không hợp lệ').optional(),
    assigneeId: z.uuid('Chọn người phụ trách kiểm tra'),
    content: z.string().trim().min(1, 'Nhập nội dung cần kiểm tra').max(2000),
    dueDate: nullableDate,
  })
  .refine((v) => !!v.contractId !== !!v.paymentRequestId, { message: 'Chọn hợp đồng/đơn hoặc đề nghị thanh toán cần kiểm tra', path: ['contractId'] });
export type InspectionCreate = z.infer<typeof inspectionCreateSchema>;

/** Đổi người phụ trách / nội dung / hạn (người gửi hoặc quản lý, khi chưa xong). Dựng không default (Zod 4 .partial()). */
export const inspectionUpdateSchema = z.object({
  assigneeId: z.uuid('Chọn người phụ trách kiểm tra'),
  content: z.string().trim().min(1, 'Nhập nội dung cần kiểm tra').max(2000),
  dueDate: nullableDate,
}).partial();
export type InspectionUpdate = z.infer<typeof inspectionUpdateSchema>;

const itemResult = z.object({
  itemId: z.uuid(),
  ok: z.boolean().nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Lưu kết quả đang kiểm (chưa kết thúc) hoặc kết thúc với Đạt / Có vấn đề. */
export const inspectionResultSchema = z.object({
  result: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(4000).nullable().optional()),
  itemResults: z.array(itemResult).max(200).optional(),
  finish: z.enum(['DONE', 'ISSUE']).optional(),
});
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

export const inspectionQuerySchema = paginationSchema.extend({
  /** mine: được giao cho tôi; sent: tôi gửi; all: tất cả (cần quyền quản lý). */
  scope: z.enum(['mine', 'sent', 'all']).default('mine'),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(INSPECTION_STATUSES).optional()),
  contractId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  paymentRequestId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  q: optionalString,
});
export type InspectionQuery = z.infer<typeof inspectionQuerySchema>;
