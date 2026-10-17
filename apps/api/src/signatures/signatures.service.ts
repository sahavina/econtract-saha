import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildTemplateValues, escapeHtml, PERMISSIONS, renderTemplate } from '@saha/shared';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSignatureInput,
  ExternalSignInput,
  InternalSignInput,
  RejectInput,
  SignatureListQuery,
} from './signatures.schemas.js';

type Tx = Prisma.TransactionClient;
type ClientMeta = { ip?: string; userAgent?: string };

/** Nhà cung cấp chữ ký hiện có. Nhà cung cấp CA (VNPT, Viettel, FPT…) sẽ bổ sung theo cùng luồng trạng thái. */
export const SIGNATURE_PROVIDER = 'INTERNAL';

const DAY = 86_400_000;
const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Trường công khai của người ký (không bao giờ trả hash token/OTP). */
const signerSelect = {
  id: true,
  order: true,
  partyRole: true,
  name: true,
  email: true,
  title: true,
  userId: true,
  method: true,
  status: true,
  signatureImage: true,
  signedAt: true,
  signedHash: true,
  ip: true,
  rejectReason: true,
} satisfies Prisma.SignerSelect;

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
  ) {}

  private appUrl(path: string) {
    return `${this.config.get('APP_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  // ───────────────────────── Gửi ký ─────────────────────────

  async create(user: AuthUser, contractId: string, input: CreateSignatureInput) {
    const contract = await this.contracts.get(user, contractId);
    if (contract.deletedAt || contract.archivedAt)
      throw new BadRequestException('Hợp đồng đã lưu trữ hoặc ở thùng rác');
    if (contract.status !== 'APPROVED' || contract.approvalStatus !== 'APPROVED') {
      throw new BadRequestException('Chỉ gửi ký hợp đồng đã được phê duyệt');
    }

    const userIds = input.signers.map((s) => s.userId).filter((x): x is string => !!x);
    const internal = await this.prisma.user.findMany({
      where: { id: { in: userIds }, tenantId: user.tenantId, status: 'ACTIVE' },
      select: { id: true, email: true, fullName: true },
    });
    if (internal.length !== new Set(userIds).size) throw new BadRequestException('Người ký nội bộ không hợp lệ');

    const snapshot = await this.buildSnapshot(contract);
    const documentHash = sha256(snapshot);
    const expiresAt = new Date(Date.now() + input.expiresInDays * DAY);
    const sequential = input.signingOrder === 'SEQUENTIAL';

    const signers = input.signers.map((s, i) => {
      const u = internal.find((x) => x.id === s.userId);
      const token = u ? null : randomBytes(32).toString('base64url');
      const order = sequential ? i + 1 : 1;
      return {
        token,
        data: {
          tenantId: user.tenantId,
          order,
          partyRole: s.partyRole ?? null,
          name: u?.fullName ?? s.name,
          email: u?.email ?? s.email,
          title: s.title ?? null,
          userId: u?.id ?? null,
          method: u ? ('INTERNAL_PASSWORD' as const) : ('EMAIL_OTP' as const),
          status: order === 1 ? ('PENDING' as const) : ('WAITING' as const),
          tokenHash: token ? sha256(token) : null,
        },
      };
    });

    const request = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.contract.updateMany({
        where: { id: contractId, tenantId: user.tenantId, status: 'APPROVED' },
        data: { status: 'PENDING_SIGNATURE', signatureStatus: 'IN_PROGRESS' },
      });
      if (moved.count !== 1) throw new ConflictException('Hợp đồng vừa được thay đổi hoặc đang có yêu cầu ký');
      const r = await tx.signatureRequest.create({
        data: {
          tenantId: user.tenantId,
          contractId,
          provider: SIGNATURE_PROVIDER,
          signingOrder: input.signingOrder,
          message: input.message ?? null,
          contentSnapshot: snapshot,
          documentHash,
          expiresAt,
          createdById: user.userId,
          signers: { create: signers.map((s) => s.data) },
        },
        include: { signers: { select: { id: true, email: true, status: true, userId: true, name: true } } },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.signature_request',
          entityType: 'contract',
          entityId: contractId,
          data: {
            code: contract.code,
            documentHash,
            signers: r.signers.map((s) => s.name).join(', '),
            order: input.signingOrder,
          },
        },
        tx,
      );
      return r;
    });

    await this.notifications.notify(
      user.tenantId,
      request.signers.filter((s) => s.status === 'PENDING' && s.userId).map((s) => s.userId),
      {
        type: 'signature.pending',
        title: `Hợp đồng ${contract.code} chờ bạn ký`,
        body: contract.title,
        link: `/contracts/${contractId}?tab=signature`,
      },
    );
    // Gửi lời mời cho người ký đến lượt (ngoài transaction để lỗi email không làm hỏng dữ liệu).
    const tokens = new Map(signers.map((s) => [s.data.email, s.token]));
    for (const s of request.signers.filter((x) => x.status === 'PENDING')) {
      await this.invite(contract, s, tokens.get(s.email) ?? null, input.message ?? null);
    }
    return this.getForContract(user, contractId);
  }

  /** Nội dung đóng băng để ký: nội dung đã thay biến + danh sách tài liệu đính kèm kèm SHA-256. */
  private async buildSnapshot(contract: Awaited<ReturnType<ContractsService['get']>>) {
    const docs = await this.prisma.contractDocument.findMany({
      where: { contractId: contract.id, deletedAt: null },
      orderBy: [{ fileName: 'asc' }, { version: 'asc' }],
      select: { fileName: true, version: true, sha256: true, size: true },
    });
    const html = contract.contentHtml?.trim() ?? '';
    if (!html && docs.length === 0) throw new BadRequestException('Hợp đồng chưa có nội dung hoặc tài liệu để ký');
    const rendered = renderTemplate(
      html,
      buildTemplateValues({ ...contract, value: contract.value.toString(), vatRate: contract.vatRate?.toString() }),
    );
    if (rendered.missing.length || rendered.unknown.length) {
      throw new BadRequestException(
        `Nội dung còn biến chưa có dữ liệu: ${[...rendered.missing, ...rendered.unknown].map((k) => `{{${k}}}`).join(', ')}`,
      );
    }
    const attachments = docs.length
      ? `<h3>Tài liệu đính kèm</h3><table><thead><tr><th>Tên file</th><th>Phiên bản</th><th>SHA-256</th></tr></thead><tbody>${docs
          .map((d) => `<tr><td>${escapeHtml(d.fileName)}</td><td>v${d.version}</td><td>${d.sha256}</td></tr>`)
          .join('')}</tbody></table>`
      : '';
    return rendered.html + attachments;
  }

  private async invite(
    contract: { id: string; code: string; title: string },
    signer: { email: string; name: string; userId: string | null },
    token: string | null,
    message: string | null,
  ) {
    const url = token ? this.appUrl(`/sign/${token}`) : this.appUrl(`/contracts/${contract.id}?tab=signature`);
    await this.mail.send({
      to: signer.email,
      subject: `[SAHA eContract] Mời ký hợp đồng ${contract.code}`,
      text: [
        `Kính gửi ${signer.name},`,
        `Bạn được mời ký điện tử hợp đồng "${contract.title}" (${contract.code}).`,
        message ? `Lời nhắn: ${message}` : '',
        `Mở liên kết để xem và ký: ${url}`,
        token ? 'Khi ký, hệ thống sẽ gửi mã OTP tới email này để xác thực.' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  /** Cấp lại liên kết ký cho người ký bên ngoài (vô hiệu liên kết cũ) và gửi lại email. Trả URL để người gửi sao chép. */
  async resendLink(user: AuthUser, contractId: string, signerId: string) {
    const contract = await this.contracts.get(user, contractId);
    const request = await this.activeRequest(contractId, user.tenantId);
    const signer = await this.prisma.signer.findFirst({ where: { id: signerId, requestId: request.id } });
    if (!signer) throw new NotFoundException('Không tìm thấy người ký');
    if (signer.userId) throw new BadRequestException('Người ký nội bộ ký trực tiếp trong hệ thống');
    if (signer.status !== 'PENDING' && signer.status !== 'WAITING')
      throw new BadRequestException('Người ký đã xử lý xong');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.signer.update({
        where: { id: signer.id },
        data: { tokenHash: sha256(token), otpHash: null, otpAttempts: 0 },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.signature_link',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, signer: signer.name },
        },
        tx,
      );
    });
    if (signer.status === 'PENDING') await this.invite(contract, signer, token, request.message);
    return { url: this.appUrl(`/sign/${token}`) };
  }

  // ───────────────────────── Ký nội bộ ─────────────────────────

  async signInternal(user: AuthUser, contractId: string, input: InternalSignInput, meta: ClientMeta) {
    const contract = await this.contracts.get(user, contractId);
    const request = await this.activeRequest(contractId, user.tenantId);
    const signer = await this.prisma.signer.findFirst({
      where: { requestId: request.id, userId: user.userId, status: 'PENDING' },
    });
    if (!signer) throw new ForbiddenException('Bạn không có lượt ký đang chờ cho hợp đồng này');
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: { passwordHash: true },
    });
    if (!(await bcrypt.compare(input.password, account.passwordHash))) {
      throw new BadRequestException({
        message: 'Mật khẩu xác nhận không đúng',
        errors: [{ field: 'password', message: 'Mật khẩu không đúng' }],
      });
    }
    const afterCommit: (() => Promise<void>)[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const outcome = await this.markSigned(tx, request, signer, input, meta, afterCommit);
      await this.audit.log(
        { ...user, ...meta },
        {
          action: 'contract.signed',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, signer: signer.name, method: 'Mật khẩu', documentHash: request.documentHash },
        },
        tx,
      );
      if (outcome === 'COMPLETED') await this.logCompleted(tx, request.tenantId, contract.code, contractId);
      return { outcome };
    });
    await this.runAfterCommit(afterCommit);
    return result;
  }

  async rejectInternal(user: AuthUser, contractId: string, input: RejectInput) {
    const contract = await this.contracts.get(user, contractId);
    const request = await this.activeRequest(contractId, user.tenantId);
    const signer = await this.prisma.signer.findFirst({
      where: { requestId: request.id, userId: user.userId, status: 'PENDING' },
    });
    if (!signer) throw new ForbiddenException('Bạn không có lượt ký đang chờ cho hợp đồng này');
    await this.prisma.$transaction(async (tx) => {
      await this.markRejected(tx, request, signer.id, input.reason);
      await this.audit.log(
        user,
        {
          action: 'contract.signature_reject',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, signer: signer.name, comment: input.reason },
        },
        tx,
      );
    });
    await this.notifyCreator(request.createdById, contract, `${signer.name} đã từ chối ký. Lý do: ${input.reason}`);
  }

  async cancel(user: AuthUser, contractId: string) {
    const contract = await this.contracts.get(user, contractId);
    const request = await this.activeRequest(contractId, user.tenantId);
    if (
      request.createdById !== user.userId &&
      contract.ownerId !== user.userId &&
      !user.permissions.has(PERMISSIONS.CONTRACT_VIEW_ALL)
    ) {
      throw new ForbiddenException('Chỉ người gửi ký hoặc người phụ trách được hủy yêu cầu ký');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.signer.updateMany({
        where: { requestId: request.id, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'SKIPPED' },
      });
      await tx.signatureRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: { status: 'APPROVED', signatureStatus: 'NOT_STARTED' },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.signature_cancel',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code },
        },
        tx,
      );
    });
  }

  // ───────────────────────── Ký bên ngoài (liên kết + OTP) ─────────────────────────

  private async signerByToken(token: string) {
    const signer = await this.prisma.signer.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        request: { include: { contract: { select: { id: true, code: true, title: true, tenantId: true } } } },
      },
    });
    if (!signer) throw new NotFoundException('Liên kết ký không hợp lệ hoặc đã được thay thế');
    await this.expireIfNeeded(signer.request);
    return this.prisma.signer.findUniqueOrThrow({
      where: { id: signer.id },
      include: {
        request: { include: { contract: { select: { id: true, code: true, title: true, tenantId: true } } } },
      },
    });
  }

  async publicView(token: string) {
    const s = await this.signerByToken(token);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId }, select: { name: true } });
    const signers = await this.prisma.signer.findMany({
      where: { requestId: s.requestId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        order: true,
        name: true,
        title: true,
        partyRole: true,
        status: true,
        signedAt: true,
        signatureImage: true,
      },
    });
    return {
      organization: tenant.name,
      contract: { code: s.request.contract.code, title: s.request.contract.title },
      request: {
        status: s.request.status,
        expiresAt: s.request.expiresAt,
        documentHash: s.request.documentHash,
        message: s.request.message,
        contentSnapshot: s.request.contentSnapshot,
      },
      signer: { id: s.id, name: s.name, email: maskEmail(s.email), status: s.status, otpSentAt: s.otpSentAt },
      signers,
    };
  }

  async sendOtp(token: string) {
    const s = await this.signerByToken(token);
    this.assertCanAct(s);
    if (s.otpSentAt && Date.now() - s.otpSentAt.getTime() < OTP_RESEND_MS) {
      throw new BadRequestException('Vui lòng đợi 60 giây trước khi gửi lại mã');
    }
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.signer.update({
      where: { id: s.id },
      data: {
        otpHash: sha256(`${s.id}:${otp}`),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        otpSentAt: new Date(),
        otpAttempts: 0,
      },
    });
    await this.mail.send({
      to: s.email,
      subject: `[SAHA eContract] Mã OTP ký hợp đồng ${s.request.contract.code}`,
      text: `Mã xác thực ký hợp đồng "${s.request.contract.title}" của bạn là: ${otp}\nMã có hiệu lực 10 phút. Không chia sẻ mã này cho người khác.`,
    });
    return { sentTo: maskEmail(s.email), expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  async signExternal(token: string, input: ExternalSignInput, meta: ClientMeta) {
    const s = await this.signerByToken(token);
    this.assertCanAct(s);
    if (!s.otpHash || !s.otpExpiresAt || s.otpExpiresAt < new Date())
      throw new BadRequestException('Mã OTP đã hết hạn, vui lòng gửi lại mã');
    if (s.otpAttempts >= OTP_MAX_ATTEMPTS)
      throw new BadRequestException('Nhập sai quá số lần cho phép, vui lòng gửi lại mã mới');
    if (sha256(`${s.id}:${input.otp}`) !== s.otpHash) {
      await this.prisma.signer.update({ where: { id: s.id }, data: { otpAttempts: { increment: 1 } } });
      throw new BadRequestException({
        message: 'Mã OTP không đúng',
        errors: [{ field: 'otp', message: 'Mã OTP không đúng' }],
      });
    }
    const afterCommit: (() => Promise<void>)[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const outcome = await this.markSigned(tx, s.request, s, input, meta, afterCommit);
      await this.audit.logExternal(
        s.tenantId,
        { name: `${s.name} (${s.email})`, ...meta },
        {
          action: 'contract.signed',
          entityType: 'contract',
          entityId: s.request.contractId,
          data: {
            code: s.request.contract.code,
            signer: s.name,
            method: 'OTP email',
            documentHash: s.request.documentHash,
          },
        },
        tx,
      );
      if (outcome === 'COMPLETED')
        await this.logCompleted(tx, s.tenantId, s.request.contract.code, s.request.contractId);
      return { outcome };
    });
    await this.runAfterCommit(afterCommit);
    return result;
  }

  async rejectExternal(token: string, input: RejectInput, meta: ClientMeta) {
    const s = await this.signerByToken(token);
    this.assertCanAct(s);
    await this.prisma.$transaction(async (tx) => {
      await this.markRejected(tx, s.request, s.id, input.reason);
      await this.audit.logExternal(
        s.tenantId,
        { name: `${s.name} (${s.email})`, ...meta },
        {
          action: 'contract.signature_reject',
          entityType: 'contract',
          entityId: s.request.contractId,
          data: { code: s.request.contract.code, signer: s.name, comment: input.reason },
        },
        tx,
      );
    });
    await this.notifyCreator(
      s.request.createdById,
      s.request.contract,
      `${s.name} đã từ chối ký. Lý do: ${input.reason}`,
    );
  }

  private assertCanAct(s: { status: string; request: { status: string } }) {
    if (s.request.status === 'EXPIRED') throw new GoneException('Yêu cầu ký đã hết hạn');
    if (s.request.status !== 'IN_PROGRESS') throw new BadRequestException('Yêu cầu ký đã kết thúc');
    if (s.status === 'WAITING') throw new BadRequestException('Chưa đến lượt bạn ký');
    if (s.status !== 'PENDING') throw new BadRequestException('Bạn đã xử lý yêu cầu ký này');
  }

  // ───────────────────────── Trạng thái ─────────────────────────

  private async markSigned(
    tx: Tx,
    request: { id: string; contractId: string; documentHash: string; signingOrder: string; message: string | null },
    signer: { id: string; order: number },
    mark: { signatureImage?: string; typedName?: string },
    meta: ClientMeta,
    afterCommit: (() => Promise<void>)[],
  ): Promise<'SIGNED' | 'COMPLETED'> {
    const claimed = await tx.signer.updateMany({
      where: { id: signer.id, status: 'PENDING' },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signedHash: request.documentHash,
        signatureImage: mark.signatureImage ?? `text:${mark.typedName}`,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
        otpHash: null,
        otpExpiresAt: null,
      },
    });
    if (claimed.count !== 1) throw new ConflictException('Lượt ký đã được xử lý, vui lòng tải lại');

    const remaining = await tx.signer.count({
      where: { requestId: request.id, status: { in: ['PENDING', 'WAITING'] } },
    });
    if (remaining === 0) {
      const today = new Date(new Date().toISOString().slice(0, 10));
      const contract = await tx.contract.findUniqueOrThrow({
        where: { id: request.contractId },
        select: { effectiveDate: true },
      });
      await tx.signatureRequest.update({
        where: { id: request.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await tx.contract.update({
        where: { id: request.contractId },
        data: {
          signatureStatus: 'COMPLETED',
          signedDate: today,
          // Đã đến ngày hiệu lực (hoặc không đặt) ⇒ Đang hiệu lực; ngược lại giữ Đã ký.
          status: contract.effectiveDate && contract.effectiveDate > today ? 'SIGNED' : 'ACTIVE',
        },
      });
      const info = await tx.signatureRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: { tenantId: true, createdById: true, contract: { select: { code: true, title: true, ownerId: true } } },
      });
      await this.notifications.notify(
        info.tenantId,
        [info.createdById, info.contract.ownerId],
        {
          type: 'signature.result',
          title: `Hợp đồng ${info.contract.code} đã ký hoàn tất`,
          body: info.contract.title,
          link: `/contracts/${request.contractId}?tab=signature`,
        },
        tx,
      );
      return 'COMPLETED';
    }

    if (request.signingOrder === 'SEQUENTIAL') {
      const pendingNow = await tx.signer.count({ where: { requestId: request.id, status: 'PENDING' } });
      if (pendingNow === 0) {
        const next = await tx.signer.findFirst({
          where: { requestId: request.id, status: 'WAITING' },
          orderBy: { order: 'asc' },
        });
        if (next) {
          // Người ký kế tiếp: cấp liên kết mới (bên ngoài) và gửi lời mời sau khi giao dịch hoàn tất.
          const token = next.userId ? null : randomBytes(32).toString('base64url');
          await tx.signer.update({
            where: { id: next.id },
            data: { status: 'PENDING', ...(token && { tokenHash: sha256(token) }) },
          });
          const contract = await tx.contract.findUniqueOrThrow({
            where: { id: request.contractId },
            select: { id: true, code: true, title: true },
          });
          afterCommit.push(() => this.invite(contract, next, token, request.message));
          await this.notifications.notify(
            next.tenantId,
            [next.userId],
            {
              type: 'signature.pending',
              title: `Hợp đồng ${contract.code} chờ bạn ký`,
              body: contract.title,
              link: `/contracts/${contract.id}?tab=signature`,
            },
            tx,
          );
        }
      }
    }
    return 'SIGNED';
  }

  /** Lỗi gửi email không làm hỏng thao tác ký đã ghi nhận. */
  private async runAfterCommit(tasks: (() => Promise<void>)[]) {
    for (const t of tasks) await t().catch((err: unknown) => console.error('Gửi email thất bại', err));
  }

  private async markRejected(tx: Tx, request: { id: string; contractId: string }, signerId: string, reason: string) {
    const claimed = await tx.signer.updateMany({
      where: { id: signerId, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason, signedAt: new Date(), otpHash: null },
    });
    if (claimed.count !== 1) throw new ConflictException('Lượt ký đã được xử lý, vui lòng tải lại');
    await tx.signer.updateMany({
      where: { requestId: request.id, status: { in: ['PENDING', 'WAITING'] } },
      data: { status: 'SKIPPED' },
    });
    await tx.signatureRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', completedAt: new Date() },
    });
    // Hợp đồng quay về Đã phê duyệt để gửi ký lại (hoặc xử lý tiếp).
    await tx.contract.update({
      where: { id: request.contractId },
      data: { status: 'APPROVED', signatureStatus: 'REJECTED' },
    });
  }

  private async logCompleted(tx: Tx, tenantId: string, code: string, contractId: string) {
    await this.audit.logExternal(
      tenantId,
      { name: 'Hệ thống' },
      { action: 'contract.signature_completed', entityType: 'contract', entityId: contractId, data: { code } },
      tx,
    );
  }

  private async notifyCreator(
    createdById: string,
    contract: { id: string; code: string; title: string },
    text: string,
  ) {
    const creator = await this.prisma.user.findUnique({
      where: { id: createdById },
      select: { email: true, fullName: true, tenantId: true },
    });
    if (!creator) return;
    await this.notifications.notify(creator.tenantId, [createdById], {
      type: 'signature.result',
      title: `Hợp đồng ${contract.code} bị từ chối ký`,
      body: text,
      link: `/contracts/${contract.id}?tab=signature`,
    });
    await this.mail.send({
      to: creator.email,
      subject: `[SAHA eContract] Hợp đồng ${contract.code} bị từ chối ký`,
      text: `${text}\nXem hợp đồng: ${this.appUrl(`/contracts/${contract.id}?tab=signature`)}`,
    });
  }

  /** Hết hạn được xử lý "lười" khi có truy cập. */
  private async expireIfNeeded(request: { id: string; status: string; expiresAt: Date; contractId: string }) {
    if (request.status !== 'IN_PROGRESS' || request.expiresAt > new Date()) return;
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.signatureRequest.updateMany({
        where: { id: request.id, status: 'IN_PROGRESS' },
        data: { status: 'EXPIRED', completedAt: new Date() },
      });
      if (done.count !== 1) return;
      await tx.signer.updateMany({
        where: { requestId: request.id, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'SKIPPED' },
      });
      await tx.contract.update({
        where: { id: request.contractId },
        data: { status: 'APPROVED', signatureStatus: 'EXPIRED' },
      });
    });
  }

  private async activeRequest(contractId: string, tenantId: string) {
    const r = await this.prisma.signatureRequest.findFirst({ where: { contractId, tenantId, status: 'IN_PROGRESS' } });
    if (!r) throw new BadRequestException('Hợp đồng không có yêu cầu ký đang thực hiện');
    await this.expireIfNeeded(r);
    if (r.expiresAt <= new Date()) throw new GoneException('Yêu cầu ký đã hết hạn');
    return r;
  }

  // ───────────────────────── Tra cứu ─────────────────────────

  async getForContract(user: AuthUser, contractId: string) {
    await this.contracts.get(user, contractId);
    const pending = await this.prisma.signatureRequest.findMany({
      where: { contractId, tenantId: user.tenantId, status: 'IN_PROGRESS' },
    });
    for (const r of pending) await this.expireIfNeeded(r);
    return this.prisma.signatureRequest.findMany({
      where: { contractId, tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        status: true,
        signingOrder: true,
        message: true,
        documentHash: true,
        contentSnapshot: true,
        expiresAt: true,
        createdAt: true,
        completedAt: true,
        createdBy: { select: { id: true, fullName: true } },
        signers: { select: signerSelect, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  async list(user: AuthUser, q: SignatureListQuery) {
    const scope = this.contracts.scopeWhere(user);
    const byView: Record<SignatureListQuery['view'], Prisma.SignatureRequestWhereInput> = {
      all: {},
      mine: { status: 'IN_PROGRESS', signers: { some: { userId: user.userId, status: 'PENDING' } } },
      waiting_partner: { status: 'IN_PROGRESS', signers: { some: { userId: null, status: 'PENDING' } } },
      completed: { status: 'COMPLETED' },
      rejected: { status: 'REJECTED' },
      expired: { status: 'EXPIRED' },
    };
    // Cập nhật hết hạn trước khi liệt kê.
    const stale = await this.prisma.signatureRequest.findMany({
      where: { tenantId: user.tenantId, status: 'IN_PROGRESS', expiresAt: { lt: new Date() } },
      select: { id: true, status: true, expiresAt: true, contractId: true },
    });
    for (const r of stale) await this.expireIfNeeded(r);
    return this.prisma.signatureRequest.findMany({
      where: { tenantId: user.tenantId, contract: scope, ...byView[q.view] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        signingOrder: true,
        expiresAt: true,
        createdAt: true,
        completedAt: true,
        createdBy: { select: { fullName: true } },
        contract: { select: { id: true, code: true, title: true } },
        signers: {
          select: { id: true, name: true, status: true, userId: true, order: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
