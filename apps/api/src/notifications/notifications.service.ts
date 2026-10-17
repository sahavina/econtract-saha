import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated, paginationSchema } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface NotificationInput {
  type: string;
  title: string;
  body?: string | null;
  /** Đường dẫn nội bộ, ví dụ /contracts/{id}?tab=approval */
  link?: string | null;
}

export const notificationQuerySchema = paginationSchema.extend({
  unreadOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean()),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo thông báo cho danh sách người dùng (bỏ trùng, bỏ rỗng). Truyền `db` để ghi cùng transaction nghiệp vụ. */
  async notify(
    tenantId: string,
    userIds: (string | null | undefined)[],
    input: NotificationInput,
    db: Db = this.prisma,
  ) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    const link = input.link && input.link.startsWith('/') ? input.link : null;
    await db.notification.createMany({
      data: ids.map((userId) => ({
        tenantId,
        userId,
        type: input.type,
        title: input.title.slice(0, 300),
        body: input.body?.slice(0, 1000) ?? null,
        link,
      })),
    });
  }

  async list(user: AuthUser, q: NotificationQuery) {
    const where: Prisma.NotificationWhereInput = {
      userId: user.userId,
      tenantId: user.tenantId,
      ...(q.unreadOnly && { readAt: null }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async unreadCount(user: AuthUser) {
    return {
      count: await this.prisma.notification.count({
        where: { userId: user.userId, tenantId: user.tenantId, readAt: null },
      }),
    };
  }

  async markRead(user: AuthUser, id: string) {
    const r = await this.prisma.notification.updateMany({
      where: { id, userId: user.userId, tenantId: user.tenantId, readAt: null },
      data: { readAt: new Date() },
    });
    if (r.count === 0 && !(await this.prisma.notification.count({ where: { id, userId: user.userId } }))) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.userId, tenantId: user.tenantId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
