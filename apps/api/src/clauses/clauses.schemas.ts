import { CLAUSE_CATEGORIES } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const clauseFields = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã điều khoản').max(50),
  title: z.string().trim().min(1, 'Vui lòng nhập tiêu đề').max(255),
  category: z.enum(CLAUSE_CATEGORIES),
  contentHtml: z.string().trim().min(1, 'Vui lòng nhập nội dung điều khoản').max(500_000),
});

export const clauseCreateSchema = clauseFields;
export type ClauseCreate = z.infer<typeof clauseCreateSchema>;

export const clauseUpdateSchema = clauseFields.omit({ code: true }).partial();
export type ClauseUpdate = z.infer<typeof clauseUpdateSchema>;

export const clauseRejectSchema = z.object({
  note: z.string().trim().min(1, 'Vui lòng nhập lý do từ chối').max(2000),
});
export type ClauseReject = z.infer<typeof clauseRejectSchema>;

export const clauseQuerySchema = paginationSchema.extend({
  q: optionalString,
  category: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CLAUSE_CATEGORIES).optional()),
  status: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
  ),
});
export type ClauseQuery = z.infer<typeof clauseQuerySchema>;
