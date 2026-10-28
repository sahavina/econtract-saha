import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { fromScaled, itemAmount, toScaled } from '@saha/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ShippingNoteCreate,
  ShippingNoteQuery,
  ShippingNoteUpdate,
  StockIssueCancel,
  StockIssueCreate,
  StockIssueQuery,
  StockIssueUpdate,
} from './deliveries.schemas.js';

type Tx = Prisma.TransactionClient;
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
const isCodeConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** Mã phiếu theo năm: PXK-2026-0001, PGH-2026-0001 (lấy số lớn nhất hiện có + 1; trùng thì thử lại). */
const nextNumber = (prefix: string, last: string | undefined) => {
  const n = last ? Number(last.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
};
/** Đơn đã hủy/lưu trữ/thùng rác không xuất kho tiếp. */
const CLOSED_ORDER = new Set(['CANCELLED', 'LIQUIDATED', 'ARCHIVED']);

const issueListSelect = {
  id: true,
  code: true,
  issueDate: true,
  receiverName: true,
  receiverUnit: true,
  reason: true,
  warehouse: true,
  status: true,
  totalAmount: true,
  createdAt: true,
  order: { select: { id: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { items: true, shippingNotes: true } },
} satisfies Prisma.StockIssueSelect;

const noteListSelect = {
  id: true,
  code: true,
  sendDate: true,
  toCompany: true,
  toAddress: true,
  toPhones: true,
  boxes: true,
  carrier: true,
  vehicle: true,
  trackingNo: true,
  freight: true,
  status: true,
  sentAt: true,
  deliveredAt: true,
  createdAt: true,
  order: { select: { id: true, code: true } },
  stockIssue: { select: { id: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ShippingNoteSelect;

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
  ) {}

  // ───────────────────────── Phiếu xuất kho ─────────────────────────

  async listIssues(user: AuthUser, q: StockIssueQuery) {
    const where: Prisma.StockIssueWhereInput = {
      tenantId: user.tenantId,
      ...(q.orderId && { orderId: q.orderId }),
      ...(q.status && { status: q.status }),
      ...((q.from || q.to) && { issueDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.q && {
        OR: [
          { code: { contains: q.q, mode: 'insensitive' } },
          { receiverName: { contains: q.q, mode: 'insensitive' } },
          { receiverUnit: { contains: q.q, mode: 'insensitive' } },
          { order: { code: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockIssue.findMany({
        where,
        select: issueListSelect,
        orderBy: [{ issueDate: 'desc' }, { code: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.stockIssue.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async getIssue(user: AuthUser, id: string) {
    const issue = await this.prisma.stockIssue.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        order: { select: { id: true, code: true, title: true } },
        createdBy: { select: { id: true, fullName: true } },
        shippingNotes: { select: { id: true, code: true, status: true, sendDate: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!issue) throw new NotFoundException('Không tìm thấy phiếu xuất kho');
    return issue;
  }

  async createIssue(user: AuthUser, input: StockIssueCreate) {
    const order = input.orderId ? await this.assertOrder(user, input.orderId) : null;
    const orderItems = new Map((order?.items ?? []).map((i) => [i.id, i]));
    if (!order && input.items.some((i) => i.orderItemId)) throw new BadRequestException('Dòng hàng của đơn chỉ dùng khi phiếu gắn đơn đặt hàng');
    await this.assertProducts(user, input.items.map((i) => i.productId));

    // Dòng gắn đơn: không xuất vượt số lượng còn phải giao.
    const perLine = new Map<string, bigint>();
    for (const row of input.items) {
      if (!row.orderItemId) continue;
      const item = orderItems.get(row.orderItemId);
      if (!item) throw new BadRequestException('Dòng hàng không thuộc đơn đặt hàng đã chọn');
      perLine.set(item.id, (perLine.get(item.id) ?? 0n) + toScaled(row.quantity, 3));
    }
    for (const [itemId, qty] of perLine) {
      const item = orderItems.get(itemId)!;
      const remaining = toScaled(item.quantity.toString(), 3) - toScaled(item.deliveredQty.toString(), 3);
      if (qty > remaining) {
        throw new BadRequestException(`"${item.name}": số lượng xuất (${fromScaled(qty, 3)}) vượt số lượng còn phải giao (${fromScaled(remaining > 0n ? remaining : 0n, 3)})`);
      }
    }

    const items = input.items.map((i, index) => ({
      sortOrder: index,
      productId: i.productId ?? null,
      orderItemId: i.orderItemId ?? null,
      code: i.code ?? null,
      name: i.name,
      unit: i.unit ?? null,
      requestedQty: i.requestedQty,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: itemAmount(i.quantity, i.unitPrice),
    }));
    const total = fromScaled(
      items.reduce((s, i) => s + toScaled(i.amount, 2), 0n),
      2,
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const prefix = `PXK-${input.issueDate.slice(0, 4)}-`;
          const last = await tx.stockIssue.findFirst({ where: { tenantId: user.tenantId, code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } });
          const code = nextNumber(prefix, last?.code);
          const { items: _items, orderId: _orderId, issueDate, ...header } = input;
          const issue = await tx.stockIssue.create({
            data: {
              ...header,
              tenantId: user.tenantId,
              code,
              issueDate: new Date(issueDate),
              orderId: order?.id ?? null,
              totalAmount: total,
              createdById: user.userId,
              items: { create: items },
            },
          });
          for (const [itemId, qty] of perLine) {
            await tx.contractItem.update({ where: { id: itemId }, data: { deliveredQty: { increment: fromScaled(qty, 3) } } });
          }
          await this.audit.log(
            user,
            {
              action: 'stock_issue.create',
              entityType: 'stock_issue',
              entityId: issue.id,
              data: { code, order: order?.code, receiver: input.receiverName, items: items.length, total },
            },
            tx,
          );
          if (order) {
            await this.audit.log(
              user,
              { action: 'order.stock_issue', entityType: 'contract', entityId: order.id, data: { code: order.code, stockIssue: code } },
              tx,
            );
          }
          return issue;
        });
      } catch (e) {
        if (!isCodeConflict(e)) throw e;
      }
    }
    throw new ConflictException('Không sinh được số phiếu xuất kho, vui lòng thử lại');
  }

  async updateIssue(user: AuthUser, id: string, input: StockIssueUpdate) {
    const current = await this.getIssue(user, id);
    if (current.status === 'CANCELLED') throw new BadRequestException('Phiếu đã hủy không sửa được');
    return this.prisma.$transaction(async (tx) => {
      const { issueDate, ...rest } = input;
      const issue = await tx.stockIssue.update({ where: { id }, data: { ...rest, issueDate: toDate(issueDate) ?? undefined } });
      await this.audit.log(user, { action: 'stock_issue.update', entityType: 'stock_issue', entityId: id, data: { code: issue.code, changes: Object.keys(input) } }, tx);
      return issue;
    });
  }

  /** Hủy phiếu: trả lại số lượng đã cộng vào "đã giao" của đơn (không âm). */
  async cancelIssue(user: AuthUser, id: string, input: StockIssueCancel) {
    const current = await this.getIssue(user, id);
    if (current.status === 'CANCELLED') throw new BadRequestException('Phiếu đã hủy');
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.stockIssue.updateMany({
        where: { id, status: 'ISSUED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason },
      });
      if (moved.count !== 1) throw new ConflictException('Phiếu vừa được thay đổi, vui lòng tải lại');
      if (current.orderId) await this.revertDelivered(tx, current.orderId, current.items);
      await this.audit.log(
        user,
        { action: 'stock_issue.cancel', entityType: 'stock_issue', entityId: id, data: { code: current.code, order: current.order?.code, reason: input.reason } },
        tx,
      );
      return { ok: true };
    });
  }

  private async revertDelivered(tx: Tx, orderId: string, items: { orderItemId: string | null; quantity: Prisma.Decimal }[]) {
    for (const row of items) {
      if (!row.orderItemId) continue;
      const item = await tx.contractItem.findFirst({ where: { id: row.orderItemId, contractId: orderId }, select: { deliveredQty: true } });
      if (!item) continue; // đơn đã sửa lại dòng hàng ⇒ không còn dòng để trừ
      const left = toScaled(item.deliveredQty.toString(), 3) - toScaled(row.quantity.toString(), 3);
      await tx.contractItem.update({ where: { id: row.orderItemId }, data: { deliveredQty: fromScaled(left > 0n ? left : 0n, 3) } });
    }
  }

  private async assertOrder(user: AuthUser, orderId: string) {
    const order = await this.contracts.get(user, orderId);
    if (order.kind !== 'ORDER') throw new BadRequestException('Chỉ gắn được đơn đặt hàng');
    if (order.deletedAt || order.archivedAt || CLOSED_ORDER.has(order.status)) throw new BadRequestException('Đơn đặt hàng đã hủy, thanh lý hoặc lưu trữ');
    return order;
  }

  private async assertProducts(user: AuthUser, ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return;
    const count = await this.prisma.product.count({ where: { tenantId: user.tenantId, id: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException('Sản phẩm không hợp lệ');
  }

  // ───────────────────────── Phiếu gửi hàng ─────────────────────────

  async listNotes(user: AuthUser, q: ShippingNoteQuery) {
    const where: Prisma.ShippingNoteWhereInput = {
      tenantId: user.tenantId,
      ...(q.status && { status: q.status }),
      ...(q.orderId && { orderId: q.orderId }),
      ...(q.stockIssueId && { stockIssueId: q.stockIssueId }),
      ...((q.from || q.to) && { sendDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.q && {
        OR: [
          { code: { contains: q.q, mode: 'insensitive' } },
          { toCompany: { contains: q.q, mode: 'insensitive' } },
          { toAddress: { contains: q.q, mode: 'insensitive' } },
          { carrier: { contains: q.q, mode: 'insensitive' } },
          { trackingNo: { contains: q.q, mode: 'insensitive' } },
          { vehicle: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shippingNote.findMany({
        where,
        select: noteListSelect,
        orderBy: [{ sendDate: 'desc' }, { code: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.shippingNote.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async getNote(user: AuthUser, id: string) {
    const note = await this.prisma.shippingNote.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        order: { select: { id: true, code: true } },
        stockIssue: { select: { id: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!note) throw new NotFoundException('Không tìm thấy phiếu gửi hàng');
    return note;
  }

  async createNote(user: AuthUser, input: ShippingNoteCreate) {
    const links = await this.assertNoteLinks(user, input.orderId, input.stockIssueId);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const prefix = `PGH-${input.sendDate.slice(0, 4)}-`;
          const last = await tx.shippingNote.findFirst({ where: { tenantId: user.tenantId, code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } });
          const code = nextNumber(prefix, last?.code);
          const note = await tx.shippingNote.create({
            data: {
              ...this.noteData(input),
              ...links,
              tenantId: user.tenantId,
              code,
              sendDate: new Date(input.sendDate),
              toCompany: input.toCompany,
              toAddress: input.toAddress,
              createdById: user.userId,
              ...this.statusDates(input.status, null),
            },
          });
          await this.audit.log(
            user,
            { action: 'shipping_note.create', entityType: 'shipping_note', entityId: note.id, data: { code, to: input.toCompany, carrier: input.carrier, boxes: input.boxes } },
            tx,
          );
          return note;
        });
      } catch (e) {
        if (!isCodeConflict(e)) throw e;
      }
    }
    throw new ConflictException('Không sinh được số phiếu gửi hàng, vui lòng thử lại');
  }

  async updateNote(user: AuthUser, id: string, input: ShippingNoteUpdate) {
    const current = await this.getNote(user, id);
    const links =
      input.orderId !== undefined || input.stockIssueId !== undefined
        ? await this.assertNoteLinks(user, input.orderId === undefined ? current.orderId : input.orderId, input.stockIssueId === undefined ? current.stockIssueId : input.stockIssueId)
        : {};
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.shippingNote.update({
        where: { id },
        data: {
          ...this.noteData(input),
          ...links,
          ...(input.sendDate && { sendDate: new Date(input.sendDate) }),
          ...(input.toCompany && { toCompany: input.toCompany }),
          ...(input.toAddress && { toAddress: input.toAddress }),
          ...(input.status && input.status !== current.status && this.statusDates(input.status, current)),
        },
      });
      await this.audit.log(
        user,
        {
          action: 'shipping_note.update',
          entityType: 'shipping_note',
          entityId: id,
          data: { code: note.code, changes: Object.keys(input), ...(input.status && input.status !== current.status && { status: `${current.status} → ${input.status}` }) },
        },
        tx,
      );
      return note;
    });
  }

  /** Trường lưu thẳng (đã chuẩn hóa null/undefined ở schema). */
  private noteData(input: ShippingNoteUpdate) {
    return {
      fromContact: input.fromContact,
      fromPhone: input.fromPhone,
      fromCompany: input.fromCompany,
      fromAddress: input.fromAddress,
      warning: input.warning,
      toContact: input.toContact,
      toPhones: input.toPhones,
      footNote: input.footNote,
      boxes: input.boxes,
      showBoxNumber: input.showBoxNumber,
      layout: input.layout,
      carrier: input.carrier,
      carrierPhone: input.carrierPhone,
      vehicle: input.vehicle,
      trackingNo: input.trackingNo,
      freight: input.freight,
      freightPayer: input.freightPayer,
      status: input.status,
      note: input.note,
    };
  }

  /** Mốc thời gian theo trạng thái: chuyển sang Đã gửi/Đã giao lần đầu thì ghi nhận thời điểm. */
  private statusDates(status: string | undefined, current: { sentAt: Date | null; deliveredAt: Date | null } | null) {
    const now = new Date();
    if (status === 'SENT') return { sentAt: current?.sentAt ?? now };
    if (status === 'DELIVERED') return { sentAt: current?.sentAt ?? now, deliveredAt: current?.deliveredAt ?? now };
    return {};
  }

  private async assertNoteLinks(user: AuthUser, orderId: string | null | undefined, stockIssueId: string | null | undefined) {
    let order: string | null = null;
    if (stockIssueId) {
      const issue = await this.prisma.stockIssue.findFirst({ where: { id: stockIssueId, tenantId: user.tenantId }, select: { id: true, orderId: true } });
      if (!issue) throw new BadRequestException('Phiếu xuất kho không hợp lệ');
      order = issue.orderId;
    }
    if (orderId) {
      const o = await this.contracts.get(user, orderId);
      if (o.kind !== 'ORDER') throw new BadRequestException('Chỉ gắn được đơn đặt hàng');
      order = o.id;
    }
    return { orderId: order, stockIssueId: stockIssueId ?? null };
  }
}
