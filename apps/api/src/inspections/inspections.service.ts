import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_INSPECTION_CODE_PATTERN, type InspectionItemResult, PERMISSIONS, renderCode, sequenceKey } from '@saha/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InspectionCreate, InspectionQuery, InspectionResult, InspectionUpdate } from './inspections.schemas.js';

const userSelect = { select: { id: true, fullName: true, email: true } } as const;
const contractSelect = {
  select: {
    id: true,
    code: true,
    title: true,
    kind: true,
    status: true,
    parties: { orderBy: { sortOrder: 'asc' as const }, select: { name: true, isInternal: true } },
  },
} as const;
const listInclude = { contract: contractSelect, assignee: userSelect, requestedBy: userSelect, printedBy: userSelect } as const;

const isCodeConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const OPEN = new Set(['PENDING', 'IN_PROGRESS']);

/**
 * Kết quả từng dòng hàng: chỉ giữ dòng thuộc hồ sơ, mỗi dòng một kết quả (dòng sau ghi đè dòng trước).
 * Kết thúc "Đạt" khi còn dòng không đạt là mâu thuẫn ⇒ báo lỗi để người kiểm tra chọn "Có vấn đề".
 */
export function mergeItemResults(itemIds: string[], current: InspectionItemResult[], incoming: InspectionItemResult[] | undefined) {
  const valid = new Set(itemIds);
  const byId = new Map(current.filter((r) => valid.has(r.itemId)).map((r) => [r.itemId, r]));
  for (const r of incoming ?? []) if (valid.has(r.itemId)) byId.set(r.itemId, { itemId: r.itemId, ok: r.ok, note: r.note?.trim() || null });
  return itemIds.map((id) => byId.get(id)).filter((r): r is InspectionItemResult => !!r);
}

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
    private readonly notifications: NotificationsService,
  ) {}

  private canManage(user: AuthUser) {
    return user.permissions.has(PERMISSIONS.INSPECTION_MANAGE);
  }

  /**
   * Người dùng thấy yêu cầu được giao cho mình, mình gửi, hoặc của hồ sơ mình xem được (chỉ xem; xử lý vẫn theo
   * người phụ trách/quản lý); quản lý thấy tất cả.
   */
  private visibleWhere(user: AuthUser): Prisma.InspectionRequestWhereInput {
    if (this.canManage(user)) return { tenantId: user.tenantId };
    return { tenantId: user.tenantId, OR: [{ assigneeId: user.userId }, { requestedById: user.userId }, { contract: this.contracts.scopeWhere(user) }] };
  }

  async list(user: AuthUser, q: InspectionQuery) {
    // Theo hồ sơ (tab Kiểm tra của hợp đồng/đơn): mọi yêu cầu xem được của hồ sơ đó, kể cả đã hủy.
    const scope: Prisma.InspectionRequestWhereInput = q.contractId
      ? {}
      : q.scope === 'sent'
        ? { requestedById: user.userId }
        : q.scope === 'all' && this.canManage(user)
          ? {}
          : { assigneeId: user.userId };
    const where: Prisma.InspectionRequestWhereInput = {
      AND: [
        this.visibleWhere(user),
        scope,
        q.status ? { status: q.status } : q.contractId ? {} : { status: { not: 'CANCELLED' } },
        q.contractId ? { contractId: q.contractId } : {},
        q.q
          ? {
              OR: [
                { code: { contains: q.q, mode: 'insensitive' } },
                { content: { contains: q.q, mode: 'insensitive' } },
                { contract: { code: { contains: q.q, mode: 'insensitive' } } },
                { contract: { title: { contains: q.q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inspectionRequest.findMany({
        where,
        include: listInclude,
        // Hạn gần nhất lên trước; chưa có hạn xếp sau; cùng hạn thì yêu cầu cũ trước.
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.inspectionRequest.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  /** Số yêu cầu còn mở được giao cho tôi (hiện trên menu). */
  async openCount(user: AuthUser) {
    const count = await this.prisma.inspectionRequest.count({
      where: { tenantId: user.tenantId, assigneeId: user.userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    return { count };
  }

  async get(user: AuthUser, id: string) {
    const found = await this.prisma.inspectionRequest.findFirst({
      where: { AND: [this.visibleWhere(user), { id }] },
      include: {
        assignee: userSelect,
        requestedBy: userSelect,
        printedBy: userSelect,
        contract: {
          select: {
            ...contractSelect.select,
            value: true,
            vatRate: true,
            currency: true,
            expectedSignDate: true,
            deliveryDate: true,
            deliveryAddress: true,
            owner: { select: { fullName: true } },
            items: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!found) throw new NotFoundException('Không tìm thấy yêu cầu kiểm tra');
    return found;
  }

  /** Người phụ trách phải là người dùng đang hoạt động của cùng doanh nghiệp. */
  private async assertAssignee(user: AuthUser, assigneeId: string) {
    const ok = await this.prisma.user.count({ where: { id: assigneeId, tenantId: user.tenantId, status: 'ACTIVE' } });
    if (!ok) throw new BadRequestException('Người phụ trách không thuộc doanh nghiệp hoặc đã bị khóa');
  }

  async create(user: AuthUser, input: InspectionCreate) {
    // Chỉ gửi yêu cầu cho hồ sơ mình xem được (kiểm tra phạm vi xem hợp đồng).
    const contract = await this.contracts.get(user, input.contractId);
    if (contract.deletedAt) throw new BadRequestException('Hồ sơ đã ở thùng rác');
    await this.assertAssignee(user, input.assigneeId);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const code = await this.nextCode(tx, user);
          const created = await tx.inspectionRequest.create({
            data: {
              tenantId: user.tenantId,
              code,
              contractId: contract.id,
              assigneeId: input.assigneeId,
              requestedById: user.userId,
              content: input.content,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
            },
          });
          await this.audit.log(
            user,
            { action: 'inspection.create', entityType: 'contract', entityId: contract.id, data: { code, assigneeId: input.assigneeId } },
            tx,
          );
          if (input.assigneeId !== user.userId) {
            await this.notifications.notify(
              user.tenantId,
              [input.assigneeId],
              {
                type: 'inspection.assigned',
                title: `Yêu cầu kiểm tra ${code}: ${contract.code}`,
                body: `${user.fullName} đề nghị kiểm tra: ${input.content.slice(0, 200)}`,
                link: `/inspections/${created.id}`,
              },
              tx,
            );
          }
          return created;
        });
      } catch (e) {
        if (!isCodeConflict(e)) throw e;
      }
    }
    throw new ConflictException('Không sinh được số yêu cầu, vui lòng thử lại');
  }

  async update(user: AuthUser, id: string, input: InspectionUpdate) {
    const current = await this.get(user, id);
    if (current.requestedById !== user.userId && !this.canManage(user)) throw new ForbiddenException('Chỉ người gửi hoặc quản lý mới sửa được yêu cầu');
    if (!OPEN.has(current.status)) throw new BadRequestException('Yêu cầu đã kết thúc; mở lại trước khi sửa');
    if (input.assigneeId) await this.assertAssignee(user, input.assigneeId);
    const reassigned = !!input.assigneeId && input.assigneeId !== current.assigneeId;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({
        where: { id },
        data: {
          assigneeId: input.assigneeId,
          content: input.content,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
          // Đổi người phụ trách ⇒ về Chờ xử lý cho người mới nhận.
          ...(reassigned && { status: 'PENDING', startedAt: null }),
        },
      });
      await this.audit.log(user, { action: 'inspection.update', entityType: 'contract', entityId: current.contractId, data: { code: current.code, changes: Object.keys(input) } }, tx);
      if (reassigned && input.assigneeId !== user.userId) {
        await this.notifications.notify(
          user.tenantId,
          [input.assigneeId],
          { type: 'inspection.assigned', title: `Yêu cầu kiểm tra ${current.code}: ${current.contract.code}`, body: `Bạn được giao kiểm tra: ${updated.content.slice(0, 200)}`, link: `/inspections/${id}` },
          tx,
        );
      }
      return updated;
    });
  }

  /** Người phụ trách (hoặc quản lý) nhận xử lý: Chờ xử lý → Đang kiểm tra. */
  async start(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    this.assertProcessor(user, current);
    if (current.status !== 'PENDING') throw new BadRequestException('Chỉ nhận xử lý yêu cầu đang chờ');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
      await this.audit.log(user, { action: 'inspection.start', entityType: 'contract', entityId: current.contractId, data: { code: current.code } }, tx);
      return updated;
    });
  }

  /** Lưu kết quả đang kiểm; có `finish` thì kết thúc (Đạt / Có vấn đề) và báo người gửi. */
  async saveResult(user: AuthUser, id: string, input: InspectionResult) {
    const current = await this.get(user, id);
    this.assertProcessor(user, current);
    if (!OPEN.has(current.status)) throw new BadRequestException('Yêu cầu đã kết thúc; mở lại trước khi sửa kết quả');
    const itemResults = mergeItemResults(
      current.contract.items.map((i) => i.id),
      (current.itemResults ?? []) as unknown as InspectionItemResult[],
      input.itemResults,
    );
    if (input.finish === 'DONE' && itemResults.some((r) => r.ok === false)) {
      throw new BadRequestException('Còn dòng hàng không đạt – chọn "Có vấn đề" hoặc sửa kết quả');
    }
    if (input.finish === 'ISSUE' && !(input.result ?? current.result)?.trim() && !itemResults.some((r) => r.ok === false)) {
      throw new BadRequestException('Ghi rõ vấn đề phát hiện (ô Kết quả) hoặc đánh dấu dòng hàng không đạt');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({
        where: { id },
        data: {
          result: input.result === undefined ? undefined : input.result,
          itemResults: itemResults as unknown as Prisma.InputJsonValue,
          ...(current.status === 'PENDING' && { status: 'IN_PROGRESS', startedAt: new Date() }),
          ...(input.finish && { status: input.finish, completedAt: new Date() }),
        },
      });
      if (input.finish) {
        await this.audit.log(
          user,
          { action: 'inspection.finish', entityType: 'contract', entityId: current.contractId, data: { code: current.code, status: input.finish } },
          tx,
        );
        if (current.requestedById !== user.userId) {
          await this.notifications.notify(
            user.tenantId,
            [current.requestedById],
            {
              type: 'inspection.finished',
              title: `${current.code} ${input.finish === 'DONE' ? 'đã kiểm tra – Đạt' : 'có vấn đề'}: ${current.contract.code}`,
              body: (input.result ?? current.result)?.slice(0, 300) ?? null,
              link: `/inspections/${id}`,
            },
            tx,
          );
        }
      }
      return updated;
    });
  }

  /** Mở lại yêu cầu đã kết thúc (người gửi, người phụ trách hoặc quản lý) ⇒ Đang kiểm tra. */
  async reopen(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (OPEN.has(current.status)) throw new BadRequestException('Yêu cầu đang mở');
    if (![current.requestedById, current.assigneeId].includes(user.userId) && !this.canManage(user)) throw new ForbiddenException('Không có quyền mở lại yêu cầu này');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({
        where: { id },
        data: { status: current.status === 'CANCELLED' ? 'PENDING' : 'IN_PROGRESS', completedAt: null },
      });
      await this.audit.log(user, { action: 'inspection.reopen', entityType: 'contract', entityId: current.contractId, data: { code: current.code } }, tx);
      return updated;
    });
  }

  /** Ghi nhận đã in phiếu (ai xem được yêu cầu đều in được): lần in gần nhất, người in, số lần in. */
  async markPrinted(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({
        where: { id },
        data: { printedAt: new Date(), printedById: user.userId, printCount: { increment: 1 } },
        select: { id: true, printedAt: true, printCount: true },
      });
      await this.audit.log(user, { action: 'inspection.print', entityType: 'contract', entityId: current.contractId, data: { code: current.code, count: updated.printCount } }, tx);
      return updated;
    });
  }

  /** Hủy yêu cầu chưa kết thúc (người gửi hoặc quản lý). */
  async cancel(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.requestedById !== user.userId && !this.canManage(user)) throw new ForbiddenException('Chỉ người gửi hoặc quản lý mới hủy được yêu cầu');
    if (!OPEN.has(current.status)) throw new BadRequestException('Chỉ hủy được yêu cầu chưa kết thúc');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
      await this.audit.log(user, { action: 'inspection.cancel', entityType: 'contract', entityId: current.contractId, data: { code: current.code } }, tx);
      return updated;
    });
  }

  private assertProcessor(user: AuthUser, r: { assigneeId: string }) {
    if (r.assigneeId !== user.userId && !this.canManage(user)) throw new ForbiddenException('Chỉ người phụ trách hoặc quản lý mới xử lý được yêu cầu này');
  }

  /** Số yêu cầu: KT-{YYYY}-{SEQUENCE:4}, bộ đếm theo năm (tăng nguyên tử). */
  private async nextCode(tx: Prisma.TransactionClient, user: AuthUser) {
    const ctx = { date: new Date() };
    const key = `inspection:${sequenceKey(DEFAULT_INSPECTION_CODE_PATTERN, ctx).slice('contract:'.length)}`;
    const rows = await tx.$queryRaw<{ current: number }[]>`
      INSERT INTO "NumberSequence" ("tenantId", "key", "current", "updatedAt")
      VALUES (${user.tenantId}::uuid, ${key}, 1, now())
      ON CONFLICT ("tenantId", "key") DO UPDATE SET "current" = "NumberSequence"."current" + 1, "updatedAt" = now()
      RETURNING "current"`;
    return renderCode(DEFAULT_INSPECTION_CODE_PATTERN, ctx, rows[0].current);
  }
}
