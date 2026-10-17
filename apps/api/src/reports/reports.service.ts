import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const optUuid = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());

export const reportQuerySchema = z.object({
  from: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  to: z.preprocess((v) => (v === '' ? undefined : v), z.iso.date().optional()),
  departmentId: optUuid,
  contractTypeId: optUuid,
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

const D = (v: Prisma.Decimal | null | undefined) => (v ? v.toString() : '0');
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/**
 * Báo cáo quản trị hợp đồng: theo phòng ban, loại, nhân viên, đối tác; thời gian xử lý phê duyệt/ký;
 * tình hình thanh toán. Lọc theo ngày tạo hợp đồng và luôn áp phạm vi xem của người dùng.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
  ) {}

  async summary(user: AuthUser, q: ReportQuery) {
    const where: Prisma.ContractWhereInput = {
      AND: [
        this.contracts.scopeWhere(user),
        { deletedAt: null, status: { not: 'CANCELLED' } },
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.contractTypeId ? { contractTypeId: q.contractTypeId } : {},
        q.from ? { createdAt: { gte: new Date(q.from) } } : {},
        q.to ? { createdAt: { lt: new Date(new Date(q.to).getTime() + DAY) } } : {},
      ],
    };
    const signed = { signatureStatus: 'COMPLETED' as const };
    const agg = { _count: { _all: true }, _sum: { value: true } } as const;

    const [total, byStatus, byDept, byType, byOwner, byPartner, signedAgg] = await Promise.all([
      this.prisma.contract.aggregate({ where, ...agg }),
      this.prisma.contract.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { value: true } }),
      this.prisma.contract.groupBy({ by: ['departmentId'], where, ...agg }),
      this.prisma.contract.groupBy({ by: ['contractTypeId'], where, ...agg }),
      this.prisma.contract.groupBy({ by: ['ownerId'], where, ...agg, orderBy: { _sum: { value: 'desc' } }, take: 10 }),
      this.prisma.contractParty.groupBy({
        by: ['name'],
        where: { role: 'PARTY_B', contract: where },
        _count: { _all: true },
        orderBy: { _count: { name: 'desc' } },
        take: 10,
      }),
      this.prisma.contract.groupBy({ by: ['departmentId'], where: { AND: [where, signed] }, ...agg }),
    ]);

    // Tên hiển thị cho các khóa nhóm.
    const ids = <T>(rows: T[], key: keyof T) =>
      rows.map((r) => r[key]).filter((x): x is NonNullable<T[keyof T]> => !!x) as unknown as string[];
    const [depts, types, owners] = await Promise.all([
      this.prisma.department.findMany({
        where: { id: { in: ids(byDept, 'departmentId') } },
        select: { id: true, name: true },
      }),
      this.prisma.contractType.findMany({
        where: { id: { in: ids(byType, 'contractTypeId') } },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids(byOwner, 'ownerId') } },
        select: { id: true, fullName: true },
      }),
    ]);
    const nameOf = (list: { id: string; name?: string; fullName?: string }[], id: string | null, fallback: string) =>
      (id && (list.find((x) => x.id === id)?.name ?? list.find((x) => x.id === id)?.fullName)) || fallback;

    // Giá trị hợp đồng của từng đối tác (tính trên các hợp đồng có đối tác đó là Bên B).
    const partnerValues = await Promise.all(
      byPartner.map((p) =>
        this.prisma.contract.aggregate({
          where: { AND: [where, { parties: { some: { role: 'PARTY_B', name: p.name } } }] },
          _sum: { value: true },
        }),
      ),
    );

    // Thời gian xử lý: phê duyệt (gửi → duyệt xong) và ký (gửi ký → hoàn tất), tính theo giờ.
    const [approvals, signatures] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where: { status: 'APPROVED', completedAt: { not: null }, contract: where },
        select: { submittedAt: true, completedAt: true, contract: { select: { departmentId: true } } },
      }),
      this.prisma.signatureRequest.findMany({
        where: { status: 'COMPLETED', completedAt: { not: null }, contract: where },
        select: { createdAt: true, completedAt: true, contract: { select: { departmentId: true } } },
      }),
    ]);
    const approvalHours = (deptId?: string | null) =>
      approvals
        .filter((a) => deptId === undefined || a.contract.departmentId === deptId)
        .map((a) => (a.completedAt!.getTime() - a.submittedAt.getTime()) / HOUR);
    const signHours = (deptId?: string | null) =>
      signatures
        .filter((s) => deptId === undefined || s.contract.departmentId === deptId)
        .map((s) => (s.completedAt!.getTime() - s.createdAt.getTime()) / HOUR);

    // Tỷ lệ ký thành công trên các yêu cầu ký đã kết thúc.
    const signOutcomes = await this.prisma.signatureRequest.groupBy({
      by: ['status'],
      where: { contract: where, status: { in: ['COMPLETED', 'REJECTED', 'EXPIRED'] } },
      _count: { _all: true },
    });
    const finished = signOutcomes.reduce((s, r) => s + r._count._all, 0);
    const completed = signOutcomes.find((r) => r.status === 'COMPLETED')?._count._all ?? 0;

    // Thanh toán.
    const today = new Date(new Date().toISOString().slice(0, 10));
    const paymentWhere: Prisma.PaymentInstallmentWhereInput = { contract: where, status: { not: 'CANCELLED' } };
    const [payTotal, payOverdue] = await Promise.all([
      this.prisma.paymentInstallment.aggregate({ where: paymentWhere, _sum: { amount: true, paidAmount: true } }),
      this.prisma.paymentInstallment.aggregate({
        where: { ...paymentWhere, status: { in: ['PLANNED', 'PARTIAL'] }, dueDate: { lt: today } },
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      totals: {
        count: total._count._all,
        value: D(total._sum.value),
        avgApprovalHours: avg(approvalHours()),
        avgSigningHours: avg(signHours()),
        signSuccessRate: finished ? Math.round((completed / finished) * 1000) / 10 : null,
      },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all, value: D(s._sum.value) })),
      byDepartment: byDept
        .map((d) => {
          const s = signedAgg.find((x) => x.departmentId === d.departmentId);
          return {
            id: d.departmentId,
            name: nameOf(depts, d.departmentId, 'Chưa gán phòng ban'),
            count: d._count._all,
            value: D(d._sum.value),
            signedCount: s?._count._all ?? 0,
            signedValue: D(s?._sum.value),
            avgApprovalHours: avg(approvalHours(d.departmentId)),
            avgSigningHours: avg(signHours(d.departmentId)),
          };
        })
        .sort((a, b) => Number(b.value) - Number(a.value)),
      byType: byType
        .map((t) => ({
          id: t.contractTypeId,
          name: nameOf(types, t.contractTypeId, 'Chưa phân loại'),
          count: t._count._all,
          value: D(t._sum.value),
        }))
        .sort((a, b) => Number(b.value) - Number(a.value)),
      byOwner: byOwner.map((o) => ({
        id: o.ownerId,
        name: nameOf(owners, o.ownerId, 'Chưa gán'),
        count: o._count._all,
        value: D(o._sum.value),
      })),
      byPartner: byPartner
        .map((p, i) => ({ name: p.name, count: p._count._all, value: D(partnerValues[i]._sum.value) }))
        .sort((a, b) => Number(b.value) - Number(a.value)),
      payments: {
        scheduled: D(payTotal._sum.amount),
        collected: D(payTotal._sum.paidAmount),
        overdueCount: payOverdue._count._all,
        overdueAmount: new Prisma.Decimal(payOverdue._sum.amount ?? 0)
          .minus(payOverdue._sum.paidAmount ?? 0)
          .toString(),
      },
    };
  }
}
