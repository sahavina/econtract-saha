import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EXPIRING_SOON_DAYS, PERMISSIONS } from '@saha/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_CONTRACT_CODE_PATTERN, renderCode, sequenceKey } from './contract-code.js';
import type {
  ContractCreate,
  ContractExportQuery,
  ContractQuery,
  ContractUpdate,
  PartyInput,
} from './contracts.schemas.js';

type Tx = Prisma.TransactionClient;

const EDITABLE_APPROVAL = new Set(['NOT_SUBMITTED', 'REJECTED', 'CHANGES_REQUESTED']);
const NULLABLE_SORT = new Set(['signedDate', 'effectiveDate', 'expiryDate']);
const DELETABLE_STATUS = new Set(['DRAFT', 'CANCELLED']);

const listSelect = {
  id: true,
  code: true,
  title: true,
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

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Phạm vi dữ liệu theo quyền: xem tất cả trong tenant hoặc chỉ hợp đồng mình phụ trách/tạo. */
  scopeWhere(user: AuthUser): Prisma.ContractWhereInput {
    if (user.permissions.has(PERMISSIONS.CONTRACT_VIEW_ALL)) return { tenantId: user.tenantId };
    if (user.permissions.has(PERMISSIONS.CONTRACT_VIEW_OWN)) {
      return { tenantId: user.tenantId, OR: [{ ownerId: user.userId }, { createdById: user.userId }] };
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

    if (q.status) and.push({ status: q.status });
    if (q.contractTypeId) and.push({ contractTypeId: q.contractTypeId });
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
        parties: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
    return contract;
  }

  async create(user: AuthUser, input: ContractCreate) {
    const refs = await this.assertReferences(user, input);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const code = input.code ?? (await this.nextCode(tx, user, refs));
          const contract = await tx.contract.create({
            data: {
              ...this.mapScalars(input),
              tenantId: user.tenantId,
              code,
              title: input.title,
              createdById: user.userId,
              ownerId: input.ownerId ?? user.userId,
              departmentId: input.departmentId ?? user.departmentId,
              parties: { create: input.parties.map((p, i) => this.mapParty(p, i)) },
            },
          });
          await this.audit.log(
            user,
            {
              action: 'contract.create',
              entityType: 'contract',
              entityId: contract.id,
              data: { code, title: contract.title },
            },
            tx,
          );
          return contract;
        });
      } catch (err) {
        const isCodeConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isCodeConflict) throw err;
        if (input.code) throw new ConflictException(`Mã hợp đồng "${input.code}" đã tồn tại`);
      }
    }
    throw new ConflictException('Không thể sinh mã hợp đồng duy nhất, vui lòng thử lại');
  }

  async update(user: AuthUser, id: string, input: ContractUpdate) {
    const current = await this.get(user, id);
    this.assertEditable(current);
    await this.assertReferences(user, input);
    return this.prisma.$transaction(async (tx) => {
      if (input.parties) {
        await tx.contractParty.deleteMany({ where: { contractId: id } });
        await tx.contractParty.createMany({
          data: input.parties.map((p, i) => ({ ...this.mapParty(p, i), contractId: id })),
        });
      }
      const contract = await tx.contract.update({
        where: { id },
        data: {
          ...this.mapScalars(input),
          title: input.title,
          ownerId: input.ownerId,
          departmentId: input.departmentId,
        },
      });
      await this.audit.log(
        user,
        { action: 'contract.update', entityType: 'contract', entityId: id, data: { changes: Object.keys(input) } },
        tx,
      );
      return contract;
    });
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
      parties: src.parties.map(({ id: _id, contractId: _c, sortOrder: _s, ...p }) => p),
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
        select: { id: true, code: true, name: true, codePattern: true },
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
  private async assertReferences(user: AuthUser, input: Partial<ContractCreate>) {
    const tenantId = user.tenantId;
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
  ) {
    const pattern = refs.type?.codePattern ?? DEFAULT_CONTRACT_CODE_PATTERN;
    const ctx = { date: new Date(), typeCode: refs.type?.code, departmentCode: refs.dept?.code };
    const key = sequenceKey(pattern, ctx);
    // Tăng bộ đếm nguyên tử; an toàn khi nhiều người tạo cùng lúc.
    const rows = await tx.$queryRaw<{ current: number }[]>`
      INSERT INTO "NumberSequence" ("tenantId", "key", "current", "updatedAt")
      VALUES (${user.tenantId}::uuid, ${key}, 1, now())
      ON CONFLICT ("tenantId", "key") DO UPDATE SET "current" = "NumberSequence"."current" + 1, "updatedAt" = now()
      RETURNING "current"`;
    return renderCode(pattern, ctx, rows[0].current);
  }

  private mapScalars(input: ContractUpdate) {
    return {
      contractTypeId: input.contractTypeId,
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
      contentHtml: input.contentHtml,
    };
  }

  private mapParty(p: PartyInput, index: number) {
    return { ...p, sortOrder: index };
  }
}
