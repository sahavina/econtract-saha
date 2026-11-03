import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { ContractsService } from '../contracts/contracts.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  PaymentRequestCreate,
  PaymentRequestMarkPaid,
  PaymentRequestMarkSent,
  PaymentRequestQuery,
  PaymentRequestSendEmail,
  PaymentRequestUpdate,
} from './payment-requests.schemas.js';

const relations = {
  contract: { select: { id: true, code: true, kind: true } },
  createdBy: { select: { id: true, fullName: true } },
  sentBy: { select: { id: true, fullName: true } },
  paidBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentRequestInclude;

@Injectable()
export class PaymentRequestsService {
  private readonly logger = new Logger('PaymentRequests');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
    private readonly mail: MailService,
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
      const request = await tx.paymentRequest.update({
        where: { id },
        data: { ...rest, ...(date && { date: new Date(date) }), ...(input.status && input.status !== current.status && this.statusFields(user, input.status, current)) },
      });
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

  /** Đã gửi (tự gửi qua Zalo, giấy…): ghi nhận thời điểm, người gửi, cách gửi. */
  async markSent(user: AuthUser, id: string, input: PaymentRequestMarkSent) {
    const current = await this.get(user, id);
    this.assertCanSend(current.status);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), sentById: user.userId, sentMethod: input.method, sentTo: null, sentNote: input.note ?? null },
      });
      await this.audit.log(user, { action: 'payment_request.mark_sent', entityType: 'payment_request', entityId: id, data: { number: current.number, method: input.method } }, tx);
      return request;
    });
  }

  async markPaid(user: AuthUser, id: string, input: PaymentRequestMarkPaid) {
    const current = await this.get(user, id);
    if (current.status === 'CANCELLED') throw new BadRequestException('Đề nghị đã hủy');
    if (current.status === 'PAID') throw new BadRequestException('Đề nghị đã được đánh dấu thanh toán');
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.update({
        where: { id },
        data: { status: 'PAID', paidAt: input.date ? new Date(input.date) : new Date(), paidById: user.userId },
      });
      await this.audit.log(user, { action: 'payment_request.mark_paid', entityType: 'payment_request', entityId: id, data: { number: current.number, date: input.date } }, tx);
      return request;
    });
  }

  /** Gửi email kèm PDF (tạo ở trình duyệt như bản tải về), gửi được mới chuyển sang Đã gửi. */
  async sendEmail(user: AuthUser, id: string, input: PaymentRequestSendEmail, file: Express.Multer.File | undefined) {
    const current = await this.get(user, id);
    this.assertCanSend(current.status);
    if (!file || file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('Thiếu tệp PDF đề nghị thanh toán');
    try {
      await this.mail.send(user.tenantId, {
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        text: input.message,
        attachments: [{ filename: file.originalname, content: file.buffer, contentType: 'application/pdf' }],
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Không gửi được email đề nghị ${current.number}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException('Không gửi được email. Kiểm tra địa chỉ người nhận và cấu hình email (Cấu hình → Email).');
    }
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), sentById: user.userId, sentMethod: 'EMAIL', sentTo: input.to, sentNote: null },
      });
      await this.audit.log(user, { action: 'payment_request.send_email', entityType: 'payment_request', entityId: id, data: { number: current.number, to: input.to, cc: input.cc } }, tx);
      return request;
    });
  }

  private assertCanSend(status: string) {
    if (status === 'CANCELLED') throw new BadRequestException('Đề nghị đã hủy');
    if (status === 'PAID') throw new BadRequestException('Đề nghị đã được thanh toán');
  }

  /** Đổi trạng thái bằng tay ở trang chi tiết: giữ thông tin gửi/thanh toán khớp với trạng thái. */
  private statusFields(user: AuthUser, status: string, current: { sentAt: Date | null; paidAt: Date | null }) {
    const notPaid = { paidAt: null, paidById: null };
    if (status === 'DRAFT') return { ...notPaid, sentAt: null, sentById: null, sentMethod: null, sentTo: null, sentNote: null };
    if (status === 'SENT') return { ...notPaid, ...(!current.sentAt && { sentAt: new Date(), sentById: user.userId }) };
    if (status === 'PAID' && !current.paidAt) return { paidAt: new Date(), paidById: user.userId };
    return {};
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
