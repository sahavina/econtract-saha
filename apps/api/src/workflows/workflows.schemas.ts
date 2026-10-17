import { APPROVER_TYPES } from '@saha/shared';
import { z } from 'zod';

const money = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z
    .union([z.number(), z.string()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,18}(\.\d{1,2})?$/.test(v), 'Giá trị tiền không hợp lệ')
    .nullable(),
);

export const stepSchema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên bước').max(100),
    approverType: z.enum(APPROVER_TYPES),
    roleId: z.preprocess((v) => (v === '' ? null : v), z.uuid().nullable().optional()),
    userIds: z.array(z.uuid()).max(20).optional(),
    mode: z.enum(['ALL', 'ANY']),
    dueHours: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(720).nullable().optional()),
  })
  .refine((s) => s.approverType !== 'ROLE' || !!s.roleId, { message: 'Chọn vai trò duyệt', path: ['roleId'] })
  .refine((s) => s.approverType !== 'USERS' || (s.userIds?.length ?? 0) > 0, {
    message: 'Chọn ít nhất một người duyệt',
    path: ['userIds'],
  });
export type StepInput = z.infer<typeof stepSchema>;

const fields = z.object({
  name: z.string().trim().min(1, 'Nhập tên quy trình').max(200),
  description: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(1000).nullable().optional()),
  isActive: z.boolean(),
  priority: z.coerce.number().int().min(0).max(10_000),
  contractTypeIds: z.array(z.uuid()).max(50),
  minValue: money,
  maxValue: money,
  steps: z.array(stepSchema).min(1, 'Quy trình cần ít nhất một bước').max(10),
});

const rangeOk = (v: { minValue?: string | null; maxValue?: string | null }) =>
  !v.minValue || !v.maxValue || Number(v.minValue) < Number(v.maxValue);
const RANGE_MSG = { message: 'Giá trị tối đa phải lớn hơn giá trị tối thiểu', path: ['maxValue'] };

export const workflowCreateSchema = fields
  .extend({
    isActive: fields.shape.isActive.default(true),
    priority: fields.shape.priority.default(100),
    contractTypeIds: fields.shape.contractTypeIds.default([]),
  })
  .refine(rangeOk, RANGE_MSG);
export type WorkflowCreate = z.infer<typeof workflowCreateSchema>;

// Dựng từ object không default (Zod 4 .partial() vẫn áp default).
export const workflowUpdateSchema = fields.partial().refine(rangeOk, RANGE_MSG);
export type WorkflowUpdate = z.infer<typeof workflowUpdateSchema>;
