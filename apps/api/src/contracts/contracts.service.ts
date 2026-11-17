import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_ORDER_HTML, deliveredValue, EXPIRING_SOON_DAYS, fromScaled, inferContractCategory, itemAmount, orderFulfillment, orderTotals, PERMISSIONS, toScaled } from '@saha/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { PlanLimitsService } from '../platform/plan-limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import { syncPartyPartners } from './contract-partners.js';
import { ContractRevisionsService, snapshotOf } from './contract-revisions.js';
import { sanitizeContractHtml } from './sanitize-content.js';
import {
  type CodeContext,
  DEFAULT_CONTRACT_CODE_PATTERN,
  hasSequence,
  partnerAbbreviation,
  renderCode,
  sequenceKey,
  withDuplicateSuffix,
} from './contract-code.js';
import type {
  ContractCreate,
  ContractExportQuery,
  ContractQuery,
  ContractUpdate,
  OrderDelivery,
  OrderItemInput,
  PartyInput,
} from './contracts.schemas.js';

type Tx = Prisma.TransactionClient;

const EDITABLE_APPROVAL = new Set(['NOT_SUBMITTED', 'REJECTED', 'CHANGES_REQUESTED']);
const NULLABLE_SORT = new Set(['signedDate', 'effectiveDate', 'expiryDate']);
const DELETABLE_STATUS = new Set(['DRAFT', 'CANCELLED']);
/** Đơn đã ký mới được cập nhật số lượng đã giao. */
const DELIVERABLE_STATUS = new Set(['SIGNED', 'ACTIVE']);

const listSelect = {
  id: true,
  code: true,
  title: true,
  kind: true,
  category: true,
  vatRate: true,
  deliveryDate: true,
  parentContract: { select: { id: true, code: true } },
  items: { select: { quantity: true, unitPrice: true, amount: true, deliveredQty: true } },
  value: true,
  currency: true,
  status: true,
  approvalStatus: true,
  signatureStatus: true,
  createdAt: true,
  signedDate: true,
  effectiveDate: true,
  expiryDate: true,
  archivedAt: true,
  deletedAt: true,
  tags: true,
  _count: { select: { documents: { where: { deletedAt: null } } } },
  contractType: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  parties: {
    where: { isInternal: false },
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { name: true, partnerId: true },
  },
} satisfies Prisma.ContractSelect;

