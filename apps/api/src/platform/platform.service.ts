import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_CONTRACT_TYPES, DEFAULT_ROLES } from './default-roles.js';
import { PlanLimitsService, USABLE_SUBSCRIPTION_STATUSES } from './plan-limits.service.js';
import {
  type InvoiceCreate,
  invoicePeriodEnd,
  type InvoiceQuery,
  type PlanCreate,
  type PlanUpdate,
  type PlatformAuditQuery,
  type SubscriptionCreate,
  type SubscriptionUpdate,
  type TenantCreate,
  type TenantQuery,
  type TenantStatusInput,
  type TenantUpdate,
} from './platform.schemas.js';

const DAY = 86_400_000;
const today = () => new Date(new Date().toISOString().slice(0, 10));
const fmtDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const tenantSelect = {
  id: true,
  code: true,
  name: true,
  taxCode: true,
  address: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
} satisfies Prisma.TenantSelect;

const subscriptionSelect = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  note: true,
  createdAt: true,
  plan: { select: { id: true, code: true, name: true, priceMonthly: true } },
} satisfies Prisma.SubscriptionSelect;

/** Trạng thái "quá hạn" của hóa đơn được suy ra: chưa thanh toán và đã qua hạn thanh toán. */
const presentInvoice = <T extends { status: string; dueDate: Date }>(inv: T) => ({
  ...inv,
  overdue: inv.status === 'ISSUED' && inv.dueDate < today(),
});

