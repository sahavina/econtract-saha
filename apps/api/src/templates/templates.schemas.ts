import { TEMPLATE_VARIABLE_KEYS } from '@saha/shared';
import { z } from 'zod';
import { optionalString, paginationSchema } from '../common/pagination.js';

const emptyToNull = (v: unknown) => (v === '' ? null : v);

// Không dùng .default() ở đây: schema cập nhật dựng bằng .partial() (Zod 4 vẫn áp default).
const templateFields = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã mẫu').max(50),
  name: z.string().trim().min(1, 'Vui lòng nhập tên mẫu').max(255),
  contractTypeId: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional()),
  contentHtml: z.string().max(2_000_000),
  requiredVariables: z.array(z.string().refine((k) => TEMPLATE_VARIABLE_KEYS.has(k), 'Biến không hợp lệ')).max(50),
  departmentIds: z.array(z.uuid()).max(100),
});

export const templateCreateSchema = templateFields.extend({
  contentHtml: templateFields.shape.contentHtml.default(''),
  requiredVariables: templateFields.shape.requiredVariables.default([]),
  departmentIds: templateFields.shape.departmentIds.default([]),
});
export type TemplateCreate = z.infer<typeof templateCreateSchema>;

export const templateUpdateSchema = templateFields.omit({ code: true }).partial();
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;

export const templateQuerySchema = paginationSchema.extend({
  q: optionalString,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional()),
  contractTypeId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  /** ORDER = mẫu đơn đặt hàng (loại hợp đồng dùng cho đơn); CONTRACT = mẫu hợp đồng (kể cả mẫu chưa gắn loại). */
  kind: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['CONTRACT', 'ORDER']).optional()),
  /** Chỉ mẫu đang sử dụng mà người dùng hiện tại được phép dùng (cho form tạo hợp đồng). */
  usable: z.preprocess((v) => v === 'true' || v === true, z.boolean()),
});
export type TemplateQuery = z.infer<typeof templateQuerySchema>;
