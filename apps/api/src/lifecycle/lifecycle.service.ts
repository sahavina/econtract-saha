import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { sanitizeContractHtml } from '../contracts/sanitize-content.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AcceptanceCreate,
  AppendixCreate,
  AppendixUpdate,
  LifecycleListQuery,
  LiquidateInput,
  ObligationCreate,
  ObligationUpdate,
  PaymentCreate,
  PaymentUpdate,
  RecordPayment,
} from './lifecycle.schemas.js';

type Contract = Awaited<ReturnType<ContractsService['get']>>;

const DAY = 86_400_000;
const CLOSED = new Set(['LIQUIDATED', 'CANCELLED']);
/** Phụ lục chỉ áp dụng cho hợp đồng đã ký. */
const SIGNED_STATES = new Set(['SIGNED', 'ACTIVE', 'EXPIRED']);

export const today = () => new Date(new Date().toISOString().slice(0, 10));
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
const D = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v);

@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
  ) {}

  /** Hợp đồng còn được cập nhật vòng đời (chưa thanh lý/hủy/lưu trữ/xóa). */
  private async editable(user: AuthUser, contractId: string): Promise<Contract> {
    const c = await this.contracts.get(user, contractId);
    if (c.deletedAt || c.archivedAt) throw new BadRequestException('Hợp đồng đã lưu trữ hoặc ở thùng rác');
    if (CLOSED.has(c.status)) throw new BadRequestException('Hợp đồng đã thanh lý/hủy, không thể cập nhật');
    return c;
  }

  private log(
    user: AuthUser,
    c: { id: string; code: string },
    action: string,
    data: Record<string, unknown>,
    tx: Prisma.TransactionClient,
  ) {
    return this.audit.log(
      user,
      { action, entityType: 'contract', entityId: c.id, data: { code: c.code, ...data } as Prisma.InputJsonValue },
      tx,
    );
  }

  // ───────────────────────── Tổng hợp theo hợp đồng ─────────────────────────

  async overview(user: AuthUser, contractId: string) {
    const c = await this.contracts.get(user, contractId);
    const [appendices, obligations, payments, acceptances] = await this.prisma.$transaction([
      this.prisma.contractAppendix.findMany({ where: { contractId }, orderBy: { seq: 'asc' } }),
      this.prisma.contractObligation.findMany({
        where: { contractId },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        include: { assignee: { select: { id: true, fullName: true } } },
      }),
      this.prisma.paymentInstallment.findMany({ where: { contractId }, orderBy: { seq: 'asc' } }),
      this.prisma.contractAcceptance.findMany({ where: { contractId }, orderBy: { acceptedDate: 'desc' } }),
    ]);
    const t = today();
    const active = payments.filter((p) => p.status !== 'CANCELLED');
    const scheduled = active.reduce((s, p) => s.plus(p.amount), D(0));
    const paid = active.reduce((s, p) => s.plus(p.paidAmount), D(0));
    const liveObligations = obligations.filter((o) => o.status !== 'CANCELLED');
    return {
      contract: {
        id: c.id,
        code: c.code,
        status: c.status,
        value: c.value,
        currency: c.currency,
        expiryDate: c.expiryDate,
        liquidatedAt: c.liquidatedAt,
        liquidationNote: c.liquidationNote,
      },
      appendices,
      obligations: obligations.map((o) => ({
        ...o,
        overdue: o.status !== 'DONE' && o.status !== 'CANCELLED' && !!o.dueDate && o.dueDate < t,
      })),
      payments: payments.map((p) => ({
        ...p,
        overdue: (p.status === 'PLANNED' || p.status === 'PARTIAL') && !!p.dueDate && p.dueDate < t,
      })),
      acceptances,
      summary: {
        scheduled: scheduled.toString(),
        paid: paid.toString(),
        remaining: scheduled.minus(paid).toString(),
        /** Lịch thanh toán lệch so với giá trị hợp đồng. */
        scheduleMismatch: active.length > 0 && !scheduled.equals(c.value),
        overduePayments: active.filter((p) => p.status !== 'PAID' && p.dueDate && p.dueDate < t).length,
        progress: liveObligations.length
          ? Math.round(liveObligations.reduce((s, o) => s + o.progress, 0) / liveObligations.length)
          : null,
        openObligations: liveObligations.filter((o) => o.status !== 'DONE').length,
        overdueObligations: liveObligations.filter((o) => o.status !== 'DONE' && o.dueDate && o.dueDate < t).length,
      },
    };
  }

  // ───────────────────────── Phụ lục / gia hạn ─────────────────────────

  async createAppendix(user: AuthUser, contractId: string, input: AppendixCreate) {
    const c = await this.editable(user, contractId);
    if (!SIGNED_STATES.has(c.status)) throw new BadRequestException('Chỉ lập phụ lục cho hợp đồng đã ký');
    this.assertExtension(c, input.kind, input.newExpiryDate);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.contractAppendix.findFirst({
            where: { contractId },
            orderBy: { seq: 'desc' },
            select: { seq: true },
          });
          const seq = (last?.seq ?? 0) + 1;
          const a = await tx.contractAppendix.create({
            data: {
              tenantId: user.tenantId,
              contractId,
              seq,
              code: `${c.code}-PL${String(seq).padStart(2, '0')}`,
              title: input.title,
              kind: input.kind,
              contentHtml: input.contentHtml ? sanitizeContractHtml(input.contentHtml) : null,
              valueChange: input.valueChange ?? null,
              newExpiryDate: toDate(input.newExpiryDate),
              effectiveDate: toDate(input.effectiveDate),
              createdById: user.userId,
            },
          });
          await this.log(user, c, 'contract.appendix_create', { appendix: a.code, kind: a.kind }, tx);
          return a;
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new ConflictException('Không thể cấp số phụ lục, vui lòng thử lại');
  }

  private assertExtension(c: Contract, kind: string | undefined, newExpiry: string | null | undefined) {
    if (kind === 'EXTENSION' && newExpiry && c.expiryDate && new Date(newExpiry) <= c.expiryDate) {
      throw new BadRequestException('Ngày hết hạn mới phải sau ngày hết hạn hiện tại');
    }
  }

  private async appendix(contractId: string, id: string) {
    const a = await this.prisma.contractAppendix.findFirst({ where: { id, contractId } });
    if (!a) throw new NotFoundException('Không tìm thấy phụ lục');
    return a;
  }

  async updateAppendix(user: AuthUser, contractId: string, id: string, input: AppendixUpdate) {
    const c = await this.editable(user, contractId);
    const a = await this.appendix(contractId, id);
    if (a.status !== 'DRAFT') throw new BadRequestException('Chỉ sửa được phụ lục nháp');
    const kind = input.kind ?? a.kind;
    const newExpiry =
      input.newExpiryDate !== undefined ? input.newExpiryDate : a.newExpiryDate?.toISOString().slice(0, 10);
    if (kind === 'EXTENSION' && !newExpiry) throw new BadRequestException('Phụ lục gia hạn cần ngày hết hạn mới');
    this.assertExtension(c, kind, newExpiry);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contractAppendix.update({
        where: { id },
        data: {
          ...input,
          contentHtml: input.contentHtml ? sanitizeContractHtml(input.contentHtml) : input.contentHtml,
          newExpiryDate: toDate(input.newExpiryDate),
          effectiveDate: toDate(input.effectiveDate),
        },
      });
      await this.log(user, c, 'contract.appendix_update', { appendix: a.code, changes: Object.keys(input) }, tx);
      return updated;
    });
  }

  /** Phụ lục có hiệu lực: áp thay đổi lên hợp đồng (ngày hết hạn, giá trị). */
  async applyAppendix(user: AuthUser, contractId: string, id: string) {
    const c = await this.editable(user, contractId);
    const a = await this.appendix(contractId, id);
    if (a.status !== 'DRAFT') throw new BadRequestException('Phụ lục đã được áp dụng hoặc đã hủy');
    if (!SIGNED_STATES.has(c.status)) throw new BadRequestException('Hợp đồng chưa ở trạng thái đã ký');
    const newValue = a.valueChange ? c.value.plus(a.valueChange) : c.value;
    if (newValue.isNegative()) throw new BadRequestException('Giá trị hợp đồng sau điều chỉnh không được âm');
    const newExpiry = a.newExpiryDate ?? c.expiryDate;
    if (a.kind === 'EXTENSION' && c.expiryDate && a.newExpiryDate && a.newExpiryDate <= c.expiryDate) {
      throw new BadRequestException('Ngày hết hạn mới phải sau ngày hết hạn hiện tại');
    }
    // Gia hạn hợp đồng đã hết hiệu lực ⇒ hiệu lực trở lại.
    const reactivate = c.status === 'EXPIRED' && newExpiry && newExpiry >= today();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contractAppendix.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'EFFECTIVE', appliedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Phụ lục vừa được xử lý, vui lòng tải lại');
      await tx.contract.update({
        where: { id: contractId },
        data: { value: newValue, expiryDate: newExpiry, ...(reactivate && { status: 'ACTIVE' }) },
      });
      await this.log(
        user,
        c,
        'contract.appendix_apply',
        {
          appendix: a.code,
          value: `${c.value.toString()} → ${newValue.toString()}`,
          expiryDate: `${c.expiryDate?.toISOString().slice(0, 10) ?? '—'} → ${newExpiry?.toISOString().slice(0, 10) ?? '—'}`,
        },
        tx,
      );
      return tx.contractAppendix.findUniqueOrThrow({ where: { id } });
    });
  }

  async cancelAppendix(user: AuthUser, contractId: string, id: string) {
    const c = await this.editable(user, contractId);
    const a = await this.appendix(contractId, id);
    if (a.status !== 'DRAFT') throw new BadRequestException('Chỉ hủy được phụ lục nháp');
    await this.prisma.$transaction(async (tx) => {
      await tx.contractAppendix.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.log(user, c, 'contract.appendix_cancel', { appendix: a.code }, tx);
    });
  }

  // ───────────────────────── Nghĩa vụ ─────────────────────────

  private async assertAssignee(user: AuthUser, assigneeId: string | null | undefined) {
    if (
      assigneeId &&
      !(await this.prisma.user.count({ where: { id: assigneeId, tenantId: user.tenantId, status: 'ACTIVE' } }))
    ) {
      throw new BadRequestException('Người phụ trách không hợp lệ');
    }
  }

  private obligationState(status: string | undefined, progress: number | undefined) {
    if (status === 'DONE') return { progress: 100, completedAt: new Date() };
    if (status && status !== 'DONE')
      return { completedAt: null, ...(progress !== undefined && { progress: Math.min(progress, 99) }) };
    return progress !== undefined ? { progress } : {};
  }

  async createObligation(user: AuthUser, contractId: string, input: ObligationCreate) {
    const c = await this.editable(user, contractId);
    await this.assertAssignee(user, input.assigneeId);
    return this.prisma.$transaction(async (tx) => {
      const o = await tx.contractObligation.create({
        data: {
          ...input,
          ...this.obligationState(input.status, input.progress),
          tenantId: user.tenantId,
          contractId,
          dueDate: toDate(input.dueDate),
        },
      });
      await this.log(user, c, 'contract.obligation_create', { obligation: o.title }, tx);
      return o;
    });
  }

  async updateObligation(user: AuthUser, contractId: string, id: string, input: ObligationUpdate) {
    const c = await this.editable(user, contractId);
    const o = await this.prisma.contractObligation.findFirst({ where: { id, contractId } });
    if (!o) throw new NotFoundException('Không tìm thấy nghĩa vụ');
    await this.assertAssignee(user, input.assigneeId);
    // Cập nhật tiến độ 100% ⇒ coi như hoàn thành.
    const status =
      input.status ??
      (input.progress === 100
        ? 'DONE'
        : input.progress !== undefined && o.status === 'OPEN' && input.progress > 0
          ? 'IN_PROGRESS'
          : undefined);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contractObligation.update({
        where: { id },
        data: { ...input, status, ...this.obligationState(status, input.progress), dueDate: toDate(input.dueDate) },
      });
      await this.log(
        user,
        c,
        'contract.obligation_update',
        { obligation: o.title, status: updated.status, progress: updated.progress },
        tx,
      );
      return updated;
    });
  }

  async deleteObligation(user: AuthUser, contractId: string, id: string) {
    const c = await this.editable(user, contractId);
    const o = await this.prisma.contractObligation.findFirst({ where: { id, contractId } });
    if (!o) throw new NotFoundException('Không tìm thấy nghĩa vụ');
    await this.prisma.$transaction(async (tx) => {
      await tx.contractObligation.delete({ where: { id } });
      await this.log(user, c, 'contract.obligation_delete', { obligation: o.title }, tx);
    });
  }

  // ───────────────────────── Thanh toán ─────────────────────────

  async createPayment(user: AuthUser, contractId: string, input: PaymentCreate) {
    const c = await this.editable(user, contractId);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.paymentInstallment.findFirst({
        where: { contractId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const p = await tx.paymentInstallment.create({
        data: {
          tenantId: user.tenantId,
          contractId,
          seq: (last?.seq ?? 0) + 1,
          title: input.title,
          amount: input.amount,
          dueDate: toDate(input.dueDate),
          note: input.note ?? null,
        },
      });
      await this.log(user, c, 'contract.payment_create', { payment: p.title, amount: p.amount.toString() }, tx);
      return p;
    });
  }

  async updatePayment(user: AuthUser, contractId: string, id: string, input: PaymentUpdate) {
    const c = await this.editable(user, contractId);
    const p = await this.prisma.paymentInstallment.findFirst({ where: { id, contractId } });
    if (!p) throw new NotFoundException('Không tìm thấy đợt thanh toán');
    if (p.status === 'PAID' || p.status === 'CANCELLED')
      throw new BadRequestException('Đợt thanh toán đã hoàn tất hoặc đã hủy');
    if (input.amount && D(input.amount).lessThan(p.paidAmount))
      throw new BadRequestException('Số tiền đợt không được nhỏ hơn số đã thanh toán');
    const { cancelled, ...rest } = input;
    if (cancelled && p.paidAmount.greaterThan(0)) throw new BadRequestException('Đợt đã có thanh toán, không hủy được');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentInstallment.update({
        where: { id },
        data: { ...rest, dueDate: toDate(input.dueDate), ...(cancelled && { status: 'CANCELLED' }) },
      });
      await this.log(
        user,
        c,
        cancelled ? 'contract.payment_cancel' : 'contract.payment_update',
        { payment: p.title },
        tx,
      );
      return updated;
    });
  }

  async recordPayment(user: AuthUser, contractId: string, id: string, input: RecordPayment) {
    const c = await this.editable(user, contractId);
    const p = await this.prisma.paymentInstallment.findFirst({ where: { id, contractId } });
    if (!p) throw new NotFoundException('Không tìm thấy đợt thanh toán');
    if (p.status === 'PAID' || p.status === 'CANCELLED')
      throw new BadRequestException('Đợt thanh toán đã hoàn tất hoặc đã hủy');
    const remaining = p.amount.minus(p.paidAmount);
    if (D(input.amount).greaterThan(remaining)) {
      throw new BadRequestException(`Số tiền vượt số còn phải thu của đợt (${remaining.toString()})`);
    }
    const paidAmount = p.paidAmount.plus(input.amount);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentInstallment.update({
        where: { id },
        data: {
          paidAmount,
          paidDate: new Date(input.paidDate),
          invoiceNo: input.invoiceNo ?? p.invoiceNo,
          status: paidAmount.greaterThanOrEqualTo(p.amount) ? 'PAID' : 'PARTIAL',
        },
      });
      await this.log(
        user,
        c,
        'contract.payment_record',
        { payment: p.title, amount: input.amount, invoiceNo: input.invoiceNo },
        tx,
      );
      return updated;
    });
  }

  // ───────────────────────── Nghiệm thu ─────────────────────────

  async createAcceptance(user: AuthUser, contractId: string, input: AcceptanceCreate) {
    const c = await this.editable(user, contractId);
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.contractAcceptance.create({
        data: {
          ...input,
          note: input.note ?? null,
          acceptedDate: new Date(input.acceptedDate),
          tenantId: user.tenantId,
          contractId,
          createdById: user.userId,
        },
      });
      await this.log(user, c, 'contract.acceptance_create', { acceptance: a.title, result: a.result }, tx);
      return a;
    });
  }

  async deleteAcceptance(user: AuthUser, contractId: string, id: string) {
    const c = await this.editable(user, contractId);
    const a = await this.prisma.contractAcceptance.findFirst({ where: { id, contractId } });
    if (!a) throw new NotFoundException('Không tìm thấy biên bản nghiệm thu');
    await this.prisma.$transaction(async (tx) => {
      await tx.contractAcceptance.delete({ where: { id } });
      await this.log(user, c, 'contract.acceptance_delete', { acceptance: a.title }, tx);
    });
  }

  // ───────────────────────── Thanh lý ─────────────────────────

  async liquidate(user: AuthUser, contractId: string, input: LiquidateInput) {
    const c = await this.editable(user, contractId);
    if (!SIGNED_STATES.has(c.status)) throw new BadRequestException('Chỉ thanh lý hợp đồng đã ký');
    const [unpaid, openObligations, draftAppendices] = await Promise.all([
      this.prisma.paymentInstallment.count({ where: { contractId, status: { in: ['PLANNED', 'PARTIAL'] } } }),
      this.prisma.contractObligation.count({ where: { contractId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.contractAppendix.count({ where: { contractId, status: 'DRAFT' } }),
    ]);
    const warnings = [
      unpaid && `Còn ${unpaid} đợt thanh toán chưa hoàn tất`,
      openObligations && `Còn ${openObligations} nghĩa vụ chưa hoàn thành`,
      draftAppendices && `Còn ${draftAppendices} phụ lục nháp`,
    ].filter((x): x is string => !!x);
    if (warnings.length && !input.force) {
      throw new BadRequestException({
        message: 'Hợp đồng còn việc chưa hoàn tất',
        warnings,
        requiresConfirmation: true,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contractAppendix.updateMany({ where: { contractId, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
      await tx.contract.update({
        where: { id: contractId },
        data: { status: 'LIQUIDATED', liquidatedAt: new Date(input.liquidationDate), liquidationNote: input.note },
      });
      await this.log(
        user,
        c,
        'contract.liquidate',
        { date: input.liquidationDate, note: input.note, warnings: warnings.join('; ') || undefined },
        tx,
      );
    });
  }

  // ───────────────────────── Danh sách liên hợp đồng & lịch ─────────────────────────

  async list(user: AuthUser, q: LifecycleListQuery) {
    const contract = { AND: [this.contracts.scopeWhere(user), { deletedAt: null }] };
    const t = today();
    const soon = new Date(t.getTime() + 7 * DAY);
    const contractSelect = { select: { id: true, code: true, title: true } };
    if (q.kind === 'obligations') {
      const byView: Record<string, Prisma.ContractObligationWhereInput> = {
        all: {},
        open: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        overdue: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: t } },
        due_soon: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { gte: t, lte: soon } },
        mine: { assigneeId: user.userId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        done: { status: 'DONE' },
      };
      return this.prisma.contractObligation.findMany({
        where: { tenantId: user.tenantId, contract, ...byView[q.view] },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
        take: 300,
        include: { contract: contractSelect, assignee: { select: { fullName: true } } },
      });
    }
    if (q.kind === 'payments') {
      const byView: Record<string, Prisma.PaymentInstallmentWhereInput> = {
        all: {},
        open: { status: { in: ['PLANNED', 'PARTIAL'] } },
        overdue: { status: { in: ['PLANNED', 'PARTIAL'] }, dueDate: { lt: t } },
        due_soon: { status: { in: ['PLANNED', 'PARTIAL'] }, dueDate: { gte: t, lte: soon } },
        mine: { status: { in: ['PLANNED', 'PARTIAL'] }, contract: { ownerId: user.userId } },
        done: { status: 'PAID' },
      };
      return this.prisma.paymentInstallment.findMany({
        where: { tenantId: user.tenantId, contract, ...byView[q.view] },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
        take: 300,
        include: { contract: { select: { id: true, code: true, title: true, currency: true } } },
      });
    }
    if (q.kind === 'appendices') {
      const byView: Record<string, Prisma.ContractAppendixWhereInput> = {
        all: {},
        open: { status: 'DRAFT' },
        done: { status: 'EFFECTIVE' },
        overdue: { kind: 'EXTENSION' },
        due_soon: { kind: 'EXTENSION' },
        mine: { createdById: user.userId },
      };
      return this.prisma.contractAppendix.findMany({
        where: { tenantId: user.tenantId, contract, ...byView[q.view] },
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: { contract: contractSelect },
      });
    }
    return this.prisma.contractAcceptance.findMany({
      where: { tenantId: user.tenantId, contract },
      orderBy: { acceptedDate: 'desc' },
      take: 300,
      include: { contract: contractSelect },
    });
  }

  /** Sự kiện trong tháng: ngày hiệu lực, hết hạn, hạn thanh toán, hạn nghĩa vụ. */
  async calendar(user: AuthUser, month: string) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Tháng không hợp lệ');
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const range = { gte: start, lt: end };
    const scope = { AND: [this.contracts.scopeWhere(user), { deletedAt: null }] };
    const [expiring, effective, payments, obligations] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where: { AND: [scope, { expiryDate: range, status: { in: ['SIGNED', 'ACTIVE', 'EXPIRED'] } }] },
        select: { id: true, code: true, title: true, expiryDate: true },
      }),
      this.prisma.contract.findMany({
        where: { AND: [scope, { effectiveDate: range, status: { in: ['SIGNED', 'ACTIVE'] } }] },
        select: { id: true, code: true, title: true, effectiveDate: true },
      }),
      this.prisma.paymentInstallment.findMany({
        where: { tenantId: user.tenantId, contract: scope, dueDate: range, status: { not: 'CANCELLED' } },
        select: {
          id: true,
          title: true,
          amount: true,
          paidAmount: true,
          status: true,
          dueDate: true,
          contract: { select: { id: true, code: true, currency: true } },
        },
      }),
      this.prisma.contractObligation.findMany({
        where: { tenantId: user.tenantId, contract: scope, dueDate: range, status: { not: 'CANCELLED' } },
        select: { id: true, title: true, status: true, dueDate: true, contract: { select: { id: true, code: true } } },
      }),
    ]);
    const day = (d: Date | null) => d!.toISOString().slice(0, 10);
    return [
      ...expiring.map((c) => ({
        date: day(c.expiryDate),
        type: 'EXPIRY',
        title: `Hết hạn: ${c.title}`,
        contractId: c.id,
        contractCode: c.code,
        done: false,
      })),
      ...effective.map((c) => ({
        date: day(c.effectiveDate),
        type: 'EFFECTIVE',
        title: `Bắt đầu hiệu lực: ${c.title}`,
        contractId: c.id,
        contractCode: c.code,
        done: false,
      })),
      ...payments.map((p) => ({
        date: day(p.dueDate),
        type: 'PAYMENT',
        title: `${p.title} (${p.amount.minus(p.paidAmount).toString()} ${p.contract.currency})`,
        contractId: p.contract.id,
        contractCode: p.contract.code,
        done: p.status === 'PAID',
      })),
      ...obligations.map((o) => ({
        date: day(o.dueDate),
        type: 'OBLIGATION',
        title: o.title,
        contractId: o.contract.id,
        contractCode: o.contract.code,
        done: o.status === 'DONE',
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
  }
}
