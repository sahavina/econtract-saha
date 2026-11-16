import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { partnerTypeFilter } from '@saha/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PartnerInput, PartnerQuery, PartnerUpdate } from './partners.schemas.js';

/** Tình trạng hợp tác suy ra từ hợp đồng: đang có hợp đồng hiệu lực, đang đàm phán, đã kết thúc, chưa có hợp đồng. */
export type PartnerCooperation = 'ACTIVE' | 'NEGOTIATING' | 'ENDED' | 'NONE';

const ACTIVE_STATUSES = new Set(['SIGNED', 'ACTIVE']);
const NEGOTIATING_STATUSES = new Set(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PENDING_SIGNATURE']);

const ownerSelect = { select: { id: true, fullName: true } } as const;

/**
 * Tổng hợp theo đối tác từ các dòng (đối tác, hợp đồng): tổng giá trị (mỗi hợp đồng tính một lần), số hợp đồng,
 * tình trạng hợp tác. Hợp đồng đã hủy/thùng rác được loại từ truy vấn trước khi gọi.
 */
export function summarizePartnerContracts(rows: { partnerId: string | null; contract: { id: string; value: unknown; status: string } }[]) {
  const byPartner = new Map<string, Map<string, { value: number; status: string }>>();
  for (const r of rows) {
    if (!r.partnerId) continue;
    const contracts = byPartner.get(r.partnerId) ?? new Map<string, { value: number; status: string }>();
    contracts.set(r.contract.id, { value: Number(r.contract.value ?? 0), status: r.contract.status });
    byPartner.set(r.partnerId, contracts);
  }
  const out = new Map<string, { totalValue: string; contractCount: number; cooperation: PartnerCooperation }>();
  for (const [partnerId, contracts] of byPartner) {
    const list = [...contracts.values()];
    const total = list.reduce((s, c) => s + c.value, 0);
    const cooperation: PartnerCooperation = list.some((c) => ACTIVE_STATUSES.has(c.status))
      ? 'ACTIVE'
      : list.some((c) => NEGOTIATING_STATUSES.has(c.status))
        ? 'NEGOTIATING'
        : list.length
          ? 'ENDED'
          : 'NONE';
    out.set(partnerId, { totalValue: String(Math.round(total * 100) / 100), contractCount: list.length, cooperation });
  }
  return out;
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
  ) {}

  async list(user: AuthUser, q: PartnerQuery) {
    const where: Prisma.PartnerWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      type: q.type && { in: partnerTypeFilter(q.type) },
      ...(q.ownerId && { ownerId: q.ownerId }),
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
      this.prisma.partner.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { contractParties: true } }, owner: ownerSelect },
      }),
      this.prisma.partner.count({ where }),
    ]);

    // Giá trị và tình trạng hợp tác chỉ tính trên hợp đồng người dùng được xem.
    const rows = items.length
      ? await this.prisma.contractParty.findMany({
          where: {
            partnerId: { in: items.map((p) => p.id) },
            contract: { AND: [this.contracts.scopeWhere(user), { deletedAt: null, status: { not: 'CANCELLED' } }] },
          },
          select: { partnerId: true, contract: { select: { id: true, value: true, status: true } } },
        })
      : [];
    const stats = summarizePartnerContracts(rows);
    const withStats = items.map((p) => ({ ...p, ...(stats.get(p.id) ?? { totalValue: '0', contractCount: 0, cooperation: 'NONE' as const }) }));
    return paginated(withStats, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { contacts: true, owner: ownerSelect },
    });
    if (!partner) throw new NotFoundException('Không tìm thấy đối tác');
    return partner;
  }

  /** Người phụ trách phải là người dùng của cùng doanh nghiệp. */
  private async assertOwner(user: AuthUser, ownerId: string | null | undefined) {
    if (!ownerId) return;
    const found = await this.prisma.user.count({ where: { id: ownerId, tenantId: user.tenantId } });
    if (!found) throw new BadRequestException('Người phụ trách không thuộc doanh nghiệp');
  }

  async create(user: AuthUser, input: PartnerInput) {
    await this.assertOwner(user, input.ownerId);
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.create({ data: { ...input, tenantId: user.tenantId } });
      await this.audit.log(
        user,
        {
          action: 'partner.create',
          entityType: 'partner',
          entityId: partner.id,
          data: { code: partner.code, name: partner.name },
        },
        tx,
      );
      return partner;
    });
  }

  async update(user: AuthUser, id: string, input: PartnerUpdate) {
    await this.get(user, id);
    await this.assertOwner(user, input.ownerId);
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.update({ where: { id }, data: input });
      await this.audit.log(
        user,
        { action: 'partner.update', entityType: 'partner', entityId: id, data: { changes: Object.keys(input) } },
        tx,
      );
      return partner;
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.partner.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(user, { action: 'partner.delete', entityType: 'partner', entityId: id }, tx);
    });
  }
}
