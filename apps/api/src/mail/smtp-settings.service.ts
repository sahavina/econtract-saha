import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { SecretBox } from '../integrations/secret-box.js';
import { assertPublicHost } from '../integrations/url-guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService, SMTP_PROVIDER, type StoredSmtpConfig } from './mail.service.js';

const SMTP_PORTS = [25, 465, 587, 2525];
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const smtpConfigSchema = z
  .object({
    host: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Nhập máy chủ SMTP')
      .max(253)
      .regex(/^[a-z0-9.-]+$/, 'Máy chủ SMTP chỉ gồm tên miền hoặc địa chỉ IP, ví dụ smtp.gmail.com'),
    port: z.coerce
      .number('Cổng SMTP không hợp lệ')
      .int('Cổng SMTP không hợp lệ')
      .refine((p) => SMTP_PORTS.includes(p), 'Cổng SMTP phải là 465, 587, 25 hoặc 2525'),
    username: z.string().trim().max(200),
    /** Bỏ trống khi sửa ⇒ giữ mật khẩu đã lưu. */
    password: z.preprocess(blankToUndefined, z.string().max(500).optional()),
    fromName: z
      .string()
      .trim()
      .min(1, 'Nhập tên người gửi')
      .max(100)
      .refine((v) => !/[<>"\r\n]/.test(v), 'Tên người gửi không được chứa ký tự < > "'),
    fromEmail: z.string().trim().email('Email người gửi không hợp lệ').max(200),
    enabled: z.boolean().default(true),
  })
  // Gmail hiển thị mật khẩu ứng dụng thành 4 nhóm có dấu cách – bỏ dấu cách.
  .transform((v) => (v.host === 'smtp.gmail.com' && v.password ? { ...v, password: v.password.replace(/\s+/g, '') } : v));
export type SmtpConfigInput = z.infer<typeof smtpConfigSchema>;

export const smtpTestSchema = z.object({
  to: z.preprocess(blankToUndefined, z.string().trim().email('Email nhận không hợp lệ').max(200).optional()),
});
export type SmtpTestInput = z.infer<typeof smtpTestSchema>;

/** Cấu hình SMTP riêng của doanh nghiệp (Cấu hình → Email). Mật khẩu chỉ gửi lên, không bao giờ trả về. */
@Injectable()
export class SmtpSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
  ) {}

  private box() {
    const secret = this.config.get('INTEGRATION_SECRET', { infer: true });
    if (!secret) throw new BadRequestException('Máy chủ chưa cấu hình INTEGRATION_SECRET – liên hệ quản trị hệ thống');
    return new SecretBox(secret);
  }

  async getConfig(user: AuthUser) {
    const row = await this.mail.findTenantConfig(user.tenantId);
    const serverFallback = this.mail.hasServerSmtp;
    if (!row) return { configured: false as const, serverFallback };
    const c = row.config as unknown as StoredSmtpConfig;
    return {
      configured: true as const,
      serverFallback,
      enabled: row.enabled,
      host: c.host,
      port: c.port,
      username: c.username,
      fromName: c.fromName,
      fromEmail: c.fromEmail,
      hasPassword: !!row.secretEnc,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
    };
  }

  async saveConfig(user: AuthUser, input: SmtpConfigInput) {
    try {
      await assertPublicHost(input.host, this.config.get('INTEGRATION_ALLOW_PRIVATE_HOSTS', { infer: true }));
    } catch (e) {
      throw new BadRequestException(`Máy chủ SMTP: ${e instanceof Error ? e.message : 'không hợp lệ'}`);
    }
    const existing = await this.mail.findTenantConfig(user.tenantId);
    if (input.username && !input.password && !existing?.secretEnc) throw new BadRequestException('Nhập mật khẩu SMTP');
    const config: StoredSmtpConfig = {
      host: input.host,
      port: input.port,
      username: input.username,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    };
    // Không có tài khoản ⇒ máy chủ SMTP không yêu cầu đăng nhập, bỏ mật khẩu cũ.
    const secretEnc = !input.username ? null : input.password ? this.box().seal(input.password) : existing!.secretEnc;
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantIntegration.upsert({
        where: { tenantId_provider: { tenantId: user.tenantId, provider: SMTP_PROVIDER } },
        create: { tenantId: user.tenantId, provider: SMTP_PROVIDER, enabled: input.enabled, config: { ...config }, secretEnc },
        update: { enabled: input.enabled, config: { ...config }, secretEnc, lastTestedAt: null, lastTestOk: null },
      });
      await this.audit.log(
        user,
        {
          action: 'integration.smtp_config',
          entityType: 'integration',
          entityId: SMTP_PROVIDER,
          data: { ...config, passwordChanged: !!input.password, enabled: input.enabled },
        },
        tx,
      );
    });
    return this.getConfig(user);
  }

  async removeConfig(user: AuthUser) {
    const row = await this.mail.findTenantConfig(user.tenantId);
    if (!row) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantIntegration.delete({ where: { id: row.id } });
      await this.audit.log(user, { action: 'integration.smtp_remove', entityType: 'integration', entityId: SMTP_PROVIDER }, tx);
    });
  }

  /** Gửi một email thử bằng cấu hình đang áp dụng (kể cả cấu hình riêng đang tắt) tới địa chỉ chỉ định. */
  async test(user: AuthUser, input: SmtpTestInput) {
    const to = input.to ?? user.email;
    const mailer = await this.mail.resolve(user.tenantId, { includeDisabled: true });
    if (!mailer) throw new BadRequestException('Chưa cấu hình máy chủ gửi email – nhập và lưu cấu hình trước');
    const row = mailer.source === 'tenant' ? await this.mail.findTenantConfig(user.tenantId) : null;
    const org = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { name: true } });
    let result: { ok: boolean; to: string; source: 'tenant' | 'server'; error?: string };
    try {
      await mailer.transporter.verify();
      await mailer.transporter.sendMail({
        from: mailer.from,
        to,
        subject: '[SAHA eContract] Email thử cấu hình gửi thư',
        text: [
          `Đây là email thử do ${user.fullName} gửi từ Cấu hình → Email của ${org.name}.`,
          'Nhận được email này nghĩa là hệ thống đã gửi được thư mời ký, mã OTP và link xem trước hợp đồng.',
        ].join('\n'),
      });
      result = { ok: true, to, source: mailer.source };
    } catch (e) {
      result = { ok: false, to, source: mailer.source, error: smtpErrorMessage(e) };
    }
    if (row) {
      await this.prisma.tenantIntegration.update({
        where: { id: row.id },
        data: { lastTestedAt: new Date(), lastTestOk: result.ok },
      });
    }
    return result;
  }
}

/** Lỗi SMTP thường gặp ⇒ thông báo tiếng Việt dễ hiểu (giữ thông điệp gốc để tra cứu). */
export function smtpErrorMessage(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const raw = err?.message ?? 'Lỗi không xác định';
  if (err?.code === 'EAUTH' || err?.responseCode === 535)
    return `Sai tài khoản hoặc mật khẩu SMTP (với Gmail phải dùng Mật khẩu ứng dụng 16 ký tự). Chi tiết: ${raw}`;
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNECTION' || err?.code === 'ESOCKET')
    return `Không kết nối được máy chủ SMTP (kiểm tra máy chủ, cổng 465/587). Chi tiết: ${raw}`;
  if (err?.code === 'EDNS') return `Không tìm thấy máy chủ SMTP. Chi tiết: ${raw}`;
  return raw;
}
