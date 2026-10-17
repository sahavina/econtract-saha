import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

const MB = 1024 * 1024;

/** Trạng thái subscription còn được sử dụng dịch vụ (PAST_DUE: quá hạn thanh toán nhưng chưa bị cắt). */
export const USABLE_SUBSCRIPTION_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE'] as const;

export interface TenantUsage {
  users: number;
  contractsThisYear: number;
  storageBytes: number;
}

/**
 * Giới hạn theo gói dịch vụ: số người dùng, số hợp đồng tạo trong năm, dung lượng lưu trữ.
 * Doanh nghiệp không còn subscription hiệu lực ⇒ không được thêm người dùng/hợp đồng/tài liệu mới
 * (vẫn xem và xử lý dữ liệu đã có).
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Subscription đang hiệu lực mới nhất của doanh nghiệp (kèm gói). */
  effectiveSubscription(tenantId: string, db: Db = this.prisma) {
    const now = new Date();
    return db.subscription.findFirst({
      where: {
        tenantId,
        status: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: { plan: true },
      orderBy: { startsAt: 'desc' },
    });
  }

  async usage(tenantId: string, db: Db = this.prisma): Promise<TenantUsage> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [users, contractsThisYear, storage] = await Promise.all([
      db.user.count({ where: { tenantId, status: { not: 'DISABLED' } } }),
      // Tính cả hợp đồng đã xóa mềm để không "lách" hạn mức bằng cách tạo rồi xóa.
      db.contract.count({ where: { tenantId, createdAt: { gte: yearStart } } }),
      // File đã xóa mềm vẫn nằm trong kho lưu trữ nên vẫn tính dung lượng.
      db.contractDocument.aggregate({ where: { tenantId }, _sum: { size: true } }),
    ]);
    return { users, contractsThisYear, storageBytes: storage._sum.size ?? 0 };
  }

  private async requirePlan(tenantId: string, db: Db) {
    const sub = await this.effectiveSubscription(tenantId, db);
    if (!sub) {
      throw new ForbiddenException('Gói dịch vụ của doanh nghiệp đã hết hạn hoặc bị hủy. Vui lòng liên hệ để gia hạn.');
    }
    return sub.plan;
  }

  /** Gọi trước khi thêm người dùng hoặc kích hoạt lại người dùng đã vô hiệu hóa. */
  async assertCanAddUser(tenantId: string, db: Db = this.prisma) {
    const plan = await this.requirePlan(tenantId, db);
    const users = await db.user.count({ where: { tenantId, status: { not: 'DISABLED' } } });
    if (users >= plan.maxUsers) {
      throw new ForbiddenException(
        `Đã đạt giới hạn ${plan.maxUsers} người dùng của gói ${plan.name}. Vô hiệu hóa tài khoản không dùng hoặc nâng cấp gói.`,
      );
    }
  }

  async assertCanCreateContract(tenantId: string, db: Db = this.prisma) {
    const plan = await this.requirePlan(tenantId, db);
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const count = await db.contract.count({ where: { tenantId, createdAt: { gte: yearStart } } });
    if (count >= plan.maxContractsYear) {
      throw new ForbiddenException(
        `Đã đạt giới hạn ${plan.maxContractsYear} hợp đồng/năm của gói ${plan.name}. Vui lòng nâng cấp gói.`,
      );
    }
  }

  async assertStorage(tenantId: string, addBytes: number, db: Db = this.prisma) {
    const plan = await this.requirePlan(tenantId, db);
    const agg = await db.contractDocument.aggregate({ where: { tenantId }, _sum: { size: true } });
    if ((agg._sum.size ?? 0) + addBytes > plan.storageQuotaMb * MB) {
      throw new ForbiddenException(
        `Vượt dung lượng lưu trữ ${plan.storageQuotaMb.toLocaleString('vi-VN')} MB của gói ${plan.name}. Vui lòng nâng cấp gói.`,
      );
    }
  }
}
