import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildTemplateValues, renderTemplate, type TemplateParty } from '@saha/shared';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { ContractsService } from '../contracts/contracts.service.js';
import type { ContractStatus, Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateShareLinkInput, SubmitFeedbackInput, UpdateFeedbackInput } from './contract-share.schemas.js';

type ClientMeta = { ip?: string; userAgent?: string };

const DAY = 86_400_000;
/** Tối đa số ý kiến gửi qua một liên kết trong 24 giờ. */
export const FEEDBACK_PER_LINK_PER_DAY = 20;
/** Khoảng cách tối thiểu giữa hai lần gửi qua cùng một liên kết. */
export const FEEDBACK_MIN_INTERVAL_MS = 20_000;
/** Ghi nhật ký lượt xem tối đa một lần mỗi khoảng này cho mỗi liên kết (tránh rác nhật ký khi khách tải lại trang). */
const VIEW_LOG_INTERVAL_MS = 60 * 60_000;

/** Không tạo/mở liên kết xem trước cho hợp đồng đã hủy, thanh lý, lưu trữ. */
const CLOSED_STATUSES: ContractStatus[] = ['CANCELLED', 'LIQUIDATED', 'ARCHIVED'];
/** Chỉ nhận góp ý khi hợp đồng chưa gửi ký. */
const FEEDBACK_STATUSES: ContractStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Dữ liệu hợp đồng cần cho bản xem trước. */
export interface PreviewSource {
  code: string;
  title: string;
  status: ContractStatus;
  value: { toString(): string };
  currency: string;
  vatRate: { toString(): string } | null;
  expectedSignDate: Date | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  contentHtml: string | null;
  contractType: { name: string } | null;
  parties: (TemplateParty & {
    role: string;
    isInternal: boolean;
    entityType: string;
    name: string;
    authorizationRef: string | null;
  })[];
}

const MISSING_MARK = /<mark data-missing="(?:empty|unknown)">\{\{[^<]*?\}\}<\/mark>/g;

/**
 * Bản xem trước cho khách: thông tin chung, các bên, nội dung đã thay biến (biến còn trống hiển thị "……").
 * `hash` = SHA-256 của toàn bộ phần khách nhìn thấy ⇒ phát hiện hợp đồng bị sửa sau khi khách xem
 * (kể cả khi lần sửa được gộp vào cùng một phiên bản lịch sử).
 */
export function buildPreview(c: PreviewSource, revisionSeq: number | null) {
  const value = c.value.toString();
  const vatRate = c.vatRate?.toString() ?? null;
  const contentHtml = c.contentHtml?.trim()
    ? renderTemplate(c.contentHtml, buildTemplateValues({ ...c, value, vatRate })).html.replace(MISSING_MARK, '……')
    : '';
  const contract = {
    code: c.code,
    title: c.title,
    contractType: c.contractType?.name ?? null,
    value,
    currency: c.currency,
    vatRate,
    expectedSignDate: c.expectedSignDate,
    effectiveDate: c.effectiveDate,
    expiryDate: c.expiryDate,
  };
  const parties = c.parties.map((p) => ({
    role: p.role,
    isInternal: p.isInternal,
    entityType: p.entityType,
    name: p.name,
    taxCode: p.taxCode ?? null,
    address: p.address ?? null,
    representative: p.representative ?? null,
    position: p.position ?? null,
    authorizationRef: p.authorizationRef,
    phone: p.phone ?? null,
    email: p.email ?? null,
    bankAccount: p.bankAccount ?? null,
  }));
  const hash = sha256(JSON.stringify({ contract, parties, contentHtml }));
  return { contract, parties, contentHtml, version: { seq: revisionSeq, hash } };
}

