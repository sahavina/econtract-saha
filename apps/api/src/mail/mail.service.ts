import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';
import { SecretBox } from '../integrations/secret-box.js';
import { assertPublicHost } from '../integrations/url-guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const SMTP_PROVIDER = 'smtp';

/** Cấu hình SMTP riêng của doanh nghiệp (TenantIntegration.config); mật khẩu mã hóa ở secretEnc. */
export interface StoredSmtpConfig {
  host: string;
  port: number;
  username: string;
  fromName: string;
  fromEmail: string;
}

export interface ResolvedMailer {
  transporter: Transporter;
  from: string;
  /** tenant = Cấu hình → Email của doanh nghiệp; server = SMTP_* của máy chủ. */
  source: 'tenant' | 'server';
}

function smtpTransport(host: string, port: number, user?: string, pass?: string) {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

/**
 * Gửi email theo doanh nghiệp: ưu tiên SMTP doanh nghiệp tự cấu hình (Cấu hình → Email), không có thì dùng SMTP_* của
 * máy chủ. Chưa có cấu hình nào: ngoài production nội dung chỉ ghi ra log; production báo lỗi (không ghi OTP ra log).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly server: { transporter: Transporter; from: string } | null;
  private readonly production: boolean;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    const host = config.get('SMTP_HOST', { infer: true });
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
    // Tên miền .invalid (RFC 2606) là chỗ giữ chỗ "chưa cấu hình" ⇒ coi như máy chủ chưa có SMTP.
    this.server =
      host && !/\.invalid$/i.test(host)
        ? {
            transporter: smtpTransport(
              host,
              config.get('SMTP_PORT', { infer: true }),
              config.get('SMTP_USER', { infer: true }),
              config.get('SMTP_PASS', { infer: true }),
            ),
            from: config.get('MAIL_FROM', { infer: true }),
          }
        : null;
    if (!this.server)
      this.logger.warn(
        this.production
          ? 'Máy chủ chưa có SMTP – doanh nghiệp cần cấu hình email trong Cấu hình → Email.'
          : 'Chưa cấu hình SMTP_HOST – email chưa có cấu hình sẽ chỉ được ghi ra log (môi trường phát triển).',
      );
  }

  /** Máy chủ có SMTP chung (dùng khi doanh nghiệp chưa cấu hình riêng). */
  get hasServerSmtp(): boolean {
    return this.server !== null;
  }

  private box() {
    const secret = this.config.get('INTEGRATION_SECRET', { infer: true });
    if (!secret) throw new BadRequestException('Máy chủ chưa cấu hình INTEGRATION_SECRET – liên hệ quản trị hệ thống');
    return new SecretBox(secret);
  }

  findTenantConfig(tenantId: string) {
    return this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider: SMTP_PROVIDER } },
    });
  }

  /** Doanh nghiệp gửi được email thật (đã bật cấu hình riêng hoặc máy chủ có SMTP); false = chỉ ghi log/không gửi. */
  async isEnabled(tenantId: string): Promise<boolean> {
    if (this.server) return true;
    return (await this.findTenantConfig(tenantId))?.enabled ?? false;
  }

  /** Bộ gửi thực tế của doanh nghiệp; `includeDisabled` dùng khi gửi thử cấu hình riêng đang tắt. */
  async resolve(tenantId: string, opts: { includeDisabled?: boolean } = {}): Promise<ResolvedMailer | null> {
    const row = await this.findTenantConfig(tenantId);
    if (row && (row.enabled || opts.includeDisabled)) {
      const c = row.config as unknown as StoredSmtpConfig;
      // Kiểm tra lại mỗi lần gửi: tên miền có thể đã đổi sang trỏ vào mạng nội bộ.
      try {
        await assertPublicHost(c.host, this.config.get('INTEGRATION_ALLOW_PRIVATE_HOSTS', { infer: true }));
      } catch (e) {
        throw new BadRequestException(`Máy chủ SMTP: ${e instanceof Error ? e.message : 'không hợp lệ'}`);
      }
      let pass: string | undefined;
      if (row.secretEnc) {
        try {
          pass = this.box().open(row.secretEnc);
        } catch {
          throw new BadRequestException('Không giải mã được mật khẩu SMTP (khóa máy chủ đã đổi?) – hãy nhập lại mật khẩu');
        }
      }
      return {
        transporter: smtpTransport(c.host, c.port, c.username || undefined, pass),
        from: `"${c.fromName}" <${c.fromEmail}>`,
        source: 'tenant',
      };
    }
    return this.server && { ...this.server, source: 'server' };
  }

  async send(tenantId: string, message: MailMessage): Promise<void> {
    const mailer = await this.resolve(tenantId);
    if (!mailer) {
      if (this.production) throw new BadRequestException('Chưa cấu hình máy chủ gửi email (Cấu hình → Email)');
      this.logger.log(`[DEV EMAIL] To: ${message.to} | ${message.subject}\n${message.text}`);
      return;
    }
    await mailer.transporter.sendMail({ from: mailer.from, ...message });
  }
}
