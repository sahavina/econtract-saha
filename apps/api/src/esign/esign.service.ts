import { X509Certificate } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { SignaturesService } from '../signatures/signatures.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { SecretBox } from '../integrations/secret-box.js';
import { assertSafeIntegrationUrl } from '../integrations/url-guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type MisaCertificate,
  MisaError,
  MisaEsignClient,
  type MisaHashResult,
  type MisaSignatureBox,
  type MisaTokens,
  pdfPageCount,
} from './misa-esign.client.js';

export const PROVIDER = 'misa_esign';
export const DEFAULT_MISA_BASE_URL = 'https://developer.misa.vn/apis';
/** MISA: phiên ký có hiệu lực 120 giây; chờ thêm một chút cho độ trễ mạng. */
const SESSION_MS = 150_000;

export const misaConfigSchema = z.object({
  baseUrl: z.string().trim().url('Địa chỉ API không hợp lệ').max(300).default(DEFAULT_MISA_BASE_URL),
  clientId: z.string().trim().min(1, 'Nhập ClientID').max(200),
  // Để trống khi sửa ⇒ giữ ClientSecret đã lưu.
  clientSecret: z.string().trim().max(500).optional(),
  enabled: z.boolean().default(true),
});
export type MisaConfigInput = z.infer<typeof misaConfigSchema>;

export const misaLoginSchema = z.object({
  userName: z.string().trim().min(1, 'Nhập email/số điện thoại MISA eSign').max(200),
  password: z.string().min(1, 'Nhập mật khẩu').max(200),
});
export const misaOtpSchema = z.object({
  code: z.string().trim().min(4, 'Nhập mã OTP').max(12),
  otpType: z.coerce.number().int().min(0).max(1).default(0),
});
export const misaCertSchema = z.object({ keyAlias: z.string().trim().min(1).max(100) });
export const misaSignSchema = z.object({
  /** Trang đặt chữ ký (mặc định trang cuối). */
  page: z.coerce.number().int().min(1).max(5000).optional(),
  position: z.enum(['BOTTOM_RIGHT', 'BOTTOM_LEFT']).default('BOTTOM_RIGHT'),
  reason: z.string().trim().max(200).optional(),
  location: z.string().trim().max(100).optional(),
});
export type MisaSignInput = z.infer<typeof misaSignSchema>;

interface StoredSecret {
  clientId: string;
  clientSecret: string;
}
interface HashData {
  hash: MisaHashResult;
  cert: { certificate: string; certificateChain: string[] };
  fileName: string;
  sourceVersion: number;
}

/** Tên chủ thể (CN) của chứng thư để hiển thị. */
function certSubject(b64: string) {
  try {
    const subject = new X509Certificate(Buffer.from(b64, 'base64')).subject;
    return subject.match(/CN=([^\n,]+)/)?.[1]?.trim() ?? subject.split('\n')[0];
  } catch {
    return null;
  }
}