/** Trạng thái hiển thị của liên kết. */
export function linkState(link: { revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (link.revokedAt) return 'REVOKED' as const;
  if (link.expiresAt <= now) return 'EXPIRED' as const;
  return 'ACTIVE' as const;
}

const linkSelect = {
  id: true,
  recipientName: true,
  recipientEmail: true,
  expiresAt: true,
  revokedAt: true,
  revokedByName: true,
  createdByName: true,
  viewCount: true,
  lastViewedAt: true,
  createdAt: true,
} satisfies Prisma.ContractShareLinkSelect;

const feedbackSelect = {
  id: true,
  kind: true,
  status: true,
  name: true,
  contact: true,
  clauseRef: true,
  message: true,
  revisionSeq: true,
  contentHash: true,
  response: true,
  resolvedByName: true,
  resolvedAt: true,
  createdAt: true,
  link: { select: { id: true, recipientName: true, recipientEmail: true } },
} satisfies Prisma.ContractFeedbackSelect;

const contractInclude = {
  contractType: { select: { name: true } },
  parties: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ContractInclude;

@Injectable()
export class ContractShareService {
  private readonly logger = new Logger('ContractShare');

  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private appUrl(path: string) {
    return `${this.config.get('APP_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  private async currentSeq(contractId: string) {
    const last = await this.prisma.contractRevision.findFirst({
      where: { contractId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return last?.seq ?? null;
  }

  // ───────────────────────── Nội bộ ─────────────────────────

  async listLinks(user: AuthUser, contractId: string) {
    await this.contracts.get(user, contractId);
    const links = await this.prisma.contractShareLink.findMany({
      where: { tenantId: user.tenantId, contractId },
      orderBy: { createdAt: 'desc' },
      select: { ...linkSelect, _count: { select: { feedback: true } } },
    });
    return {
      mailEnabled: await this.mail.isEnabled(user.tenantId),
      items: links.map(({ _count, ...l }) => ({ ...l, state: linkState(l), feedbackCount: _count.feedback })),
    };
  }

  /** Tạo liên kết; token chỉ trả về một lần (DB chỉ lưu hash). Gửi email nếu được yêu cầu và SMTP đã cấu hình. */
  async createLink(user: AuthUser, contractId: string, input: CreateShareLinkInput) {
    const contract = await this.contracts.get(user, contractId);
    if (contract.deletedAt || contract.archivedAt || CLOSED_STATUSES.includes(contract.status))
      throw new BadRequestException(
        'Hợp đồng đã đóng (hủy, thanh lý, lưu trữ hoặc trong thùng rác), không thể gửi khách xem',
      );
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + input.expiresInDays * DAY);
    const link = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contractShareLink.create({
        data: {
          tenantId: user.tenantId,
          contractId,
          tokenHash: sha256(token),
          recipientName: input.recipientName ?? null,
          recipientEmail: input.recipientEmail ?? null,
          expiresAt,
          createdById: user.userId,
          createdByName: user.fullName,
        },
        select: linkSelect,
      });
      await this.audit.log(
        user,
        {
          action: 'contract.preview_link_create',
          entityType: 'contract',
          entityId: contractId,
          data: {
            code: contract.code,
            recipient: input.recipientName ?? input.recipientEmail ?? null,
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );
      return row;
    });
    const url = this.appUrl(`/preview/${token}`);
    let emailed = false;
    let emailFailed = false;
    if (input.sendEmail && input.recipientEmail && (await this.mail.isEnabled(user.tenantId))) {
      const org = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { name: true } });
      // Link đã tạo: lỗi gửi email không được làm mất link (người dùng vẫn sao chép được).
      try {
        await this.mail.send(user.tenantId, {
          to: input.recipientEmail,
          subject: `[SAHA eContract] Mời xem trước hợp đồng ${contract.code}`,
          text: [
            `Kính gửi ${input.recipientName ?? 'Quý khách'},`,
            `${org.name} gửi Quý khách bản dự thảo hợp đồng "${contract.title}" (${contract.code}) để xem trước.`,
            input.message ? `Lời nhắn: ${input.message}` : '',
            `Mở liên kết để xem nội dung và gửi yêu cầu bổ sung/thay đổi (nếu có): ${url}`,
            `Liên kết có hiệu lực đến ${expiresAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
          ]
            .filter(Boolean)
            .join('\n'),
        });
        emailed = true;
      } catch (err) {
        emailFailed = true;
        this.logger.warn(
          `Không gửi được email link xem trước ${contract.code}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { link: { ...link, state: linkState(link), feedbackCount: 0 }, url, emailed, emailFailed };
  }

  async revokeLink(user: AuthUser, contractId: string, linkId: string) {
    const contract = await this.contracts.get(user, contractId);
    const link = await this.prisma.contractShareLink.findFirst({
      where: { id: linkId, contractId, tenantId: user.tenantId },
    });
    if (!link) throw new NotFoundException('Không tìm thấy liên kết');
    if (link.revokedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.contractShareLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date(), revokedByName: user.fullName },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.preview_link_revoke',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, recipient: link.recipientName ?? link.recipientEmail },
        },
        tx,
      );
    });
  }

  async listFeedback(user: AuthUser, contractId: string) {
    await this.contracts.get(user, contractId);
    const contract = await this.prisma.contract.findFirstOrThrow({
      where: { id: contractId, tenantId: user.tenantId },
      include: contractInclude,
    });
    const current = buildPreview(contract, await this.currentSeq(contractId)).version;
    const rows = await this.prisma.contractFeedback.findMany({
      where: { tenantId: user.tenantId, contractId },
      orderBy: { createdAt: 'desc' },
      select: feedbackSelect,
    });
    return {
      current,
      newCount: rows.filter((r) => r.status === 'NEW').length,
      items: rows.map(({ contentHash, ...r }) => ({ ...r, outdated: contentHash !== current.hash })),
    };
  }

  /** Đánh dấu đã xử lý (kèm phản hồi cho khách) hoặc mở lại. */
  async updateFeedback(user: AuthUser, contractId: string, feedbackId: string, input: UpdateFeedbackInput) {
    const contract = await this.contracts.get(user, contractId);
    const fb = await this.prisma.contractFeedback.findFirst({
      where: { id: feedbackId, contractId, tenantId: user.tenantId },
    });
    if (!fb) throw new NotFoundException('Không tìm thấy yêu cầu của khách');
    const resolved = input.status === 'RESOLVED';
    await this.prisma.$transaction(async (tx) => {
      await tx.contractFeedback.update({
        where: { id: fb.id },
        data: {
          status: input.status,
          ...(input.response !== undefined && { response: input.response }),
          resolvedById: resolved ? user.userId : null,
          resolvedByName: resolved ? user.fullName : null,
          resolvedAt: resolved ? new Date() : null,
        },
      });
      await this.audit.log(
        user,
        {
          action: resolved ? 'contract.feedback_resolve' : 'contract.feedback_reopen',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, customer: fb.name, ...(input.response && { comment: input.response }) },
        },
        tx,
      );
    });
  }

  // ───────────────────────── Công khai (khách hàng, qua token) ─────────────────────────

  /** Liên kết còn hiệu lực + hợp đồng (tenant suy ra từ liên kết). */
  private async resolve(token: string) {
    const link = await this.prisma.contractShareLink.findUnique({
      where: { tokenHash: sha256(token) },
      include: { contract: { include: contractInclude } },
    });
    if (!link) throw new NotFoundException('Liên kết xem trước không hợp lệ');
    const c = link.contract;
    if (linkState(link) !== 'ACTIVE' || c.deletedAt || c.archivedAt || CLOSED_STATUSES.includes(c.status))
      throw new GoneException(
        'Liên kết xem trước đã hết hạn hoặc đã bị thu hồi. Vui lòng liên hệ bên gửi để nhận liên kết mới.',
      );
    return { link, contract: c };
  }

  async publicView(token: string, meta: ClientMeta) {
    const { link, contract } = await this.resolve(token);
    const now = new Date();
    const logView = !link.lastViewedAt || now.getTime() - link.lastViewedAt.getTime() > VIEW_LOG_INTERVAL_MS;
    await this.prisma.$transaction(async (tx) => {
      await tx.contractShareLink.update({
        where: { id: link.id },
        data: { viewCount: { increment: 1 }, lastViewedAt: now },
      });
      if (logView)
        await this.audit.logExternal(
          link.tenantId,
          { name: `${link.recipientName ?? 'Khách hàng'} (xem trước)`, ...meta },
          {
            action: 'contract.preview_view',
            entityType: 'contract',
            entityId: contract.id,
            data: { code: contract.code },
          },
          tx,
        );
    });
    const [tenant, seq, feedback] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: link.tenantId }, select: { name: true } }),
      this.currentSeq(contract.id),
      this.prisma.contractFeedback.findMany({
        where: { linkId: link.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          kind: true,
          status: true,
          name: true,
          clauseRef: true,
          message: true,
          response: true,
          revisionSeq: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
    ]);
    return {
      organization: tenant.name,
      link: { recipientName: link.recipientName, expiresAt: link.expiresAt },
      acceptsFeedback: FEEDBACK_STATUSES.includes(contract.status),
      ...buildPreview(contract, seq),
      feedback,
    };
  }

  async submitFeedback(token: string, input: SubmitFeedbackInput, meta: ClientMeta) {
    const { link, contract } = await this.resolve(token);
    // Bot điền ô ẩn: trả về như thành công nhưng không lưu.
    if (input.website) return { ok: true };
    if (!FEEDBACK_STATUSES.includes(contract.status))
      throw new BadRequestException(
        'Hợp đồng đã chuyển sang bước ký, không nhận thêm yêu cầu qua liên kết này. Vui lòng liên hệ trực tiếp bên gửi.',
      );

    const since = new Date(Date.now() - DAY);
    const recent = await this.prisma.contractFeedback.findMany({
      where: { linkId: link.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, kind: true, message: true },
    });
    if (recent.length >= FEEDBACK_PER_LINK_PER_DAY)
      throw new HttpException(
        'Liên kết này đã nhận quá nhiều yêu cầu trong 24 giờ. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < FEEDBACK_MIN_INTERVAL_MS)
      throw new HttpException(
        'Bạn vừa gửi yêu cầu. Vui lòng đợi ít phút trước khi gửi tiếp.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (recent.some((r) => r.kind === input.kind && (r.message ?? null) === (input.message ?? null)))
      throw new ConflictException('Yêu cầu này đã được gửi trước đó.');

    const seq = await this.currentSeq(contract.id);
    const current = buildPreview(contract, seq).version;
    // Đồng ý chỉ có giá trị với đúng bản hiện tại.
    if (input.kind === 'AGREE' && input.contentHash !== current.hash)
      throw new ConflictException(
        'Nội dung hợp đồng vừa được cập nhật. Vui lòng tải lại trang để xem bản mới trước khi đồng ý.',
      );
    // Phiên bản khách đã xem: không thể lớn hơn phiên bản hiện tại.
    const revisionSeq =
      input.revisionSeq !== null && seq !== null && input.revisionSeq <= seq ? input.revisionSeq : seq;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contractFeedback.create({
        data: {
          tenantId: link.tenantId,
          contractId: contract.id,
          linkId: link.id,
          kind: input.kind,
          name: input.name,
          contact: input.contact,
          clauseRef: input.clauseRef ?? null,
          message: input.message ?? null,
          revisionSeq,
          contentHash: input.contentHash,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent?.slice(0, 500) ?? null,
        },
        select: { id: true },
      });
      await this.audit.logExternal(
        link.tenantId,
        { name: `${input.name} (khách hàng)`, ...meta },
        {
          action: input.kind === 'AGREE' ? 'contract.feedback_agree' : 'contract.feedback_submit',
          entityType: 'contract',
          entityId: contract.id,
          data: { code: contract.code, revisionSeq, ...(input.message && { comment: input.message.slice(0, 300) }) },
        },
        tx,
      );
      await this.notifications.notify(
        link.tenantId,
        [contract.ownerId, contract.createdById, link.createdById],
        {
          type: 'contract.feedback',
          title:
            input.kind === 'AGREE'
              ? `Khách hàng đồng ý nội dung hợp đồng ${contract.code}`
              : `Khách hàng yêu cầu thay đổi hợp đồng ${contract.code}`,
          body: `${input.name}${input.message ? `: ${input.message}` : ''}`,
          link: `/contracts/${contract.id}?tab=feedback`,
        },
        tx,
      );
      return row;
    });
    return { ok: true, id: created.id };
  }
}
