import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, type Permission } from '@saha/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Vai trò quản trị doanh nghiệp luôn giữ toàn quyền để tránh tự khóa hệ thống. */
const LOCKED_ROLE = 'tenant_admin';

const permission = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);
const roleFields = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Nhập mã vai trò')
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Mã chỉ gồm chữ thường, số và _'),
  name: z.string().trim().min(1, 'Nhập tên vai trò').max(100),
  description: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500).nullable().optional()),
  permissions: z.array(permission).max(ALL_PERMISSIONS.length),
});
export const roleCreateSchema = roleFields;
export const roleUpdateSchema = roleFields.omit({ code: true }).partial();
export type RoleCreate = z.infer<typeof roleCreateSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } },
    });
    return roles.map(({ permissions, ...r }) => ({
      ...r,
      locked: r.code === LOCKED_ROLE,
      permissions: permissions.map((p) => p.permission),
    }));
  }

  create(user: AuthUser, input: RoleCreate) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId: user.tenantId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          permissions: { create: [...new Set(input.permissions)].map((permission) => ({ permission })) },
        },
      });
      await this.audit.log(
        user,
        {
          action: 'role.create',
          entityType: 'role',
          entityId: role.id,
          data: { code: role.code, permissions: input.permissions.length },
        },
        tx,
      );
      return role;
    });
  }

  async update(user: AuthUser, id: string, input: RoleUpdate) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.code === LOCKED_ROLE && input.permissions) {
      throw new BadRequestException('Vai trò Quản trị doanh nghiệp luôn có toàn quyền, không thể chỉnh quyền');
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: [...new Set(input.permissions)].map((permission) => ({ roleId: id, permission })),
        });
      }
      const updated = await tx.role.update({
        where: { id },
        data: { name: input.name, description: input.description },
      });
      await this.audit.log(
        user,
        {
          action: 'role.update',
          entityType: 'role',
          entityId: id,
          data: { code: role.code, changes: Object.keys(input), permissions: input.permissions?.length },
        },
        tx,
      );
      return updated;
    });
  }

  async remove(user: AuthUser, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.isSystem) throw new BadRequestException('Không xóa được vai trò hệ thống');
    if (role._count.users > 0) throw new BadRequestException('Vai trò đang được gán cho người dùng');
    const usedInWorkflow = await this.prisma.approvalWorkflow.count({
      where: { tenantId: user.tenantId, deletedAt: null, steps: { array_contains: [{ roleId: id }] } },
    });
    if (usedInWorkflow) throw new BadRequestException('Vai trò đang được dùng trong quy trình phê duyệt');
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        user,
        { action: 'role.delete', entityType: 'role', entityId: id, data: { code: role.code } },
        tx,
      );
    });
  }
}
