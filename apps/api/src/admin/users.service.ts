import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { optionalString, paginated, paginationSchema } from '../common/pagination.js';
import { PlanLimitsService } from '../platform/plan-limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const password = z.string().refine(isStrongPassword, PASSWORD_RULE_MESSAGE);
const nullableUuid = z.preprocess((v) => (v === '' ? null : v), z.uuid().nullable().optional());
const nullableText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

const userFields = z.object({
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(255),
  phone: nullableText(30),
  jobTitle: nullableText(255),
  departmentId: nullableUuid,
  branchId: nullableUuid,
  roleIds: z.array(z.uuid()).max(20),
  status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']),
});

export const userCreateSchema = userFields.extend({
  email: z.email('Email không hợp lệ').trim().toLowerCase(),
  password,
  roleIds: userFields.shape.roleIds.min(1, 'Chọn ít nhất một vai trò'),
  status: userFields.shape.status.default('ACTIVE'),
});
export type UserCreate = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = userFields.partial();
export type UserUpdate = z.infer<typeof userUpdateSchema>;

export const resetPasswordSchema = z.object({ password });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
  newPassword: password,
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

export const userQuerySchema = paginationSchema.extend({
  q: optionalString,
  departmentId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  roleId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  status: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['ACTIVE', 'INVITED', 'LOCKED', 'DISABLED']).optional(),
  ),
});
export type UserQuery = z.infer<typeof userQuerySchema>;

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  jobTitle: true,
  status: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  departmentId: true,
  branchId: true,
  department: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
const present = ({ roles, ...u }: UserRow) => ({ ...u, roles: roles.map((r) => r.role) });

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  async list(user: AuthUser, q: UserQuery) {
    const where: Prisma.UserWhereInput = {
      tenantId: user.tenantId,
      departmentId: q.departmentId,
      status: q.status,
      ...(q.roleId && { roles: { some: { roleId: q.roleId } } }),
      ...(q.q && {
        OR: [
          { fullName: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
          { jobTitle: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { fullName: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(items.map(present), total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, tenantId: user.tenantId }, select: userSelect });
    if (!u) throw new NotFoundException('Không tìm thấy người dùng');
    return present(u);
  }

  async create(user: AuthUser, input: UserCreate) {
    await this.assertReferences(user, input);
    const passwordHash = await bcrypt.hash(input.password, 10);
    return this.prisma.$transaction(async (tx) => {
      if (input.status !== 'DISABLED') await this.limits.assertCanAddUser(user.tenantId, tx);
      const created = await tx.user.create({
        data: {
          tenantId: user.tenantId,
          email: input.email,
          fullName: input.fullName,
          phone: input.phone ?? null,
          jobTitle: input.jobTitle ?? null,
          departmentId: input.departmentId ?? null,
          branchId: input.branchId ?? null,
          status: input.status,
          passwordHash,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        select: userSelect,
      });
      await this.audit.log(
        user,
        { action: 'user.create', entityType: 'user', entityId: created.id, data: { email: created.email } },
        tx,
      );
      return present(created);
    });
  }

  async update(user: AuthUser, id: string, input: UserUpdate) {
    const current = await this.get(user, id);
    // Kích hoạt lại tài khoản đã vô hiệu hóa ⇒ tính lại vào hạn mức người dùng của gói.
    if (current.status === 'DISABLED' && input.status && input.status !== 'DISABLED') {
      await this.limits.assertCanAddUser(user.tenantId);
    }
    if (id === user.userId && input.status !== undefined && input.status !== 'ACTIVE') {
      throw new BadRequestException('Không thể tự khóa hoặc vô hiệu hóa tài khoản của mình');
    }
    if (id === user.userId && input.roleIds !== undefined) {
      throw new BadRequestException('Không thể tự thay đổi vai trò của mình; nhờ quản trị viên khác thực hiện');
    }
    if (input.roleIds && input.roleIds.length === 0) throw new BadRequestException('Chọn ít nhất một vai trò');
    await this.assertReferences(user, input);

    return this.prisma.$transaction(async (tx) => {
      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      const { roleIds: _r, ...data } = input;
      const updated = await tx.user.update({
        where: { id },
        data: { ...data, ...(input.status === 'ACTIVE' && { failedLogins: 0, lockedUntil: null }) },
        select: userSelect,
      });
      // Khóa/vô hiệu hóa ⇒ thu hồi mọi phiên đăng nhập.
      if (input.status && input.status !== 'ACTIVE') {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.log(
        user,
        {
          action: 'user.update',
          entityType: 'user',
          entityId: id,
          data: { email: updated.email, changes: Object.keys(input) },
        },
        tx,
      );
      return present(updated);
    });
  }

  async resetPassword(user: AuthUser, id: string, newPassword: string) {
    const target = await this.get(user, id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(
        user,
        { action: 'user.reset_password', entityType: 'user', entityId: id, data: { email: target.email } },
        tx,
      );
    });
  }

  /** Người dùng tự đổi mật khẩu; các phiên khác bị thu hồi. */
  async changeOwnPassword(user: AuthUser, input: ChangePassword) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: { passwordHash: true },
    });
    if (!(await bcrypt.compare(input.currentPassword, account.passwordHash))) {
      throw new BadRequestException({
        message: 'Mật khẩu hiện tại không đúng',
        errors: [{ field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng' }],
      });
    }
    if (input.currentPassword === input.newPassword)
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: user.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(user, { action: 'user.change_password', entityType: 'user', entityId: user.userId }, tx);
    });
  }

  private async assertReferences(user: AuthUser, input: Partial<UserCreate>) {
    const t = user.tenantId;
    if (
      input.departmentId &&
      !(await this.prisma.department.count({ where: { id: input.departmentId, tenantId: t } }))
    ) {
      throw new BadRequestException('Phòng ban không hợp lệ');
    }
    if (input.branchId && !(await this.prisma.branch.count({ where: { id: input.branchId, tenantId: t } }))) {
      throw new BadRequestException('Chi nhánh không hợp lệ');
    }
    const roleIds = [...new Set(input.roleIds ?? [])];
    if (
      roleIds.length &&
      (await this.prisma.role.count({ where: { id: { in: roleIds }, tenantId: t } })) !== roleIds.length
    ) {
      throw new BadRequestException('Vai trò không hợp lệ');
    }
  }
}
