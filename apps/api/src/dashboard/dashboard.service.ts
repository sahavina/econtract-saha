import { Injectable } from '@nestjs/common';
import { EXPIRING_SOON_DAYS, PERMISSIONS } from '@saha/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const optUuid = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());
export const dashboardQuerySchema = z.object({
  from: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  to: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  departmentId: optUuid,
  ownerId: optUuid,
  contractTypeId: optUuid,
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const DAY = 86_400_000;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
  ) {}

  async summary(user: AuthUser, q: DashboardQuery) {
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const seriesStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const base: Prisma.ContractWhereInput = {
      AND: [
        this.contracts.scopeWhere(user),
        { deletedAt: null },
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.ownerId ? { ownerId: q.ownerId } : {},
        q.contractTypeId ? { contractTypeId: q.contractTypeId } : {},
        q.from ? { createdAt: { gte: new Date(q.from) } } : {},
        q.to ? { createdAt: { lt: new Date(new Date(q.to).getTime() + DAY) } } : {},
      ],
    };
    const w = (extra: Prisma.ContractWhereInput): Prisma.ContractWhereInput => ({ AND: [base, extra] });
    const count = (extra: Prisma.ContractWhereInput = {}) => this.prisma.contract.count({ where: w(extra) });

    const [
      total,
      newThisMonth,
      draft,
      pendingApproval,
      pendingSignature,
      signed,
      active,
      expiringSoon,
      overdue,
      signRejected,
      signExpired,
      valueAgg,
      valueMonthAgg,
      byStatus,
      seriesRows,
      expiringList,
    ] = await Promise.all([
      count(),
      count({ createdAt: { gte: monthStart } }),
      count({ status: 'DRAFT' }),
      count({ status: 'PENDING_APPROVAL' }),
      count({ status: 'PENDING_SIGNATURE' }),
      count({ signatureStatus: 'COMPLETED' }),
      count({ status: 'ACTIVE' }),
      count({
        status: 'ACTIVE',
        expiryDate: { gte: today, lte: new Date(today.getTime() + EXPIRING_SOON_DAYS * DAY) },
      }),
      count({ status: { in: ['PENDING_APPROVAL', 'PENDING_SIGNATURE'] }, expectedSignDate: { lt: today } }),
      count({ signatureStatus: 'REJECTED' }),
      count({ signatureStatus: 'EXPIRED' }),
      this.prisma.contract.aggregate({ where: w({ status: { not: 'CANCELLED' } }), _sum: { value: true } }),
      this.prisma.contract.aggregate({
        where: w({ status: { not: 'CANCELLED' }, createdAt: { gte: monthStart } }),
        _sum: { value: true },
      }),
      this.prisma.contract.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.contract.findMany({
        where: w({ createdAt: { gte: seriesStart } }),
        select: { createdAt: true, value: true, status: true },
      }),
      this.prisma.contract.findMany({
        where: w({
          status: 'ACTIVE',
          expiryDate: { gte: today, lte: new Date(today.getTime() + EXPIRING_SOON_DAYS * DAY) },
        }),
        select: { id: true, code: true, title: true, expiryDate: true, owner: { select: { fullName: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 5,
      }),
    ]);

    const months = new Map<string, { month: string; count: number; value: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(seriesStart.getUTCFullYear(), seriesStart.getUTCMonth() + i, 1));
      months.set(monthKey(d), { month: monthKey(d), count: 0, value: 0 });
    }
    for (const r of seriesRows) {
      const m = months.get(monthKey(r.createdAt));
      if (!m) continue;
      m.count += 1;
      if (r.status !== 'CANCELLED') m.value += Number(r.value);
    }

    const signFinished = signed + signRejected + signExpired;
    const canSeeAll = user.permissions.has(PERMISSIONS.CONTRACT_VIEW_ALL);
    const recentActivity = await this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, entityType: 'contract', ...(canSeeAll ? {} : { actorId: user.userId }) },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, actorName: true, entityId: true, data: true, createdAt: true },
    });

    return {
      kpis: {
        total,
        newThisMonth,
        draft,
        pendingApproval,
        pendingSignature,
        signed,
        active,
        expiringSoon,
        overdue,
        totalValue: valueAgg._sum.value?.toString() ?? '0',
        valueThisMonth: valueMonthAgg._sum.value?.toString() ?? '0',
        signSuccessRate: signFinished ? Math.round((signed / signFinished) * 1000) / 10 : null,
      },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      monthly: [...months.values()],
      expiringContracts: expiringList,
      recentActivity,
    };
  }
}
