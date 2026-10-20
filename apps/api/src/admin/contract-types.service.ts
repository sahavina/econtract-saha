import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { renderCode, validateCodePattern } from '../contracts/contract-code.js';
import { PrismaService } from '../prisma/prisma.service.js';

const pattern = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .superRefine((v, ctx) => {
    const err = validateCodePattern(v);
    if (err) ctx.addIssue({ code: 'custom', message: err });
  });

const fields = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Nhập mã loại')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ, số, - và _')
    .toUpperCase(),
  name: z.string().trim().min(1, 'Nhập tên loại hợp đồng').max(255),
  codePattern: pattern,
  isActive: z.boolean(),
  /** Hợp đồng hay đơn đặt hàng – chỉ chọn khi tạo (đổi sau sẽ lệch với hợp đồng/đơn đã lập). */
  kind: z.enum(['CONTRACT', 'ORDER']),
});
export const contractTypeCreateSchema = fields.extend({ isActive: fields.shape.isActive.default(true), kind: fields.shape.kind.default('CONTRACT') });
export const contractTypeUpdateSchema = fields.omit({ code: true, kind: true }).partial();
export type ContractTypeCreate = z.infer<typeof contractTypeCreateSchema>;
export type ContractTypeUpdate = z.infer<typeof contractTypeUpdateSchema>;

/** Ví dụ mã sinh ra theo mẫu, giúp người cấu hình kiểm tra. */
export function previewCode(pattern: string, typeCode: string) {
  return renderCode(pattern, { date: new Date(), typeCode, departmentCode: 'KD', branchCode: 'HN' }, 1);
}

@Injectable()
export class ContractTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const types = await this.prisma.contractType.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { contracts: true } } },
    });
    return types.map((t) => ({ ...t, example: previewCode(t.codePattern, t.code) }));
  }

  create(user: AuthUser, input: ContractTypeCreate) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.contractType.create({ data: { ...input, tenantId: user.tenantId } });
      await this.audit.log(
        user,
        {
          action: 'contract_type.create',
          entityType: 'contract_type',
          entityId: t.id,
          data: { code: t.code, pattern: t.codePattern },
        },
        tx,
      );
      return t;
    });
  }

  /** Đổi mẫu mã chỉ ảnh hưởng hợp đồng tạo sau; mã đã cấp giữ nguyên. */
  async update(user: AuthUser, id: string, input: ContractTypeUpdate) {
    if (!(await this.prisma.contractType.count({ where: { id, tenantId: user.tenantId } }))) {
      throw new NotFoundException('Không tìm thấy loại hợp đồng');
    }
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.contractType.update({ where: { id }, data: input });
      await this.audit.log(
        user,
        {
          action: 'contract_type.update',
          entityType: 'contract_type',
          entityId: id,
          data: { code: t.code, changes: Object.keys(input) },
        },
        tx,
      );
      return t;
    });
  }
}
