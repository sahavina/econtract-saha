import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type CodeContext,
  DEFAULT_QUOTE_CODE_PATTERN,
  hasSequence,
  itemAmount,
  orderTotals,
  partnerAbbreviation,
  renderCode,
  sequenceKey,
  withDuplicateSuffix,
} from '@saha/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QuoteCodeSettings, QuoteCreate, QuoteDecision, QuoteLinkOrder, QuoteMarkSent, QuoteQuery, QuoteSendEmail, QuoteUpdate } from './quotes.schemas.js';

/** Cấu hình lưu trong Tenant.settings. */
type TenantSettings = { quoteCodePattern?: string } & Record<string, unknown>;

const isCodeConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** Hết hạn tính đến hết ngày hiệu lực. */
const today = () => new Date(new Date().toISOString().slice(0, 10));

const relations = {
  partner: { select: { id: true, code: true, name: true } },
  order: { select: { id: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
  sentBy: { select: { id: true, fullName: true } },
} satisfies Prisma.QuoteInclude;

@Injectable()
export class QuotesService {
  private readonly logger = new Logger('Quotes');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
    private readonly mail: MailService,
  ) {}

  async list(user: AuthUser, q: QuoteQuery) {
    const open = { in: ['DRAFT', 'SENT'] as ('DRAFT' | 'SENT')[] };
    const notExpired = { OR: [{ validUntil: null }, { validUntil: { gte: today() } }] };
    const statusWhere: Prisma.QuoteWhereInput =
      q.status === 'EXPIRED'
        ? { status: open, validUntil: { lt: today() } }
        : q.status === 'DRAFT' || q.status === 'SENT'
          ? { status: q.status, ...notExpired }
          : q.status
            ? { status: q.status }
            : {};
    const where: Prisma.QuoteWhereInput = {
      tenantId: user.tenantId,
      ...statusWhere,
      ...(q.partnerId && { partnerId: q.partnerId }),
      ...((q.from || q.to) && { date: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.q && {
        AND: [
          {
            OR: [
              { code: { contains: q.q, mode: 'insensitive' } },
              { customerName: { contains: q.q, mode: 'insensitive' } },
              { customerTaxCode: { contains: q.q, mode: 'insensitive' } },
              { items: { some: { name: { contains: q.q, mode: 'insensitive' } } } },
            ],
          },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quote.findMany({ where, include: relations, orderBy: [{ date: 'desc' }, { code: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.quote.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { ...relations, items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Không tìm thấy báo giá');
    return quote;
  }

  async create(user: AuthUser, input: QuoteCreate) {
    await this.assertLinks(user, input);
    const { items, totals } = this.lines(input.items, input.vatRate);
    const { items: _items, date, validUntil, ...header } = input;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const code = await this.nextCode(tx, user, date, input);
          const quote = await tx.quote.create({
            data: {
              ...header,
              ...totals,
              tenantId: user.tenantId,
              code,
              date: new Date(date),
              validUntil: validUntil ? new Date(validUntil) : null,
              createdById: user.userId,
              items: { create: items },
            },
          });
          await this.audit.log(user, { action: 'quote.create', entityType: 'quote', entityId: quote.id, data: { code, customer: input.customerName, total: totals.total } }, tx);
          return quote;
        });
      } catch (e) {
        if (!isCodeConflict(e)) throw e;
      }
    }
    throw new ConflictException('Không sinh được số báo giá, vui lòng thử lại');
  }

  async update(user: AuthUser, id: string, input: QuoteUpdate) {
    const current = await this.get(user, id);
    if (current.status === 'ACCEPTED' || current.status === 'REJECTED') throw new BadRequestException('Báo giá đã có quyết định của khách; hãy mở lại trước khi sửa');
    await this.assertLinks(user, input);
    const vatRate = input.vatRate === undefined ? current.vatRate : input.vatRate;
    const lines = this.lines(input.items ?? current.items.map((i) => ({ ...i, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString() })), vatRate);
    const { items: _items, date, validUntil, ...header } = input;
    return this.prisma.$transaction(async (tx) => {
      if (input.items) await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      const quote = await tx.quote.update({
        where: { id },
        data: {
          ...header,
          ...lines.totals,
          ...(date && { date: new Date(date) }),
          ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
          ...(input.items && { items: { create: lines.items } }),
        },
      });
      await this.audit.log(user, { action: 'quote.update', entityType: 'quote', entityId: id, data: { code: quote.code, changes: Object.keys(input), total: lines.totals.total } }, tx);
      return quote;
    });
  }

  async markSent(user: AuthUser, id: string, input: QuoteMarkSent) {
    const current = await this.get(user, id);
    this.assertOpen(current.status);
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), sentById: user.userId, sentMethod: input.method, sentTo: null, sentNote: input.note ?? null },
      });
      await this.audit.log(user, { action: 'quote.mark_sent', entityType: 'quote', entityId: id, data: { code: current.code, method: input.method } }, tx);
      return quote;
    });
  }

  /** Gửi email kèm PDF (tạo ở trình duyệt như bản tải về), gửi được mới chuyển sang Đã gửi. */
  async sendEmail(user: AuthUser, id: string, input: QuoteSendEmail, file: Express.Multer.File | undefined) {
    const current = await this.get(user, id);
    this.assertOpen(current.status);
    if (!file || file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('Thiếu tệp PDF báo giá');
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
      this.logger.warn(`Không gửi được email báo giá ${current.code}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException('Không gửi được email. Kiểm tra địa chỉ người nhận và cấu hình email (Cấu hình → Email).');
    }
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), sentById: user.userId, sentMethod: 'EMAIL', sentTo: input.to, sentNote: null },
      });
      await this.audit.log(user, { action: 'quote.send_email', entityType: 'quote', entityId: id, data: { code: current.code, to: input.to, cc: input.cc } }, tx);
      return quote;
    });
  }

  /** Khách đồng ý, từ chối; mở lại thì về Đã gửi (nếu đã gửi) hoặc Nháp. Đã lập đơn thì không đổi được nữa. */
  async decide(user: AuthUser, id: string, input: QuoteDecision) {
    const current = await this.get(user, id);
    if (current.orderId) throw new BadRequestException(`Báo giá đã chuyển thành đơn ${current.order?.code ?? ''}`.trim());
    const status = input.decision === 'REOPEN' ? (current.sentAt ? 'SENT' : 'DRAFT') : input.decision;
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.update({ where: { id }, data: { status, decidedAt: input.decision === 'REOPEN' ? null : new Date() } });
      await this.audit.log(user, { action: 'quote.decide', entityType: 'quote', entityId: id, data: { code: current.code, status: `${current.status} → ${status}` } }, tx);
      return quote;
    });
  }

  /** Ghi nhận đơn đặt hàng lập từ báo giá: báo giá chuyển sang Khách đồng ý. */
  async linkOrder(user: AuthUser, id: string, input: QuoteLinkOrder) {
    const current = await this.get(user, id);
    if (current.orderId) throw new BadRequestException(`Báo giá đã chuyển thành đơn ${current.order?.code ?? ''}`.trim());
    const order = await this.contracts.get(user, input.orderId);
    if (order.kind !== 'ORDER') throw new BadRequestException('Chỉ gắn được đơn đặt hàng');
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.update({ where: { id }, data: { orderId: order.id, status: 'ACCEPTED', decidedAt: current.decidedAt ?? new Date() } });
      await this.audit.log(user, { action: 'quote.link_order', entityType: 'quote', entityId: id, data: { code: current.code, order: order.code } }, tx);
      return quote;
    });
  }

  /** Mẫu mã báo giá của doanh nghiệp (Cấu hình → Mã báo giá); chưa đặt ⇒ mặc định BG-{YYYY}-{SEQUENCE:4}. */
  async codeSettings(user: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
    const pattern = (t.settings as TenantSettings | null)?.quoteCodePattern || DEFAULT_QUOTE_CODE_PATTERN;
    return { pattern, defaultPattern: DEFAULT_QUOTE_CODE_PATTERN, example: renderCode(pattern, { date: new Date(), partnerCode: 'ABC' }, 1) };
  }

  async updateCodeSettings(user: AuthUser, input: QuoteCodeSettings) {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
      const before = (t.settings as TenantSettings | null)?.quoteCodePattern || DEFAULT_QUOTE_CODE_PATTERN;
      const settings = { ...((t.settings ?? {}) as TenantSettings), quoteCodePattern: input.pattern };
      await tx.tenant.update({ where: { id: user.tenantId }, data: { settings: settings as Prisma.InputJsonValue } });
      await this.audit.log(user, { action: 'quote.code_settings', entityType: 'tenant', entityId: user.tenantId, data: { pattern: `${before} → ${input.pattern}` } }, tx);
    });
    return this.codeSettings(user);
  }

  /**
   * Sinh mã báo giá theo mẫu của doanh nghiệp. Có {SEQUENCE}: bộ đếm riêng theo phần mã cố định (vd theo năm),
   * luôn lớn hơn số lớn nhất đã dùng (kể cả báo giá tạo trước khi có bộ đếm hoặc khi đổi mẫu). Không có {SEQUENCE}:
   * trùng thì thêm "-2", "-3"…
   */
  private async nextCode(tx: Prisma.TransactionClient, user: AuthUser, date: string, input: Pick<QuoteCreate, 'partnerId' | 'customerName'>) {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
    const pattern = (t.settings as TenantSettings | null)?.quoteCodePattern || DEFAULT_QUOTE_CODE_PATTERN;
    const [y, m, d] = date.split('-').map(Number);
    const partner = input.partnerId
      ? await tx.partner.findFirst({ where: { id: input.partnerId, tenantId: user.tenantId }, select: { shortName: true, code: true } })
      : null;
    const ctx: CodeContext = { date: new Date(y, m - 1, d), partnerCode: partner ? partner.shortName || partner.code : partnerAbbreviation(input.customerName) };
    if (!hasSequence(pattern)) {
      const base = renderCode(pattern, ctx, 0);
      const taken = await tx.quote.findMany({ where: { tenantId: user.tenantId, code: { startsWith: base } }, select: { code: true } });
      return withDuplicateSuffix(base, taken.map((x) => x.code));
    }
    // Phần mã quanh số thứ tự, vd "BG-2026-" và "" ⇒ số lớn nhất đã dùng trong các mã dạng BG-2026-<số>.
    const fixed = sequenceKey(pattern, ctx).slice('contract:'.length);
    const at = fixed.indexOf('#');
    const [prefix, suffix] = [fixed.slice(0, at), fixed.slice(at + 1)];
    const used = await tx.quote.findMany({ where: { tenantId: user.tenantId, code: { startsWith: prefix, endsWith: suffix } }, select: { code: true } });
    const maxUsed = used.reduce((max, x) => {
      const mid = x.code.slice(prefix.length, x.code.length - suffix.length);
      return /^\d+$/.test(mid) ? Math.max(max, Number(mid)) : max;
    }, 0);
    const key = `quote:${fixed}`;
    const rows = await tx.$queryRaw<{ current: number }[]>`
      INSERT INTO "NumberSequence" ("tenantId", "key", "current", "updatedAt")
      VALUES (${user.tenantId}::uuid, ${key}, ${maxUsed + 1}, now())
      ON CONFLICT ("tenantId", "key") DO UPDATE SET "current" = GREATEST("NumberSequence"."current" + 1, ${maxUsed + 1}), "updatedAt" = now()
      RETURNING "current"`;
    return renderCode(pattern, ctx, rows[0].current);
  }

  private assertOpen(status: string) {
    if (status === 'ACCEPTED' || status === 'REJECTED') throw new BadRequestException('Báo giá đã có quyết định của khách');
  }

  private lines(rows: QuoteCreate['items'], vatRate: Prisma.Decimal | string | null | undefined) {
    const items = rows.map((i, index) => ({
      sortOrder: index,
      productId: i.productId ?? null,
      code: i.code ?? null,
      name: i.name,
      unit: i.unit ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: itemAmount(i.quantity, i.unitPrice),
    }));
    const t = orderTotals(items, vatRate?.toString());
    return { items, totals: { subtotal: t.subtotal, vatAmount: t.vatAmount, total: t.total } };
  }

  /** Đối tác và sản phẩm phải thuộc cùng doanh nghiệp. */
  private async assertLinks(user: AuthUser, input: Pick<QuoteUpdate, 'partnerId' | 'items'>) {
    if (input.partnerId) {
      const count = await this.prisma.partner.count({ where: { id: input.partnerId, tenantId: user.tenantId } });
      if (!count) throw new BadRequestException('Đối tác không hợp lệ');
    }
    const products = [...new Set((input.items ?? []).map((i) => i.productId).filter((x): x is string => !!x))];
    if (products.length) {
      const count = await this.prisma.product.count({ where: { tenantId: user.tenantId, id: { in: products } } });
      if (count !== products.length) throw new BadRequestException('Sản phẩm không hợp lệ');
    }
  }
}