/** Ngày cho mã hợp đồng: ngày dự kiến ký (YYYY-MM-DD, theo giờ địa phương), không có thì hôm nay. */
const codeDate = (v: string | null | undefined) => {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
};

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
    private readonly limits: PlanLimitsService,
    private readonly storage: StorageService,
    private readonly revisions: ContractRevisionsService,
  ) {}

  private readonly logger = new Logger(ContractsService.name);

  /** Phạm vi dữ liệu theo quyền: xem tất cả trong tenant, hoặc chỉ hợp đồng mình phụ trách/tạo/được giao duyệt. */
  scopeWhere(user: AuthUser): Prisma.ContractWhereInput {
    if (user.permissions.has(PERMISSIONS.CONTRACT_VIEW_ALL)) return { tenantId: user.tenantId };
    if (user.permissions.has(PERMISSIONS.CONTRACT_VIEW_OWN)) {
      return {
        tenantId: user.tenantId,
        OR: [
          { ownerId: user.userId },
          { createdById: user.userId },
          // Người được giao phê duyệt cũng xem được hợp đồng.
          { approvalRequests: { some: { tasks: { some: { approverId: user.userId } } } } },
          // Người ký nội bộ được chỉ định.
          { signatureRequests: { some: { signers: { some: { userId: user.userId } } } } },
        ],
      };
    }
    throw new ForbiddenException('Bạn không có quyền xem hợp đồng');
  }

  private buildWhere(user: AuthUser, q: ContractExportQuery): Prisma.ContractWhereInput {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const soon = new Date(today.getTime() + EXPIRING_SOON_DAYS * 86_400_000);

    const viewWhere: Record<ContractQuery['view'], Prisma.ContractWhereInput> = {
      all: {},
      mine: { ownerId: user.userId },
      draft: { status: 'DRAFT' },
      pending_approval: { status: 'PENDING_APPROVAL' },
      pending_signature: { status: 'PENDING_SIGNATURE' },
      active: { status: 'ACTIVE' },
      expiring: { status: 'ACTIVE', expiryDate: { gte: today, lte: soon } },
      expired: { status: 'EXPIRED' },
      liquidated: { status: 'LIQUIDATED' },
      archived: {},
      trash: {},
    };

    const and: Prisma.ContractWhereInput[] = [
      this.scopeWhere(user),
      viewWhere[q.view],
      { deletedAt: q.view === 'trash' ? { not: null } : null },
    ];
    if (q.view === 'archived') and.push({ archivedAt: { not: null } });
    else if (q.view !== 'trash') and.push({ archivedAt: null });

    and.push({ kind: q.kind });
    if (q.parentContractId) and.push({ parentContractId: q.parentContractId });
    if (q.status) and.push({ status: q.status });
    if (q.contractTypeId) and.push({ contractTypeId: q.contractTypeId });
    if (q.category) and.push({ category: q.category === 'NONE' ? null : q.category });
    if (q.departmentId) and.push({ departmentId: q.departmentId });
    if (q.ownerId) and.push({ ownerId: q.ownerId });
    if (q.partnerId) and.push({ parties: { some: { partnerId: q.partnerId } } });
    if (q.createdFrom) and.push({ createdAt: { gte: new Date(q.createdFrom) } });
    if (q.createdTo) and.push({ createdAt: { lt: new Date(new Date(q.createdTo).getTime() + 86_400_000) } });
    if (q.q) {
      and.push({
        OR: [
          { code: { contains: q.q, mode: 'insensitive' } },
          { title: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
          { tags: { has: q.q } },
          { parties: { some: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    return { AND: and };
  }

  async list(user: AuthUser, q: ContractQuery) {
    const where = this.buildWhere(user, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        select: listSelect,
        orderBy: this.orderBy(q),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async exportRows(user: AuthUser, q: ContractExportQuery) {
    return this.prisma.contract.findMany({
      where: this.buildWhere(user, q),
      select: listSelect,
      orderBy: this.orderBy(q),
      take: 10_000,
    });
  }

  async get(user: AuthUser, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { AND: [this.scopeWhere(user), { id }] },
      include: {
        contractType: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true } },
        parties: { orderBy: { sortOrder: 'asc' }, include: { partner: { select: { type: true } } } },
        template: { select: { id: true, code: true, name: true, version: true, requiredVariables: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        parentContract: { select: { id: true, code: true, title: true, signedDate: true } },
        _count: { select: { orders: { where: { deletedAt: null } } } },
      },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
    return contract;
  }

  async create(user: AuthUser, rawInput: ContractCreate) {
    const template = rawInput.templateId ? await this.templates.getUsable(user, rawInput.templateId) : null;
    const input: ContractCreate = template
      ? {
          ...rawInput,
          contractTypeId: rawInput.contractTypeId ?? template.contractTypeId,
          contentHtml: rawInput.contentHtml ?? template.contentHtml,
        }
      : rawInput;
    const refs = await this.assertReferences(user, input);
    // Loại "Đơn đặt hàng" ⇒ luôn là đơn; đơn không dùng loại hợp đồng thường.
    const kind = refs.type?.kind === 'ORDER' ? 'ORDER' : input.kind;
    if (kind === 'ORDER' && refs.type && refs.type.kind !== 'ORDER') {
      throw new BadRequestException('Loại hợp đồng đã chọn không dùng cho đơn đặt hàng');
    }
    // Hợp đồng (vd mua bán) cũng có thể có dòng hàng; chỉ đơn mới gắn hợp đồng nguyên tắc.
    if (kind !== 'ORDER' && input.parentContractId) {
      throw new BadRequestException('Chỉ đơn đặt hàng mới gắn hợp đồng nguyên tắc');
    }
    const items = this.mapItems(user, input.items);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.limits.assertCanCreateContract(user.tenantId, tx);
          // Bên đối tác đã phân loại ⇒ thêm/cập nhật vào danh mục Đối tác và liên kết.
          const parties = await syncPartyPartners(tx, user, this.audit, input.parties);
          const code = input.code ?? (await this.nextCode(tx, user, refs, { ...input, parties }));
          const contract = await tx.contract.create({
            data: {
              ...this.mapScalars({
                ...input,
                // Đơn soạn từ đầu ⇒ nội dung mặc định có sẵn bảng hàng hóa và các biến đơn hàng.
                contentHtml: input.contentHtml ?? (kind === 'ORDER' ? DEFAULT_ORDER_HTML : input.contentHtml),
                ...((kind === 'ORDER' || items.length > 0) && { value: this.itemsValue(items, input.value) }),
              }),
              tenantId: user.tenantId,
              kind,
              category: input.category ?? (await this.inferCategory(tx, kind, refs.type?.name, parties)),
              code,
              title: input.title,
              createdById: user.userId,
              ownerId: input.ownerId ?? user.userId,
              departmentId: input.departmentId ?? user.departmentId,
              parties: { create: parties.map((p, i) => this.mapParty(p, i)) },
              items: { create: items },
              templateId: template?.id ?? null,
              templateVersion: template?.version ?? null,
            },
          });
          await this.revisions.recordCreate(tx, user, contract.id, contract.contentHtml);
          await this.audit.log(
            user,
            {
              action: 'contract.create',
              entityType: 'contract',
              entityId: contract.id,
              data: {
                code,
                title: contract.title,
                kind: kind === 'ORDER' ? kind : undefined,
                items: items.length || undefined,
                template: template ? `${template.code} v${template.version}` : undefined,
              },
            },
            tx,
          );
          return contract;
        });
      } catch (err) {
        const isCodeConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isCodeConflict) throw err;
        if (input.code) throw new ConflictException((await this.codeCheck(user, input.code)).message ?? `Mã hợp đồng "${input.code}" đã tồn tại`);
      }
    }
    throw new ConflictException('Không thể sinh mã hợp đồng duy nhất, vui lòng thử lại');
  }

  /** Mã đã dùng ⇒ kèm thông báo (mã của hợp đồng trong thùng rác vẫn bị giữ để khôi phục được). Không trả thông tin hợp đồng kia. */
  async codeCheck(user: AuthUser, code: string) {
    const existing = await this.prisma.contract.findUnique({
      where: { tenantId_code: { tenantId: user.tenantId, code } },
      select: { deletedAt: true },
    });
    if (!existing) return { available: true as const };
    return {
      available: false as const,
      inTrash: !!existing.deletedAt,
      message: existing.deletedAt
        ? `Mã hợp đồng "${code}" đang thuộc một hợp đồng trong thùng rác. Khôi phục hợp đồng đó hoặc dùng mã khác.`
        : `Mã hợp đồng "${code}" đã được dùng cho hợp đồng khác. Hãy dùng mã khác hoặc để trống để hệ thống tự sinh.`,
    };
  }

  async update(user: AuthUser, id: string, input: ContractUpdate, opts: { restoredFromSeq?: number } = {}) {
    const current = await this.get(user, id);
    this.assertEditable(current);
    const refs = await this.assertReferences(user, input, id);
    if (refs.type && (refs.type.kind === 'ORDER') !== (current.kind === 'ORDER')) {
      throw new BadRequestException(current.kind === 'ORDER' ? 'Đơn đặt hàng phải dùng loại "Đơn đặt hàng"' : 'Loại "Đơn đặt hàng" chỉ dùng cho đơn đặt hàng');
    }
    if (current.kind !== 'ORDER' && input.parentContractId) {
      throw new BadRequestException('Chỉ đơn đặt hàng mới gắn hợp đồng nguyên tắc');
    }
    if (input.code !== undefined && input.code !== current.code) {
      const check = await this.codeCheck(user, input.code);
      if (!check.available) throw new ConflictException(check.message);
    }
    try {
      return await this.updateTx(user, id, current, input, opts);
    } catch (err) {
      // Hai người cùng đổi sang một mã trong lúc chờ ⇒ ràng buộc duy nhất báo trùng.
      if (input.code && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException((await this.codeCheck(user, input.code)).message ?? `Mã hợp đồng "${input.code}" đã tồn tại`);
      }
      throw err;
    }
  }

  private updateTx(
    user: AuthUser,
    id: string,
    current: Awaited<ReturnType<ContractsService['get']>>,
    input: ContractUpdate,
    opts: { restoredFromSeq?: number },
  ) {
    const items = input.items ? this.mapItems(user, input.items) : null;
    return this.prisma.$transaction(async (tx) => {
      if (input.parties) {
        const parties = await syncPartyPartners(tx, user, this.audit, input.parties);
        await tx.contractParty.deleteMany({ where: { contractId: id } });
        await tx.contractParty.createMany({
          data: parties.map((p, i) => ({ ...this.mapParty(p, i), contractId: id })),
        });
      }
      if (items) {
        await tx.contractItem.deleteMany({ where: { contractId: id } });
        await tx.contractItem.createMany({ data: items.map((i) => ({ ...i, contractId: id })) });
      }
      const contract = await tx.contract.update({
        where: { id },
        data: {
          ...this.mapScalars({ ...input, ...(items && { value: this.itemsValue(items, input.value ?? current.value.toString()) }) }),
          code: input.code,
          title: input.title,
          ownerId: input.ownerId,
          departmentId: input.departmentId,
        },
      });
      const after = await tx.contract.findUniqueOrThrow({
        where: { id },
        include: {
          contractType: { select: { name: true } },
          department: { select: { name: true } },
          owner: { select: { fullName: true } },
          parties: { orderBy: { sortOrder: 'asc' } },
        },
      });
      const revision = await this.revisions.recordEdit(tx, user, {
        contractId: id,
        tenantId: user.tenantId,
        before: snapshotOf(current),
        after: snapshotOf(after),
        contentBefore: current.contentHtml,
        contentAfter: after.contentHtml,
        baseline: { authorId: current.createdBy?.id ?? null, authorName: current.createdBy?.fullName ?? null, at: current.createdAt },
        restoredFromSeq: opts.restoredFromSeq,
      });
      await this.audit.log(
        user,
        opts.restoredFromSeq !== undefined
          ? { action: 'contract.revision_restore', entityType: 'contract', entityId: id, data: { fromSeq: opts.restoredFromSeq, revision } }
          : { action: 'contract.update', entityType: 'contract', entityId: id, data: { changes: Object.keys(input), revision } },
        tx,
      );
      return contract;
    });
  }

  /** Lịch sử chỉnh sửa (mới nhất trước). */
  async revisionList(user: AuthUser, id: string) {
    await this.get(user, id);
    return this.revisions.list(user.tenantId, id);
  }

  async revisionContent(user: AuthUser, id: string, seq: number) {
    await this.get(user, id);
    return this.revisions.contentAt(user.tenantId, id, seq);
  }

  /** Khôi phục nội dung về một phiên bản cũ (chỉ khi hợp đồng còn sửa được) – tạo phiên bản mới, không xóa lịch sử. */
  async restoreRevision(user: AuthUser, id: string, seq: number) {
    const { contentHtml } = await this.revisionContent(user, id, seq);
    return this.update(user, id, { contentHtml }, { restoredFromSeq: seq });
  }

  async duplicate(user: AuthUser, id: string) {
    const src = await this.get(user, id);
    const copy = await this.create(user, {
      code: null,
      title: `${src.title} (bản sao)`,
      contractTypeId: src.contractTypeId,
      group: src.group,
      description: src.description,
      value: src.value.toString(),
      currency: src.currency,
      vatRate: src.vatRate ? Number(src.vatRate) : null,
      expectedSignDate: null,
      effectiveDate: null,
      expiryDate: null,
      departmentId: src.departmentId,
      ownerId: user.userId,
      confidentiality: src.confidentiality,
      tags: src.tags,
      note: src.note,
      contentHtml: src.contentHtml,
      parties: src.parties.map(({ id: _id, contractId: _c, sortOrder: _s, partner: _p, ...p }) => p),
      kind: src.kind,
      parentContractId: src.parentContractId,
      deliveryDate: null,
      deliveryAddress: src.deliveryAddress,
      paymentTerms: src.paymentTerms,
      items: src.items.map((i) => ({
        productId: i.productId,
        code: i.code,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        note: i.note,
      })),
    });
    await this.audit.log(user, {
      action: 'contract.duplicate',
      entityType: 'contract',
      entityId: copy.id,
      data: { sourceId: id, sourceCode: src.code },
    });
    return copy;
  }

  async setArchived(user: AuthUser, id: string, archived: boolean) {
    const current = await this.get(user, id);
    if (current.deletedAt) throw new BadRequestException('Hợp đồng đang ở thùng rác');
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log(
        user,
        { action: archived ? 'contract.archive' : 'contract.unarchive', entityType: 'contract', entityId: id },
        tx,
      );
      return contract;
    });
  }

  /** Xóa mềm: chỉ hợp đồng nháp hoặc đã hủy. Hợp đồng đã ký không được xóa. */
  async softDelete(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.deletedAt) return;
    if (!DELETABLE_STATUS.has(current.status)) {
      throw new BadRequestException('Chỉ được xóa hợp đồng ở trạng thái Nháp hoặc Đã hủy');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(user, { action: 'contract.delete', entityType: 'contract', entityId: id }, tx);
    });
  }

  /**
   * Xóa vĩnh viễn: chỉ hợp đồng đã ở thùng rác và ở trạng thái Nháp/Đã hủy (hợp đồng đã ký luôn được giữ làm chứng cứ).
   * Dữ liệu con (các bên, tài liệu, phê duyệt, ký…) xóa theo cascade; tệp trong kho xóa sau khi commit.
   * Nhật ký giữ lại mã/tên để tra cứu sau này.
   */
  async purge(user: AuthUser, id: string) {
    const current = await this.prisma.contract.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, code: true, title: true, status: true, deletedAt: true, documents: { select: { storageKey: true } } },
    });
    if (!current) throw new NotFoundException('Không tìm thấy hợp đồng');
    if (!current.deletedAt) throw new BadRequestException('Chỉ xóa vĩnh viễn được hợp đồng đang ở thùng rác');
    if (!DELETABLE_STATUS.has(current.status)) {
      throw new BadRequestException('Chỉ xóa vĩnh viễn được hợp đồng ở trạng thái Nháp hoặc Đã hủy');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.delete({ where: { id } });
      await this.audit.log(
        user,
        {
          action: 'contract.purge',
          entityType: 'contract',
          entityId: id,
          data: { code: current.code, title: current.title, files: current.documents.length },
        },
        tx,
      );
    });
    for (const d of current.documents) {
      // Tệp mồ côi không ảnh hưởng dữ liệu; ghi log để dọn sau nếu kho lỗi.
      await this.storage.remove(d.storageKey).catch((e: unknown) => this.logger.warn(`Không xóa được tệp ${d.storageKey}: ${String(e)}`));
    }
  }

  async restore(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (!current.deletedAt) throw new BadRequestException('Hợp đồng không ở thùng rác');
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.update({ where: { id }, data: { deletedAt: null } });
      await this.audit.log(user, { action: 'contract.restore', entityType: 'contract', entityId: id }, tx);
      return contract;
    });
  }

  async timeline(user: AuthUser, id: string) {
    await this.get(user, id);
    return this.audit.timeline(user, 'contract', id);
  }

  /** Danh mục phục vụ form tạo/sửa hợp đồng. */
  async lookups(user: AuthUser) {
    const [contractTypes, departments, users] = await this.prisma.$transaction([
      this.prisma.contractType.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, code: true, name: true, codePattern: true, kind: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return { contractTypes, departments, users };
  }

  // ───────────────────────── helpers ─────────────────────────

  /** Cột ngày có thể null ⇒ đưa giá trị rỗng xuống cuối; cột bắt buộc sắp xếp thường. */
  private orderBy(q: ContractExportQuery): Prisma.ContractOrderByWithRelationInput[] {
    const nullable = NULLABLE_SORT.has(q.sort);
    return [{ [q.sort]: nullable ? { sort: q.order, nulls: 'last' } : q.order }, { id: 'asc' }];
  }

  private assertEditable(c: {
    status: string;
    approvalStatus: string;
    deletedAt: Date | null;
    archivedAt: Date | null;
  }) {
    if (c.deletedAt || c.archivedAt)
      throw new BadRequestException('Hợp đồng đã lưu trữ hoặc ở thùng rác, không thể chỉnh sửa');
    if (c.status !== 'DRAFT' || !EDITABLE_APPROVAL.has(c.approvalStatus)) {
      throw new BadRequestException('Chỉ được chỉnh sửa hợp đồng ở trạng thái Nháp');
    }
  }

  /** Mọi ID tham chiếu phải thuộc cùng tenant – không tin dữ liệu từ client. */
  private async assertReferences(user: AuthUser, input: Partial<ContractCreate>, selfId?: string) {
    const tenantId = user.tenantId;
    if (input.parentContractId) {
      // Hợp đồng nguyên tắc: hợp đồng thường (không phải đơn) mà người dùng xem được, chưa vào thùng rác.
      const parent = await this.prisma.contract.findFirst({
        where: { AND: [this.scopeWhere(user), { id: input.parentContractId, kind: 'CONTRACT', deletedAt: null }] },
        select: { id: true },
      });
      if (!parent || parent.id === selfId) throw new BadRequestException('Hợp đồng nguyên tắc không hợp lệ');
    }
    const productIds = [...new Set((input.items ?? []).map((i) => i.productId).filter((x): x is string => !!x))];
    if (productIds.length) {
      const count = await this.prisma.product.count({ where: { id: { in: productIds }, tenantId } });
      if (count !== productIds.length) throw new BadRequestException('Sản phẩm không hợp lệ');
    }
    const [type, dept, owner] = await Promise.all([
      input.contractTypeId
        ? this.prisma.contractType.findFirst({ where: { id: input.contractTypeId, tenantId } })
        : null,
      input.departmentId ? this.prisma.department.findFirst({ where: { id: input.departmentId, tenantId } }) : null,
      input.ownerId ? this.prisma.user.findFirst({ where: { id: input.ownerId, tenantId, status: 'ACTIVE' } }) : null,
    ]);
    if (input.contractTypeId && !type) throw new BadRequestException('Loại hợp đồng không hợp lệ');
    if (input.departmentId && !dept) throw new BadRequestException('Phòng ban không hợp lệ');
    if (input.ownerId && !owner) throw new BadRequestException('Nhân viên phụ trách không hợp lệ');

    const partnerIds = [...new Set((input.parties ?? []).map((p) => p.partnerId).filter((x): x is string => !!x))];
    if (partnerIds.length) {
      const count = await this.prisma.partner.count({ where: { id: { in: partnerIds }, tenantId, deletedAt: null } });
      if (count !== partnerIds.length) throw new BadRequestException('Đối tác không hợp lệ');
    }

    const deptForCode =
      dept ??
      (user.departmentId ? await this.prisma.department.findUnique({ where: { id: user.departmentId } }) : null);
    return { type, dept: deptForCode };
  }

  private async nextCode(
    tx: Tx,
    user: AuthUser,
    refs: { type: { code: string; codePattern: string } | null; dept: { code: string } | null },
    input: Pick<ContractCreate, 'expectedSignDate' | 'parties'>,
  ) {
    const pattern = refs.type?.codePattern ?? DEFAULT_CONTRACT_CODE_PATTERN;
    const ctx: CodeContext = {
      date: codeDate(input.expectedSignDate),
      typeCode: refs.type?.code,
      departmentCode: refs.dept?.code,
      partnerCode: await this.partnerCodeOf(tx, user, input.parties),
    };
    if (!hasSequence(pattern)) {
      // Mẫu không đánh số (vd "{DD}{MM}/{YYYY}/HĐNT/{PARTNER}-SAHA"): trùng thì thêm "-2", "-3"…, kể cả mã của hợp đồng trong thùng rác.
      const base = renderCode(pattern, ctx, 0);
      const taken = await tx.contract.findMany({
        where: { tenantId: user.tenantId, code: { startsWith: base } },
        select: { code: true },
      });
      return withDuplicateSuffix(
        base,
        taken.map((t) => t.code),
      );
    }
    const key = sequenceKey(pattern, ctx);
    // Tăng bộ đếm nguyên tử; an toàn khi nhiều người tạo cùng lúc.
    const rows = await tx.$queryRaw<{ current: number }[]>`
      INSERT INTO "NumberSequence" ("tenantId", "key", "current", "updatedAt")
      VALUES (${user.tenantId}::uuid, ${key}, 1, now())
      ON CONFLICT ("tenantId", "key") DO UPDATE SET "current" = "NumberSequence"."current" + 1, "updatedAt" = now()
      RETURNING "current"`;
    return renderCode(pattern, ctx, rows[0].current);
  }

  /**
   * {PARTNER}: bên đối tác (bên đầu tiên không phải nội bộ) – tên viết tắt của đối tác trong danh mục, chưa khai báo thì
   * mã đối tác; bên nhập tay (không liên kết danh mục) thì tự rút gọn từ tên.
   */
  private async partnerCodeOf(tx: Tx, user: AuthUser, parties: ContractCreate['parties']) {
    const party = parties.find((p) => !p.isInternal) ?? parties[0];
    if (!party) return null;
    if (party.partnerId) {
      const partner = await tx.partner.findFirst({
        where: { id: party.partnerId, tenantId: user.tenantId },
        select: { shortName: true, code: true },
      });
      if (partner) return partner.shortName || partner.code;
    }
    return partnerAbbreviation(party.name);
  }

  private mapScalars(input: Omit<ContractUpdate, 'code'>) {
    return {
      contractTypeId: input.contractTypeId,
      category: input.category,
      group: input.group,
      description: input.description,
      value: input.value,
      currency: input.currency,
      vatRate: input.vatRate,
      expectedSignDate: toDate(input.expectedSignDate),
      effectiveDate: toDate(input.effectiveDate),
      expiryDate: toDate(input.expiryDate),
      confidentiality: input.confidentiality,
      tags: input.tags,
      note: input.note,
      contentHtml: input.contentHtml ? sanitizeContractHtml(input.contentHtml) : input.contentHtml,
      parentContractId: input.parentContractId,
      deliveryDate: toDate(input.deliveryDate),
      deliveryAddress: input.deliveryAddress,
      paymentTerms: input.paymentTerms,
    };
  }

  /** Dòng hàng: thành tiền tính lại ở máy chủ, không tin số liệu từ client. */
  private mapItems(user: AuthUser, items: OrderItemInput[]) {
    return items.map((i, index) => ({
      tenantId: user.tenantId,
      productId: i.productId ?? null,
      sortOrder: index,
      code: i.code ?? null,
      name: i.name,
      unit: i.unit ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: itemAmount(i.quantity, i.unitPrice),
      note: i.note ?? null,
    }));
  }

  /** Giá trị = cộng tiền hàng (chưa gồm VAT); chưa có dòng hàng thì giữ giá trị nhập tay. */
  private itemsValue(items: { amount: string }[], fallback: string | undefined) {
    return items.length ? orderTotals(items.map((i) => ({ name: '', quantity: 0, unitPrice: 0, amount: i.amount }))).subtotal : fallback;
  }

  // ───────────────────────── đơn đặt hàng ─────────────────────────

  /** Cập nhật số lượng đã giao của từng dòng hàng (đơn đã ký). */
  async updateDelivery(user: AuthUser, id: string, input: OrderDelivery) {
    const order = await this.get(user, id);
    if (order.kind !== 'ORDER') throw new BadRequestException('Chỉ đơn đặt hàng mới cập nhật giao hàng');
    if (order.deletedAt || order.archivedAt) throw new BadRequestException('Đơn đã lưu trữ hoặc ở thùng rác');
    if (!DELIVERABLE_STATUS.has(order.status)) throw new BadRequestException('Chỉ cập nhật giao hàng khi đơn đã ký');
    const byId = new Map(order.items.map((i) => [i.id, i]));
    const changes: { name: string; from: string; to: string }[] = [];
    for (const row of input.items) {
      const item = byId.get(row.id);
      if (!item) throw new BadRequestException('Dòng hàng không thuộc đơn này');
      if (toScaled(row.deliveredQty, 3) > toScaled(item.quantity.toString(), 3)) {
        throw new BadRequestException(`"${item.name}": số lượng đã giao vượt số lượng đặt`);
      }
      if (toScaled(row.deliveredQty, 3) !== toScaled(item.deliveredQty.toString(), 3)) {
        changes.push({ name: item.name, from: item.deliveredQty.toString(), to: row.deliveredQty });
      }
    }
    if (!changes.length) return this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      for (const row of input.items) await tx.contractItem.update({ where: { id: row.id }, data: { deliveredQty: row.deliveredQty } });
      const items = await tx.contractItem.findMany({ where: { contractId: id }, select: { quantity: true, deliveredQty: true } });
      const status = orderFulfillment(items.map((i) => ({ quantity: i.quantity.toString(), deliveredQty: i.deliveredQty.toString() })));
      await this.audit.log(user, { action: 'order.delivery_update', entityType: 'contract', entityId: id, data: { code: order.code, changes, fulfillment: status } }, tx);
    });
    return this.get(user, id);
  }

  /** Tổng hợp đơn theo bộ lọc (vd một khách hàng): số đơn, giá trị, đã giao, theo trạng thái giao hàng. */
  async orderSummary(user: AuthUser, q: ContractExportQuery) {
    const rows = await this.prisma.contract.findMany({
      where: this.buildWhere(user, { ...q, kind: 'ORDER' }),
      select: { status: true, value: true, vatRate: true, items: { select: { quantity: true, unitPrice: true, amount: true, deliveredQty: true } } },
      take: 10_000,
    });
    let value = 0n;
    let delivered = 0n;
    const byFulfillment = { NONE: 0, PARTIAL: 0, DONE: 0 };
    let signed = 0;
    for (const r of rows) {
      const items = r.items.map((i) => ({ name: '', quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), amount: i.amount.toString(), deliveredQty: i.deliveredQty.toString() }));
      value += toScaled(items.length ? orderTotals(items).subtotal : r.value.toString(), 2);
      delivered += toScaled(deliveredValue(items), 2);
      if (DELIVERABLE_STATUS.has(r.status)) {
        signed++;
        byFulfillment[orderFulfillment(items)]++;
      }
    }
    const money = (n: bigint) => fromScaled(n, 2);
    return { count: rows.length, signed, value: money(value), deliveredValue: money(delivered), remainingValue: money(value - delivered), byFulfillment };
  }

  /** Phân loại khi người dùng để trống: theo loại đơn/loại hợp đồng, rồi theo phân loại đối tác đã liên kết trong danh mục. */
  private async inferCategory(tx: Prisma.TransactionClient, kind: string, typeName: string | undefined, parties: { partnerId?: string | null; isInternal: boolean }[]) {
    const ids = parties.filter((p) => !p.isInternal && p.partnerId).map((p) => p.partnerId!);
    const partners = ids.length ? await tx.partner.findMany({ where: { id: { in: ids } }, select: { id: true, type: true } }) : [];
    const typeOf = new Map(partners.map((p) => [p.id, p.type]));
    return inferContractCategory({ kind, typeName, partyTypes: ids.map((id) => typeOf.get(id)) });
  }

  private mapParty(p: PartyInput, index: number) {
    const { partnerType: _type, ...party } = p;
    return { ...party, sortOrder: index };
  }
}
