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
      // Quá hạn xử lý: có bước duyệt quá hạn, hoặc chờ ký đã qua ngày dự kiến ký.
      count({
        OR: [
          {
            status: 'PENDING_APPROVAL',
            approvalRequests: {
              some: { status: 'PENDING', tasks: { some: { status: 'PENDING', dueAt: { lt: now } } } },
            },
          },
          { status: 'PENDING_SIGNATURE', expectedSignDate: { lt: today } },
        ],
      }),
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
        select: {
          id: true,
          code: true,
          title: true,
          expiryDate: true,
          owner: { select: { fullName: true } },
          parties: { where: { isInternal: false }, orderBy: { sortOrder: 'asc' }, take: 1, select: { name: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: 6,
      }),
    ]);

    // Giá trị hợp đồng đang hiệu lực; thanh toán theo lịch của các hợp đồng trong phạm vi xem (đến hạn trong tháng, quá hạn).
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const inScope: Prisma.PaymentInstallmentWhereInput = { tenantId: user.tenantId, contract: w({}), status: { not: 'CANCELLED' } };
    const [activeValueAgg, dueMonthAgg, overdueAgg, myApprovalCount] = await Promise.all([
      this.prisma.contract.aggregate({ where: w({ status: 'ACTIVE' }), _sum: { value: true } }),
      this.prisma.paymentInstallment.aggregate({
        where: { ...inScope, dueDate: { gte: monthStart, lt: monthEnd } },
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.paymentInstallment.aggregate({
        where: { ...inScope, status: { in: ['PLANNED', 'PARTIAL'] }, dueDate: { lt: today } },
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.approvalTask.count({
        where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING', request: { status: 'PENDING' } },
      }),
    ]);
    const dec = (v: Prisma.Decimal | null | undefined) => Number(v ?? 0);

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

    // Hợp đồng đang chờ chính người dùng phê duyệt.
    const myApprovals = await this.prisma.approvalTask.findMany({
      where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING', request: { status: 'PENDING' } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 5,
      select: {
        id: true,
        stepName: true,
        dueAt: true,
        request: { select: { contract: { select: { id: true, code: true, title: true } } } },
      },
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
        activeValue: activeValueAgg._sum.value?.toString() ?? '0',
        myApprovals: myApprovalCount,
      },
      payments: {
        dueThisMonth: String(dec(dueMonthAgg._sum.amount)),
        paidThisMonth: String(dec(dueMonthAgg._sum.paidAmount)),
        installmentsThisMonth: dueMonthAgg._count._all,
        overdue: String(dec(overdueAgg._sum.amount) - dec(overdueAgg._sum.paidAmount)),
        overdueCount: overdueAgg._count._all,
      },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      monthly: [...months.values()],
      expiringContracts: expiringList,
      recentActivity,
      myApprovals,
    };
  }
}