/**
 * Vận hành SaaS nhiều doanh nghiệp – chỉ Super Admin.
 * Mọi thao tác ghi nhật ký vào doanh nghiệp bị tác động (AuditService.logPlatform).
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  // ───────────── Tổng quan ─────────────

  async overview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [byStatus, newTenants, subs, unpaid, overdue, paidThisMonth] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.tenant.count({ where: { createdAt: { gte: monthStart } } }),
      this.effectiveSubscriptions(),
      this.prisma.invoice.aggregate({ where: { status: 'ISSUED' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.invoice.aggregate({
        where: { status: 'ISSUED', dueDate: { lt: today() } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    ]);

    const planMap = new Map<string, { planId: string; name: string; tenants: number; mrr: number }>();
    let mrr = 0;
    let trials = 0;
    for (const s of subs) {
      const row = planMap.get(s.plan.id) ?? { planId: s.plan.id, name: s.plan.name, tenants: 0, mrr: 0 };
      row.tenants++;
      if (s.status === 'TRIAL') trials++;
      else {
        row.mrr += Number(s.plan.priceMonthly);
        mrr += Number(s.plan.priceMonthly);
      }
      planMap.set(s.plan.id, row);
    }
    const in30 = new Date(now.getTime() + 30 * DAY);
    const expiring = subs
      .filter((s) => s.endsAt && s.endsAt <= in30)
      .sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())
      .slice(0, 10)
      .map((s) => ({ ...s, tenant: s.tenant }));

    return {
      tenants: {
        total: byStatus.reduce((n, r) => n + r._count._all, 0),
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        newThisMonth: newTenants,
        withoutSubscription: await this.prisma.tenant.count({
          where: { status: 'ACTIVE', id: { notIn: subs.map((s) => s.tenantId) } },
        }),
      },
      subscriptions: { active: subs.length - trials, trial: trials, mrr: mrr.toFixed(2) },
      byPlan: [...planMap.values()].map((p) => ({ ...p, mrr: p.mrr.toFixed(2) })),
      invoices: {
        unpaidCount: unpaid._count._all,
        unpaidAmount: (unpaid._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        overdueCount: overdue._count._all,
        overdueAmount: (overdue._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        paidThisMonth: (paidThisMonth._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      },
      expiring,
    };
  }

  /** Subscription hiệu lực mới nhất của mỗi doanh nghiệp (có thể lọc theo danh sách tenant). */
  private async effectiveSubscriptions(tenantIds?: string[]) {
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      where: {
        ...(tenantIds && { tenantId: { in: tenantIds } }),
        status: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { ...subscriptionSelect, tenantId: true, tenant: { select: { id: true, code: true, name: true } } },
      orderBy: { startsAt: 'desc' },
    });
    const seen = new Set<string>();
    return rows.filter((r) => !seen.has(r.tenantId) && seen.add(r.tenantId));
  }

  // ───────────── Doanh nghiệp ─────────────

  async listTenants(q: TenantQuery) {
    const now = new Date();
    const where: Prisma.TenantWhereInput = {
      status: q.status,
      ...(q.planId && {
        subscriptions: {
          some: {
            planId: q.planId,
            status: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        },
      }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { code: { contains: q.q, mode: 'insensitive' } },
          { taxCode: { contains: q.q } },
          { email: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        select: tenantSelect,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    const ids = items.map((t) => t.id);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const [subs, users, contracts, storage] = await Promise.all([
      this.effectiveSubscriptions(ids),
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: ids }, status: { not: 'DISABLED' } },
        _count: { _all: true },
      }),
      this.prisma.contract.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: ids }, createdAt: { gte: yearStart } },
        _count: { _all: true },
      }),
      this.prisma.contractDocument.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: ids } },
        _sum: { size: true },
      }),
    ]);
    const sub = new Map(subs.map((s) => [s.tenantId, s]));
    const u = new Map(users.map((r) => [r.tenantId, r._count._all]));
    const c = new Map(contracts.map((r) => [r.tenantId, r._count._all]));
    const st = new Map(storage.map((r) => [r.tenantId, r._sum.size ?? 0]));
    return paginated(
      items.map((t) => {
        const s = sub.get(t.id);
        return {
          ...t,
          subscription: s ? { id: s.id, status: s.status, endsAt: s.endsAt, plan: s.plan } : null,
          usage: { users: u.get(t.id) ?? 0, contractsThisYear: c.get(t.id) ?? 0, storageBytes: st.get(t.id) ?? 0 },
        };
      }),
      total,
      q.page,
      q.pageSize,
    );
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: tenantSelect });
    if (!tenant) throw new NotFoundException('Không tìm thấy doanh nghiệp');
    const [current, subscriptions, usage, admins, invoices] = await Promise.all([
      this.limits.effectiveSubscription(id),
      this.prisma.subscription.findMany({
        where: { tenantId: id },
        select: subscriptionSelect,
        orderBy: { startsAt: 'desc' },
      }),
      this.limits.usage(id),
      this.prisma.user.findMany({
        where: { tenantId: id, roles: { some: { role: { code: 'tenant_admin' } } } },
        select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invoice.findMany({ where: { tenantId: id }, orderBy: { issuedAt: 'desc' }, take: 50 }),
    ]);
    return {
      ...tenant,
      currentSubscriptionId: current?.id ?? null,
      limits: current
        ? {
            planName: current.plan.name,
            maxUsers: current.plan.maxUsers,
            maxContractsYear: current.plan.maxContractsYear,
            storageQuotaMb: current.plan.storageQuotaMb,
          }
        : null,
      usage,
      subscriptions,
      admins,
      invoices: invoices.map(presentInvoice),
    };
  }

  /** Tạo doanh nghiệp: vai trò hệ thống, loại hợp đồng mặc định, tài khoản quản trị đầu tiên, subscription. */
  async createTenant(actor: AuthUser, input: TenantCreate) {
    if (await this.prisma.tenant.findUnique({ where: { code: input.code } })) {
      throw new ConflictException(`Mã doanh nghiệp "${input.code}" đã được sử dụng`);
    }
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan?.isActive) throw new BadRequestException('Gói dịch vụ không tồn tại hoặc đã ngừng cung cấp');
    const passwordHash = await bcrypt.hash(input.admin.password, 10);
    const startsAt = new Date();
    const endsAt = input.durationDays ? new Date(startsAt.getTime() + input.durationDays * DAY) : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            code: input.code,
            name: input.name,
            taxCode: input.taxCode ?? null,
            address: input.address ?? null,
            email: input.email ?? null,
            phone: input.phone ?? null,
          },
          select: tenantSelect,
        });
        let adminRoleId = '';
        for (const r of DEFAULT_ROLES) {
          const role = await tx.role.create({
            data: {
              tenantId: tenant.id,
              code: r.code,
              name: r.name,
              isSystem: true,
              permissions: { create: r.permissions.map((permission) => ({ permission })) },
            },
          });
          if (r.code === 'tenant_admin') adminRoleId = role.id;
        }
        await tx.contractType.createMany({
          data: DEFAULT_CONTRACT_TYPES.map(([code, name, codePattern]) => ({
            tenantId: tenant.id,
            code,
            name,
            codePattern,
          })),
        });
        const admin = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.admin.email,
            fullName: input.admin.fullName,
            jobTitle: 'Quản trị viên',
            passwordHash,
            roles: { create: { roleId: adminRoleId } },
          },
          select: { id: true, email: true, fullName: true },
        });
        await tx.subscription.create({
          data: { tenantId: tenant.id, planId: plan.id, status: input.subscriptionStatus, startsAt, endsAt },
        });
        await this.audit.logPlatform(
          actor,
          tenant.id,
          {
            action: 'platform.tenant_create',
            entityType: 'tenant',
            entityId: tenant.id,
            data: { code: tenant.code, plan: plan.code, adminEmail: admin.email },
          },
          tx,
        );
        return { ...tenant, admin };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Mã doanh nghiệp "${input.code}" đã được sử dụng`);
      throw e;
    }
  }

  async updateTenant(actor: AuthUser, id: string, input: TenantUpdate) {
    await this.getTenantRow(id);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({ where: { id }, data: input, select: tenantSelect });
      await this.audit.logPlatform(
        actor,
        id,
        { action: 'platform.tenant_update', entityType: 'tenant', entityId: id, data: { changes: Object.keys(input) } },
        tx,
      );
      return tenant;
    });
  }

  /** Tạm ngưng/đóng ⇒ người dùng của doanh nghiệp không đăng nhập được, phiên hiện có bị thu hồi. */
  async setTenantStatus(actor: AuthUser, id: string, input: TenantStatusInput) {
    const current = await this.getTenantRow(id);
    if (id === actor.tenantId && input.status !== 'ACTIVE') {
      throw new BadRequestException('Không thể tạm ngưng hoặc đóng doanh nghiệp chứa tài khoản Super Admin đang dùng');
    }
    if (current.status === input.status) return this.getTenantRow(id);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({ where: { id }, data: { status: input.status }, select: tenantSelect });
      if (input.status !== 'ACTIVE') {
        await tx.session.updateMany({
          where: { user: { tenantId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.logPlatform(
        actor,
        id,
        {
          action: 'platform.tenant_status',
          entityType: 'tenant',
          entityId: id,
          data: { from: current.status, to: input.status, reason: input.reason ?? null },
        },
        tx,
      );
      return tenant;
    });
  }

  private async getTenantRow(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id }, select: tenantSelect });
    if (!t) throw new NotFoundException('Không tìm thấy doanh nghiệp');
    return t;
  }

  // ───────────── Gói dịch vụ ─────────────

  async listPlans() {
    const [plans, subs] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: [{ isActive: 'desc' }, { priceMonthly: 'asc' }] }),
      this.effectiveSubscriptions(),
    ]);
    const counts = new Map<string, number>();
    for (const s of subs) counts.set(s.plan.id, (counts.get(s.plan.id) ?? 0) + 1);
    return plans.map((p) => ({ ...p, tenantCount: counts.get(p.id) ?? 0 }));
  }

  async createPlan(actor: AuthUser, input: PlanCreate) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.plan.create({ data: input });
        await this.audit.logPlatform(
          actor,
          actor.tenantId,
          { action: 'platform.plan_create', entityType: 'plan', entityId: plan.id, data: { code: plan.code } },
          tx,
        );
        return plan;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Mã gói "${input.code}" đã tồn tại`);
      throw e;
    }
  }

  async updatePlan(actor: AuthUser, id: string, input: PlanUpdate) {
    if (!(await this.prisma.plan.findUnique({ where: { id } })))
      throw new NotFoundException('Không tìm thấy gói dịch vụ');
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({ where: { id }, data: input });
      await this.audit.logPlatform(
        actor,
        actor.tenantId,
        { action: 'platform.plan_update', entityType: 'plan', entityId: id, data: { code: plan.code, changes: input } },
        tx,
      );
      return plan;
    });
  }

  // ───────────── Subscription ─────────────

  /** Đổi/gia hạn gói: subscription đang hiệu lực kết thúc tại thời điểm gói mới bắt đầu. */
  async createSubscription(actor: AuthUser, tenantId: string, input: SubscriptionCreate) {
    await this.getTenantRow(tenantId);
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan?.isActive) throw new BadRequestException('Gói dịch vụ không tồn tại hoặc đã ngừng cung cấp');
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.subscription.findMany({
        where: {
          tenantId,
          status: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
          OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        },
      });
      for (const s of open) {
        // Gói chưa bắt đầu (hẹn trước) bị thay thế hoàn toàn; gói đang chạy kết thúc khi gói mới bắt đầu.
        await tx.subscription.update({
          where: { id: s.id },
          data: s.startsAt >= startsAt ? { status: 'CANCELLED' } : { endsAt: startsAt },
        });
      }
      const sub = await tx.subscription.create({
        data: { tenantId, planId: plan.id, status: input.status, startsAt, endsAt, note: input.note ?? null },
        select: subscriptionSelect,
      });
      await this.audit.logPlatform(
        actor,
        tenantId,
        {
          action: 'platform.subscription_create',
          entityType: 'subscription',
          entityId: sub.id,
          data: { plan: plan.code, status: input.status, startsAt, endsAt, replaced: open.map((s) => s.id) },
        },
        tx,
      );
      return sub;
    });
  }

  async updateSubscription(actor: AuthUser, id: string, input: SubscriptionUpdate) {
    const current = await this.prisma.subscription.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy subscription');
    const endsAt = input.endsAt === undefined ? undefined : input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt <= current.startsAt) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: { status: input.status, endsAt, note: input.note },
        select: subscriptionSelect,
      });
      await this.audit.logPlatform(
        actor,
        current.tenantId,
        {
          action: 'platform.subscription_update',
          entityType: 'subscription',
          entityId: id,
          data: {
            from: { status: current.status, endsAt: current.endsAt },
            to: { status: sub.status, endsAt: sub.endsAt },
          },
        },
        tx,
      );
      return sub;
    });
  }

  // ───────────── Hóa đơn ─────────────

  async listInvoices(q: InvoiceQuery) {
    const where: Prisma.InvoiceWhereInput = {
      tenantId: q.tenantId,
      ...(q.status === 'OVERDUE' ? { status: 'ISSUED', dueDate: { lt: today() } } : { status: q.status }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { tenant: { select: { id: true, code: true, name: true } } },
        orderBy: { issuedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginated(items.map(presentInvoice), total, q.page, q.pageSize);
  }

  async createInvoice(actor: AuthUser, input: InvoiceCreate) {
    const tenant = await this.getTenantRow(input.tenantId);
    const sub = await this.limits.effectiveSubscription(tenant.id);
    if (input.amount === undefined && !sub) {
      throw new BadRequestException('Doanh nghiệp không có gói đang hiệu lực, hãy nhập số tiền hóa đơn');
    }
    const periodStart = new Date(input.periodStart);
    const periodEnd = invoicePeriodEnd(input.periodStart, input.months);
    const amount = input.amount ?? Number(sub!.plan.priceMonthly) * input.months;
    const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(today().getTime() + 15 * DAY);
    const description =
      input.description ??
      `Phí thuê bao gói ${sub?.plan.name ?? ''} ${input.months} tháng (${fmtDate(periodStart)} – ${fmtDate(periodEnd)})`;
    const prefix = `INV-${input.periodStart.slice(0, 7).replace('-', '')}-`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const seq = (await tx.invoice.count({ where: { number: { startsWith: prefix } } })) + 1 + attempt;
          const invoice = await tx.invoice.create({
            data: {
              tenantId: tenant.id,
              subscriptionId: sub?.id ?? null,
              number: `${prefix}${String(seq).padStart(4, '0')}`,
              periodStart,
              periodEnd,
              description,
              amount,
              dueDate,
              note: input.note ?? null,
            },
          });
          await this.audit.logPlatform(
            actor,
            tenant.id,
            {
              action: 'platform.invoice_create',
              entityType: 'invoice',
              entityId: invoice.id,
              data: { number: invoice.number, amount: invoice.amount.toFixed(2) },
            },
            tx,
          );
          return presentInvoice(invoice);
        });
      } catch (e) {
        if (!isUniqueViolation(e) || attempt === 2) throw e;
      }
    }
    throw new ConflictException('Không cấp được số hóa đơn, vui lòng thử lại');
  }

  async payInvoice(actor: AuthUser, id: string) {
    return this.changeInvoice(actor, id, 'PAID', { status: 'PAID', paidAt: new Date() });
  }

  async voidInvoice(actor: AuthUser, id: string, reason: string) {
    return this.changeInvoice(actor, id, 'VOID', { status: 'VOID', note: reason });
  }

  private async changeInvoice(actor: AuthUser, id: string, to: 'PAID' | 'VOID', data: Prisma.InvoiceUpdateInput) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Không tìm thấy hóa đơn');
    if (inv.status !== 'ISSUED') throw new BadRequestException('Chỉ xử lý được hóa đơn đang chờ thanh toán');
    return this.prisma.$transaction(async (tx) => {
      // Điều kiện status trong where tránh hai thao tác đồng thời cùng ghi đè.
      const { count } = await tx.invoice.updateMany({
        where: { id, status: 'ISSUED' },
        data: data as Prisma.InvoiceUpdateManyMutationInput,
      });
      if (!count) throw new ConflictException('Hóa đơn vừa được xử lý bởi thao tác khác');
      await this.audit.logPlatform(
        actor,
        inv.tenantId,
        {
          action: to === 'PAID' ? 'platform.invoice_paid' : 'platform.invoice_void',
          entityType: 'invoice',
          entityId: id,
          data: {
            number: inv.number,
            amount: inv.amount.toFixed(2),
            ...(to === 'VOID' && { reason: data.note as string }),
          },
        },
        tx,
      );
      return presentInvoice(await tx.invoice.findUniqueOrThrow({ where: { id } }));
    });
  }

  // ───────────── Nhật ký hệ thống ─────────────

  async auditLogs(q: PlatformAuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: q.tenantId,
      ...(q.action
        ? { action: { contains: q.action, mode: 'insensitive' } }
        : q.platformOnly && { action: { startsWith: 'platform.' } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { tenant: { select: { id: true, code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  // ───────────── Phía doanh nghiệp ─────────────

  /** Gói hiện hành, mức sử dụng và hóa đơn của chính doanh nghiệp người dùng. */
  async myBilling(user: AuthUser) {
    const [sub, usage, invoices] = await Promise.all([
      this.limits.effectiveSubscription(user.tenantId),
      this.limits.usage(user.tenantId),
      this.prisma.invoice.findMany({
        where: { tenantId: user.tenantId, status: { not: 'VOID' } },
        orderBy: { issuedAt: 'desc' },
        take: 24,
        select: {
          id: true,
          number: true,
          periodStart: true,
          periodEnd: true,
          description: true,
          amount: true,
          status: true,
          dueDate: true,
          issuedAt: true,
          paidAt: true,
        },
      }),
    ]);
    return {
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            startsAt: sub.startsAt,
            endsAt: sub.endsAt,
            plan: {
              code: sub.plan.code,
              name: sub.plan.name,
              description: sub.plan.description,
              maxUsers: sub.plan.maxUsers,
              maxContractsYear: sub.plan.maxContractsYear,
              storageQuotaMb: sub.plan.storageQuotaMb,
              priceMonthly: sub.plan.priceMonthly,
            },
          }
        : null,
      usage,
      invoices: invoices.map(presentInvoice),
    };
  }
}