@Injectable()
export class EsignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly contracts: ContractsService,
    private readonly documents: DocumentsService,
    private readonly signatures: SignaturesService,
  ) {}

  private box() {
    const secret = this.config.get('INTEGRATION_SECRET', { infer: true });
    if (!secret) throw new BadRequestException('Máy chủ chưa cấu hình INTEGRATION_SECRET – liên hệ quản trị hệ thống');
    return new SecretBox(secret);
  }

  private find(tenantId: string) {
    return this.prisma.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: PROVIDER } } });
  }

  private async client(tenantId: string) {
    const row = await this.find(tenantId);
    if (!row?.secretEnc) throw new BadRequestException('Doanh nghiệp chưa cấu hình chữ ký số MISA eSign (Cấu hình → Chữ ký số MISA eSign)');
    if (!row.enabled) throw new BadRequestException('Chữ ký số MISA eSign đang tắt');
    const baseUrl = String((row.config as { baseUrl?: string }).baseUrl ?? DEFAULT_MISA_BASE_URL);
    let secret: StoredSecret;
    try {
      secret = JSON.parse(this.box().open(row.secretEnc)) as StoredSecret;
    } catch {
      throw new BadRequestException('Không giải mã được ClientSecret MISA eSign (khóa máy chủ đã đổi?) – hãy nhập lại');
    }
    await this.safeUrl(baseUrl);
    return new MisaEsignClient({ baseUrl, clientId: secret.clientId, clientSecret: secret.clientSecret });
  }

  private async safeUrl(raw: string) {
    try {
      return await assertSafeIntegrationUrl(raw, this.config.get('INTEGRATION_ALLOW_PRIVATE_HOSTS', { infer: true }));
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'URL không hợp lệ');
    }
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof MisaError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  // ───────────── Cấu hình doanh nghiệp ─────────────

  async getConfig(user: AuthUser) {
    const row = await this.find(user.tenantId);
    if (!row) return { configured: false as const, baseUrl: DEFAULT_MISA_BASE_URL };
    let clientId: string | null = null;
    try {
      clientId = row.secretEnc ? (JSON.parse(this.box().open(row.secretEnc)) as StoredSecret).clientId : null;
    } catch {
      clientId = null;
    }
    return {
      configured: true as const,
      enabled: row.enabled,
      baseUrl: String((row.config as { baseUrl?: string }).baseUrl ?? DEFAULT_MISA_BASE_URL),
      clientId,
      hasSecret: !!row.secretEnc,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
    };
  }

  async saveConfig(user: AuthUser, input: MisaConfigInput) {
    const url = await this.safeUrl(input.baseUrl);
    const existing = await this.find(user.tenantId);
    let clientSecret = input.clientSecret;
    if (!clientSecret) {
      if (!existing?.secretEnc) throw new BadRequestException('Nhập ClientSecret');
      try {
        clientSecret = (JSON.parse(this.box().open(existing.secretEnc)) as StoredSecret).clientSecret;
      } catch {
        throw new BadRequestException('Không đọc được ClientSecret đã lưu – hãy nhập lại');
      }
    }
    const secretEnc = this.box().seal(JSON.stringify({ clientId: input.clientId, clientSecret } satisfies StoredSecret));
    const baseUrl = url.toString().replace(/\/+$/, '');
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantIntegration.upsert({
        where: { tenantId_provider: { tenantId: user.tenantId, provider: PROVIDER } },
        create: { tenantId: user.tenantId, provider: PROVIDER, enabled: input.enabled, config: { baseUrl }, secretEnc },
        update: { enabled: input.enabled, config: { baseUrl }, secretEnc, lastTestedAt: null, lastTestOk: null },
      });
      await this.audit.log(
        user,
        { action: 'integration.esign_config', entityType: 'integration', entityId: PROVIDER, data: { baseUrl, enabled: input.enabled, secretChanged: !!input.clientSecret } },
        tx,
      );
    });
    return this.getConfig(user);
  }

  async removeConfig(user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantIntegration.deleteMany({ where: { tenantId: user.tenantId, provider: PROVIDER } });
      await this.audit.log(user, { action: 'integration.esign_remove', entityType: 'integration', entityId: PROVIDER }, tx);
    });
  }

  /**
   * Kiểm tra ClientID/ClientSecret (xem MisaEsignClient.checkCredentials) và ghi kết quả lần kiểm tra gần nhất.
   */
  async test(user: AuthUser) {
    const client = await this.client(user.tenantId);
    const { ok, message } = await client.checkCredentials();
    await this.prisma.tenantIntegration.update({
      where: { tenantId_provider: { tenantId: user.tenantId, provider: PROVIDER } },
      data: { lastTestedAt: new Date(), lastTestOk: ok },
    });
    return { ok, message };
  }

  // ───────────── Tài khoản MISA eSign của người dùng ─────────────

  private accountOf(user: AuthUser) {
    return this.prisma.esignAccount.findUnique({ where: { userId_provider: { userId: user.userId, provider: PROVIDER } } });
  }

  async status(user: AuthUser) {
    const row = await this.find(user.tenantId);
    const account = await this.accountOf(user);
    return {
      ready: !!row?.secretEnc && row.enabled,
      account: account
        ? {
            username: account.username,
            displayName: account.displayName,
            linked: !!account.tokenEnc,
            pendingOtp: !account.tokenEnc,
            certAlias: account.certAlias,
            certSubject: account.certSubject,
          }
        : null,
    };
  }

  private async storeTokens(user: AuthUser, username: string, tokens: MisaTokens, misaUser?: { id: string; displayName: string }) {
    const data = {
      tokenEnc: this.box().seal(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })),
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      ...(misaUser && { externalUserId: misaUser.id || null, displayName: misaUser.displayName || null }),
    };
    await this.prisma.esignAccount.upsert({
      where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
      create: { tenantId: user.tenantId, userId: user.userId, provider: PROVIDER, username, ...data },
      update: { username, ...data },
    });
  }

  /** Đăng nhập tài khoản MISA eSign của chính người dùng; mật khẩu chỉ dùng một lần, không lưu. */
  async login(user: AuthUser, input: z.infer<typeof misaLoginSchema>) {
    const client = await this.client(user.tenantId);
    const r = await this.wrap(() => client.login(input.userName, input.password));
    if (r.kind === 'otp') {
      await this.prisma.esignAccount.upsert({
        where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
        create: { tenantId: user.tenantId, userId: user.userId, provider: PROVIDER, username: input.userName },
        update: { username: input.userName, tokenEnc: null, expiresAt: null },
      });
      return { otpRequired: true as const };
    }
    await this.storeTokens(user, input.userName, r.tokens, r.user);
    return this.afterLink(user, client);
  }

  async verifyOtp(user: AuthUser, input: z.infer<typeof misaOtpSchema>) {
    const account = await this.accountOf(user);
    if (!account) throw new BadRequestException('Hãy đăng nhập MISA eSign trước');
    const client = await this.client(user.tenantId);
    const r = await this.wrap(() => client.twoFactor(account.username, input.code, input.otpType as 0 | 1));
    await this.storeTokens(user, account.username, r.tokens, r.user);
    return this.afterLink(user, client);
  }

  async resendOtp(user: AuthUser) {
    const account = await this.accountOf(user);
    if (!account) throw new BadRequestException('Hãy đăng nhập MISA eSign trước');
    const client = await this.client(user.tenantId);
    await this.wrap(() => client.resendOtp(account.username));
    return { ok: true };
  }

  /** Sau khi liên kết: tự chọn chứng thư nếu chỉ có một chứng thư đang hoạt động; ghi nhật ký. */
  private async afterLink(user: AuthUser, client: MisaEsignClient) {
    const certs = (await this.certificatesWith(user, client)).filter((c) => c.keyStatus.toUpperCase() === 'ACTIVE');
    if (certs.length === 1) await this.saveCert(user, certs[0]);
    const account = await this.accountOf(user);
    await this.audit.log(user, { action: 'esign.account_link', entityType: 'user', entityId: user.userId, data: { provider: PROVIDER, username: account?.username } });
    return { otpRequired: false as const, certificates: certs.map((c) => ({ keyAlias: c.keyAlias, subject: certSubject(c.certificate), appName: c.appName })) };
  }

  /** Gọi API cần token: hết hạn hoặc bị từ chối (401/Auth:002) thì làm mới token rồi thử lại một lần. */
  private async withToken<T>(user: AuthUser, client: MisaEsignClient, fn: (token: string) => Promise<T>): Promise<T> {
    const account = await this.accountOf(user);
    if (!account?.tokenEnc) throw new BadRequestException('Chưa liên kết tài khoản MISA eSign – hãy đăng nhập MISA eSign');
    let tokens = JSON.parse(this.box().open(account.tokenEnc)) as { accessToken: string; refreshToken: string };
    const refresh = async () => {
      try {
        const t = await client.refresh(tokens.refreshToken);
        await this.storeTokens(user, account.username, t);
        tokens = { accessToken: t.accessToken, refreshToken: t.refreshToken };
      } catch {
        await this.prisma.esignAccount.update({ where: { id: account.id }, data: { tokenEnc: null, expiresAt: null } });
        throw new BadRequestException('Phiên đăng nhập MISA eSign đã hết hạn – hãy đăng nhập lại');
      }
    };
    if (account.expiresAt && account.expiresAt.getTime() < Date.now() + 60_000) await refresh();
    try {
      return await fn(tokens.accessToken);
    } catch (e) {
      if (e instanceof MisaError && (e.httpStatus === 401 || String(e.code) === 'Auth:002')) {
        await refresh();
        return this.wrap(() => fn(tokens.accessToken));
      }
      if (e instanceof MisaError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private certificatesWith(user: AuthUser, client: MisaEsignClient) {
    return this.withToken(user, client, (t) => client.certificates(t));
  }

  async certificates(user: AuthUser) {
    const client = await this.client(user.tenantId);
    const certs = await this.certificatesWith(user, client);
    return certs.map((c) => ({ keyAlias: c.keyAlias, keyStatus: c.keyStatus, subject: certSubject(c.certificate), appName: c.appName }));
  }

  private async saveCert(user: AuthUser, cert: MisaCertificate) {
    await this.prisma.esignAccount.update({
      where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
      data: { certAlias: cert.keyAlias, certSubject: certSubject(cert.certificate) },
    });
  }

  async selectCertificate(user: AuthUser, keyAlias: string) {
    const client = await this.client(user.tenantId);
    const cert = (await this.certificatesWith(user, client)).find((c) => c.keyAlias === keyAlias);
    if (!cert) throw new BadRequestException('Không tìm thấy chứng thư số');
    if (cert.keyStatus.toUpperCase() !== 'ACTIVE') throw new BadRequestException('Chứng thư số không ở trạng thái hoạt động');
    await this.saveCert(user, cert);
    return this.status(user);
  }

  async unlink(user: AuthUser) {
    await this.prisma.esignAccount.deleteMany({ where: { userId: user.userId, provider: PROVIDER } });
    await this.audit.log(user, { action: 'esign.account_unlink', entityType: 'user', entityId: user.userId, data: { provider: PROVIDER } });
  }

  // ───────────── Ký số tài liệu ─────────────

  /**
   * Bắt đầu ký số một tệp PDF trong tab Tài liệu: băm (kèm khung chữ ký hiển thị) và gửi yêu cầu ký;
   * người ký xác nhận trên ứng dụng MISA eSign. Kết quả lấy qua session().
   */
  start(user: AuthUser, contractId: string, documentId: string, input: MisaSignInput) {
    return this.startOn(user, contractId, documentId, input, null);
  }

  /**
   * Ký số trong yêu cầu ký điện tử: người ký nội bộ (phương thức MISA_ESIGN) ký lên bản PDF của yêu cầu
   * (phiên bản mới nhất); MISA xác nhận xong ⇒ ghi nhận lượt ký (session()).
   */
  async startForSigner(user: AuthUser, contractId: string, input: MisaSignInput) {
    const { request, signer } = await this.signatures.digitalTarget(user, contractId);
    if (!request.signedDocumentId) throw new BadRequestException('Chưa có bản PDF để ký số – tải lại trang và thử lại');
    // Nhiều người ký số: khung chữ ký xếp chồng lên nhau theo thứ tự đã ký.
    const slot = await this.prisma.signer.count({ where: { requestId: request.id, method: 'MISA_ESIGN', status: 'SIGNED' } });
    return this.startOn(user, contractId, request.signedDocumentId, input, { id: signer.id, slot });
  }

  private async startOn(user: AuthUser, contractId: string, documentId: string, input: MisaSignInput, signer: { id: string; slot: number } | null) {
    const contract = await this.contracts.get(user, contractId);
    if (contract.deletedAt || contract.archivedAt) throw new BadRequestException('Hợp đồng đã lưu trữ hoặc ở thùng rác');
    const account = await this.accountOf(user);
    if (!account?.tokenEnc) throw new BadRequestException('Chưa liên kết tài khoản MISA eSign – hãy đăng nhập MISA eSign');
    if (!account.certAlias) throw new BadRequestException('Chưa chọn chứng thư số MISA eSign');
    if (!account.externalUserId) throw new BadRequestException('Thiếu mã người dùng MISA eSign – hãy đăng nhập lại');
    const { doc, buffer } = await this.documents.readBuffer(user, contractId, documentId);
    if (doc.mimeType !== 'application/pdf') throw new BadRequestException('Chỉ ký số được tệp PDF – hãy tạo/tải lên bản PDF của hợp đồng');

    const client = await this.client(user.tenantId);
    const cert = (await this.certificatesWith(user, client)).find((c) => c.keyAlias === account.certAlias);
    if (!cert || cert.keyStatus.toUpperCase() !== 'ACTIVE') throw new BadRequestException('Chứng thư số đã chọn không còn hoạt động – chọn lại chứng thư');

    const pages = pdfPageCount(buffer);
    const page = Math.min(input.page ?? pages, pages);
    const box: MisaSignatureBox = {
      page,
      // Tọa độ PDF tính từ góc dưới trái trang (A4 = 595 × 842 pt).
      positionX: input.position === 'BOTTOM_LEFT' ? 40 : 375,
      positionY: 40 + (signer?.slot ?? 0) * 70,
      width: 180,
      height: 60,
      signedBy: account.certSubject ?? account.displayName ?? user.fullName,
      reason: input.reason || `Ký hợp đồng ${contract.code}`,
      location: input.location || 'Việt Nam',
      contact: user.email ?? account.username,
    };
    const docKey = randomUUID();
    const hash = await this.wrap(() => client.hashPdf(cert, docKey, buffer.toString('base64'), box, `SAHA_${Date.now()}`));
    const transactionId = await this.withToken(user, client, (t) =>
      client.signHash(t, {
        userId: account.externalUserId!,
        certAlias: cert.keyAlias,
        documentId: hash.documentId,
        digest: hash.digest,
        documentName: doc.fileName,
        display: `Ký số ${contract.code} – ${doc.fileName}`,
      }),
    );
    const data: HashData = { hash, cert: { certificate: cert.certificate, certificateChain: cert.certificateChain }, fileName: doc.fileName, sourceVersion: doc.version };
    const session = await this.prisma.$transaction(async (tx) => {
      const s = await tx.esignSession.create({
        data: {
          tenantId: user.tenantId,
          contractId,
          documentId,
          userId: user.userId,
          signerId: signer?.id ?? null,
          provider: PROVIDER,
          transactionId,
          hashData: data as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + SESSION_MS),
        },
      });
      await this.audit.log(
        user,
        { action: 'contract.esign_request', entityType: 'contract', entityId: contractId, data: { code: contract.code, documentId, fileName: doc.fileName, page, certSubject: account.certSubject, transactionId, signature: signer ? true : undefined } },
        tx,
      );
      return s;
    });
    return { sessionId: session.id, expiresAt: session.expiresAt, page };
  }

  /** Trạng thái lượt ký; khi người ký đã xác nhận ⇒ gắn chữ ký và lưu PDF đã ký thành phiên bản mới (chỉ một lần). */
  async session(user: AuthUser, sessionId: string) {
    const s = await this.prisma.esignSession.findFirst({ where: { id: sessionId, tenantId: user.tenantId, userId: user.userId } });
    if (!s) throw new NotFoundException('Không tìm thấy lượt ký');
    if (s.status !== 'PENDING') return this.sessionView(s);
    if (Date.now() > s.expiresAt.getTime() + 30_000) {
      return this.sessionView(await this.prisma.esignSession.update({ where: { id: s.id }, data: { status: 'EXPIRED', error: 'Hết thời gian xác nhận trên ứng dụng MISA eSign' } }));
    }
    const client = await this.client(user.tenantId);
    const st = await this.withToken(user, client, (t) => client.status(t, s.transactionId!));
    if (st.status === 'PENDING') return this.sessionView(s);
    if (st.status === 'FAILED') {
      return this.sessionView(
        await this.prisma.esignSession.update({ where: { id: s.id }, data: { status: 'FAILED', error: st.error || 'Người ký từ chối hoặc ký không thành công' } }),
      );
    }
    // Giành quyền gắn chữ ký (tránh hai lần lưu khi trình duyệt hỏi trạng thái đồng thời).
    const claimed = await this.prisma.esignSession.updateMany({ where: { id: s.id, status: 'PENDING' }, data: { status: 'ATTACHING' } });
    if (!claimed.count) return this.sessionView(await this.prisma.esignSession.findUniqueOrThrow({ where: { id: s.id } }));
    const data = s.hashData as unknown as HashData;
    try {
      const signature = st.signatures.find((x) => x.documentId === data.hash.documentId)?.signature ?? st.signatures[0]?.signature;
      if (!signature) throw new MisaError('MISA eSign không trả về dữ liệu chữ ký');
      const cert = { keyAlias: '', keyStatus: 'ACTIVE', ...data.cert };
      const pdfB64 = await client.attach(cert, data.hash, signature);
      const contract = await this.contracts.get(user, s.contractId);
      const saved = await this.documents.storeVersion(
        user,
        contract,
        { fileName: data.fileName, mimeType: 'application/pdf', buffer: Buffer.from(pdfB64, 'base64') },
        'contract.document_esign',
        { provider: PROVIDER, sourceVersion: data.sourceVersion, transactionId: s.transactionId },
      );
      if (s.signerId) {
        // Lượt ký số trong yêu cầu ký điện tử ⇒ ghi nhận người ký đã ký (có thể hoàn tất hợp đồng).
        const account = await this.accountOf(user);
        await this.signatures.completeDigital(user, s.signerId, {
          documentId: saved.id,
          sha256: saved.sha256,
          transactionId: s.transactionId,
          certSubject: account?.certSubject ?? null,
        });
      }
      return this.sessionView(await this.prisma.esignSession.update({ where: { id: s.id }, data: { status: 'SUCCESS', resultDocumentId: saved.id } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gắn chữ ký thất bại';
      await this.prisma.esignSession.update({ where: { id: s.id }, data: { status: 'FAILED', error: msg } });
      throw e instanceof MisaError ? new BadRequestException(msg) : e;
    }
  }

  private sessionView(s: { id: string; status: string; error: string | null; expiresAt: Date; resultDocumentId: string | null }) {
    return { id: s.id, status: s.status, error: s.error, expiresAt: s.expiresAt, resultDocumentId: s.resultDocumentId };
  }
}
