import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { ContractsService } from '../contracts/contracts.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PaymentRequestCreate, PaymentRequestQuery, PaymentRequestUpdate } from './payment-requests.schemas.js';

const relations = {
  contract: { select: { id: true, code: true, kind: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentRequestInclude;

@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
  ) {}

  async list(user: AuthUser, q: PaymentRequestQuery) {
    const where: Prisma.PaymentRequestWhereInput = {
      tenantId: user.tenantId,
      ...(q.status && { status: q.status }),
      ...(q.contractId && { contractId: q.contractId }),
      ...(q.partnerId && { contract: { parties: { some: { partnerId: q.partnerId } } } }),
      ...((q.from || q.to) && { date: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.q && {
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { recipient: { contains: q.q, mode: 'insensitive' } },
          { basis: { contains: q.q, mode: 'insensitive' } },
          { contract: { code: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentRequest.findMany({
        where,
        include: relations,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.paymentRequest.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const request = await this.prisma.paymentRequest.findFirst({ where: { id, tenantId: user.tenantId }, include: relations });
    if (!request) throw new NotFoundException('Không tìm thấy đề nghị thanh toán');
    return request;
  }

  async create(user: AuthUser, input: PaymentRequestCreate) {
    await this.assertLinks(user, input.contractId, input.templateId);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.create({
        data: { ...input, tenantId: user.tenantId, date: new Date(input.date), createdById: user.userId },
      });
      await this.audit.log(
        user,
        { action: 'payment_request.create', entityType: 'payment_request', entityId: request.id, data: { number: input.number, recipient: input.recipient, amount: input.amount } },
        tx,
      );
      return request;
    });
  }

  async update(user: AuthUser, id: string, input: PaymentRequestUpdate) {
    const current = await this.get(user, id);
    // Hồ sơ đã gắn từ trước có thể nằm ngoài phạm vi xem của người sửa: chỉ kiểm tra khi đổi sang hồ sơ khác.
    await this.assertLinks(user, input.contractId === current.contractId ? undefined : input.contractId, input.templateId === current.templateId ? undefined : input.templateId);
    return this.prisma.$transaction(async (tx) => {
      const { date, ...rest } = input;
      const request = await tx.paymentRequest.update({ where: { id }, data: { ...rest, ...(date && { date: new Date(date) }) } });
      await this.audit.log(
        user,
        {
          action: 'payment_request.update',
          entityType: 'payment_request',
          entityId: id,
          data: { number: request.number, changes: Object.keys(input), ...(input.status && input.status !== current.status && { status: `${current.status} → ${input.status}` }) },
        },
        tx,
      );
      return request;
    });
  }

  /** Hồ sơ và mẫu gắn kèm phải thuộc cùng doanh nghiệp; hồ sơ phải trong phạm vi người dùng được xem. */
  private async assertLinks(user: AuthUser, contractId: string | null | undefined, templateId: string | null | undefined) {
    if (contractId) await this.contracts.get(user, contractId);
    if (templateId) {
      const count = await this.prisma.contractTemplate.count({ where: { id: templateId, tenantId: user.tenantId } });
      if (!count) throw new BadRequestException('Mẫu đề nghị không hợp lệ');
    }
  }
}
