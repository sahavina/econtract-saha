import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { optionalString, paginated, paginationSchema } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
}

export const auditQuerySchema = paginationSchema.extend({
  entityType: optionalString,
  entityId: optionalString,
  actorId: optionalString,
  action: optionalString,
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/**
 * Nhật ký hoạt động chỉ được ghi từ backend (append-only).
 * Không có API sửa/xóa nhật ký.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ghi nhật ký; truyền `db` là transaction client để nhật ký nằm cùng giao dịch nghiệp vụ. */
  async log(actor: AuthUser, entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorName: actor.fullName,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        data: entry.data,
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });
  }

  /** Ghi nhật ký cho tác nhân không đăng nhập (ví dụ đối tác ký qua liên kết). */
  async logExternal(
    tenantId: string,
    actor: { name: string; ip?: string; userAgent?: string },
    entry: AuditEntry,
    db: Db = this.prisma,
  ) {
    await db.auditLog.create({
      data: {
        tenantId,
        actorId: null,
        actorName: actor.name,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        data: entry.data,
        ip: actor.ip,
        userAgent: actor.userAgent?.slice(0, 500),
      },
    });
  }

  async list(user: AuthUser, q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: user.tenantId,
      entityType: q.entityType,
      entityId: q.entityId,
      actorId: q.actorId,
      action: q.action,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  /** Timeline của một bản ghi nghiệp vụ, dùng cho tab "Lịch sử hoạt động". */
  timeline(user: AuthUser, entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, action: true, actorId: true, actorName: true, data: true, createdAt: true },
    });
  }
}
