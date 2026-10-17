import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

const nullableUuid = z.preprocess((v) => (v === '' ? null : v), z.uuid().nullable().optional());
const code = z
  .string()
  .trim()
  .min(1, 'Nhập mã')
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ, số, - và _')
  .toUpperCase();

const deptFields = z.object({
  code,
  name: z.string().trim().min(1, 'Nhập tên phòng ban').max(255),
  branchId: nullableUuid,
  parentId: nullableUuid,
  managerId: nullableUuid,
  isActive: z.boolean(),
});
export const departmentCreateSchema = deptFields.extend({ isActive: deptFields.shape.isActive.default(true) });
export const departmentUpdateSchema = deptFields.omit({ code: true }).partial();
export type DepartmentCreate = z.infer<typeof departmentCreateSchema>;
export type DepartmentUpdate = z.infer<typeof departmentUpdateSchema>;

const branchFields = z.object({
  code,
  name: z.string().trim().min(1, 'Nhập tên chi nhánh').max(255),
  address: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500).nullable().optional()),
  isActive: z.boolean(),
});
export const branchCreateSchema = branchFields.extend({ isActive: branchFields.shape.isActive.default(true) });
export const branchUpdateSchema = branchFields.omit({ code: true }).partial();
export type BranchCreate = z.infer<typeof branchCreateSchema>;
export type BranchUpdate = z.infer<typeof branchUpdateSchema>;

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───── Phòng ban ─────

  departments(user: AuthUser) {
    return this.prisma.department.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true } },
        _count: { select: { users: true, contracts: true } },
      },
    });
  }

  async createDepartment(user: AuthUser, input: DepartmentCreate) {
    await this.assertDeptRefs(user, input);
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.department.create({ data: { ...input, tenantId: user.tenantId } });
      await this.audit.log(
        user,
        { action: 'department.create', entityType: 'department', entityId: d.id, data: { code: d.code, name: d.name } },
        tx,
      );
      return d;
    });
  }

  async updateDepartment(user: AuthUser, id: string, input: DepartmentUpdate) {
    const current = await this.prisma.department.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!current) throw new NotFoundException('Không tìm thấy phòng ban');
    if (input.parentId && (input.parentId === id || (await this.isDescendant(id, input.parentId)))) {
      throw new BadRequestException('Phòng ban cha không hợp lệ (tạo vòng lặp)');
    }
    await this.assertDeptRefs(user, input);
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.department.update({ where: { id }, data: input });
      await this.audit.log(
        user,
        {
          action: 'department.update',
          entityType: 'department',
          entityId: id,
          data: { name: d.name, changes: Object.keys(input) },
        },
        tx,
      );
      return d;
    });
  }

  /** candidate có phải là phòng ban con (trực tiếp hoặc gián tiếp) của id không. */
  private async isDescendant(id: string, candidate: string): Promise<boolean> {
    let cursor: string | null = candidate;
    for (let i = 0; cursor && i < 50; i++) {
      const row: { parentId: string | null } | null = await this.prisma.department.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!row) return false;
      if (row.parentId === id) return true;
      cursor = row.parentId;
    }
    return false;
  }

  private async assertDeptRefs(user: AuthUser, input: Partial<DepartmentCreate>) {
    const t = user.tenantId;
    if (input.branchId && !(await this.prisma.branch.count({ where: { id: input.branchId, tenantId: t } }))) {
      throw new BadRequestException('Chi nhánh không hợp lệ');
    }
    if (input.parentId && !(await this.prisma.department.count({ where: { id: input.parentId, tenantId: t } }))) {
      throw new BadRequestException('Phòng ban cha không hợp lệ');
    }
    if (
      input.managerId &&
      !(await this.prisma.user.count({ where: { id: input.managerId, tenantId: t, status: 'ACTIVE' } }))
    ) {
      throw new BadRequestException('Trưởng phòng không hợp lệ');
    }
  }

  // ───── Chi nhánh ─────

  branches(user: AuthUser) {
    return this.prisma.branch.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { departments: true, users: true } } },
    });
  }

  createBranch(user: AuthUser, input: BranchCreate) {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.branch.create({ data: { ...input, tenantId: user.tenantId } });
      await this.audit.log(
        user,
        { action: 'branch.create', entityType: 'branch', entityId: b.id, data: { code: b.code, name: b.name } },
        tx,
      );
      return b;
    });
  }

  async updateBranch(user: AuthUser, id: string, input: BranchUpdate) {
    if (!(await this.prisma.branch.count({ where: { id, tenantId: user.tenantId } })))
      throw new NotFoundException('Không tìm thấy chi nhánh');
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.branch.update({ where: { id }, data: input });
      await this.audit.log(
        user,
        {
          action: 'branch.update',
          entityType: 'branch',
          entityId: id,
          data: { name: b.name, changes: Object.keys(input) },
        },
        tx,
      );
      return b;
    });
  }
}
