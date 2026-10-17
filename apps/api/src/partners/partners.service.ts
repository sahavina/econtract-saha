import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PartnerInput, PartnerQuery, PartnerUpdate } from './partners.schemas.js';

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PartnerQuery) {
    const where: Prisma.PartnerWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      type: q.type,
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
        include: { _count: { select: { contractParties: true } } },
      }),
      this.prisma.partner.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { contacts: true },
    });
    if (!partner) throw new NotFoundException('Không tìm thấy đối tác');
    return partner;
  }

  create(user: AuthUser, input: PartnerInput) {
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
