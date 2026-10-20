import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { SecretBox } from '../integrations/secret-box.js';
import { MailService } from './mail.service.js';
import { SmtpSettingsService, smtpConfigSchema, smtpErrorMessage } from './smtp-settings.service.js';

const SECRET = 'x'.repeat(40);
const user = { userId: 'u1', tenantId: 't1', fullName: 'Quản trị', email: 'admin@saha.vn', permissions: new Set() } as unknown as AuthUser;

function configOf(env: Record<string, unknown>) {
  const all = { INTEGRATION_SECRET: SECRET, INTEGRATION_ALLOW_PRIVATE_HOSTS: true, SMTP_PORT: 465, MAIL_FROM: 'Hệ thống <no-reply@saha.vn>', NODE_ENV: 'test', ...env };
  return { get: (k: string) => all[k as keyof typeof all] };
}

function tenantRow(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    tenantId: 't1',
    provider: 'smtp',
    enabled: true,
    config: { host: 'smtp.gmail.com', port: 465, username: 'kd@gmail.com', fromName: 'SAHA', fromEmail: 'kd@gmail.com' },
    secretEnc: new SecretBox(SECRET).seal('abcdabcdabcdabcd'),
    lastTestedAt: null,
    lastTestOk: null,
    ...over,
  };
}

function mailWith(env: Record<string, unknown>, row: unknown) {
  const prisma = { tenantIntegration: { findUnique: vi.fn().mockResolvedValue(row) } };
  return new MailService(configOf(env) as never, prisma as never);
}

describe('MailService', () => {
  it('prefers the company SMTP config over the server one', async () => {
    const mail = mailWith({ SMTP_HOST: 'smtp.server.vn' }, tenantRow());
    const m = await mail.resolve('t1');
    expect(m?.source).toBe('tenant');
    expect(m?.from).toBe('"SAHA" <kd@gmail.com>');
    const opts = (m!.transporter as unknown as { options: Record<string, unknown> }).options;
    expect(opts).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'kd@gmail.com', pass: 'abcdabcdabcdabcd' } });
  });

  it('falls back to the server SMTP when the company config is disabled', async () => {
    const mail = mailWith({ SMTP_HOST: 'smtp.server.vn' }, tenantRow({ enabled: false }));
    expect((await mail.resolve('t1'))?.source).toBe('server');
    expect((await mail.resolve('t1', { includeDisabled: true }))?.source).toBe('tenant');
  });

  it('treats a .invalid server host as not configured', async () => {
    const mail = mailWith({ SMTP_HOST: 'smtp.chua-cau-hinh.invalid' }, null);
    expect(mail.hasServerSmtp).toBe(false);
    expect(await mail.isEnabled('t1')).toBe(false);
    expect(await mail.resolve('t1')).toBeNull();
  });

  it('is enabled per company once that company saves a config', async () => {
    expect(await mailWith({}, tenantRow()).isEnabled('t1')).toBe(true);
    expect(await mailWith({}, tenantRow({ enabled: false })).isEnabled('t1')).toBe(false);
  });

  it('refuses to send without any SMTP in production instead of logging the email (OTP)', async () => {
    const mail = mailWith({ NODE_ENV: 'production', SMTP_HOST: 'smtp.chua-cau-hinh.invalid' }, null);
    await expect(mail.send('t1', { to: 'a@b.vn', subject: 's', text: 'OTP 123456' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only logs the email outside production when nothing is configured', async () => {
    const mail = mailWith({}, null);
    await expect(mail.send('t1', { to: 'a@b.vn', subject: 's', text: 't' })).resolves.toBeUndefined();
  });
});

describe('smtpConfigSchema', () => {
  const base = { host: 'SMTP.Gmail.com ', port: '465', username: 'kd@gmail.com', password: 'abcd efgh ijkl mnop', fromName: 'SAHA', fromEmail: 'kd@gmail.com' };

  it('normalises host and strips spaces from Gmail app passwords', () => {
    expect(smtpConfigSchema.parse(base)).toMatchObject({ host: 'smtp.gmail.com', port: 465, password: 'abcdefghijklmnop', enabled: true });
  });

  it('keeps the saved password when left blank', () => {
    expect(smtpConfigSchema.parse({ ...base, password: '' }).password).toBeUndefined();
  });

  it('rejects unusual ports, URLs as host and header injection in the sender name', () => {
    expect(smtpConfigSchema.safeParse({ ...base, port: 5432 }).success).toBe(false);
    expect(smtpConfigSchema.safeParse({ ...base, host: 'smtp://x.vn' }).success).toBe(false);
    expect(smtpConfigSchema.safeParse({ ...base, fromName: 'A <evil@x.vn>' }).success).toBe(false);
  });

  it('refuses a password or Gmail without an SMTP account instead of dropping the password', () => {
    const r = smtpConfigSchema.safeParse({ ...base, username: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ['username'], message: expect.stringContaining('Tài khoản SMTP') });
    expect(smtpConfigSchema.safeParse({ ...base, username: '', password: '' }).success).toBe(false);
    // Relay nội bộ không đăng nhập: không tài khoản, không mật khẩu ⇒ hợp lệ.
    expect(smtpConfigSchema.safeParse({ ...base, host: 'relay.congty.vn', port: 25, username: '', password: '' }).success).toBe(true);
  });
});

describe('SmtpSettingsService', () => {
  function setup(row: unknown) {
    const tx = { tenantIntegration: { upsert: vi.fn(), delete: vi.fn() } };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      tenantIntegration: { update: vi.fn() },
      tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'Công ty SAHA' }) },
    };
    const audit = { log: vi.fn() };
    const mail = { findTenantConfig: vi.fn().mockResolvedValue(row), hasServerSmtp: false, resolve: vi.fn() };
    const svc = new SmtpSettingsService(prisma as never, audit as never, configOf({}) as never, mail as never);
    return { svc, tx, prisma, audit, mail };
  }
  const input = smtpConfigSchema.parse({ host: 'smtp.gmail.com', port: 465, username: 'kd@gmail.com', fromName: 'SAHA', fromEmail: 'kd@gmail.com' });

  it('requires a password the first time an account is set', async () => {
    await expect(setup(null).svc.saveConfig(user, input)).rejects.toThrow('Nhập mật khẩu SMTP');
  });

  it('encrypts the password, keeps it out of the audit log and never returns it', async () => {
    const { svc, tx, audit, mail } = setup(null);
    mail.findTenantConfig.mockResolvedValueOnce(null).mockResolvedValue(tenantRow());
    const r = await svc.saveConfig(user, { ...input, password: 'abcdabcdabcdabcd' });
    const saved = tx.tenantIntegration.upsert.mock.calls[0][0].create;
    expect(saved.secretEnc).not.toContain('abcdabcdabcdabcd');
    expect(new SecretBox(SECRET).open(saved.secretEnc)).toBe('abcdabcdabcdabcd');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('abcdabcdabcdabcd');
    expect(audit.log.mock.calls[0][1]).toMatchObject({ action: 'integration.smtp_config', data: { passwordChanged: true } });
    expect(JSON.stringify(r)).not.toContain('secretEnc');
    expect(r).toMatchObject({ configured: true, hasPassword: true });
  });

  it('sends the test email and records the result', async () => {
    const { svc, mail, prisma } = setup(tenantRow());
    const transporter = { verify: vi.fn(), sendMail: vi.fn() };
    mail.resolve.mockResolvedValue({ transporter, from: '"SAHA" <kd@gmail.com>', source: 'tenant' });
    const r = await svc.test(user, {});
    expect(r).toEqual({ ok: true, to: 'admin@saha.vn', source: 'tenant' });
    expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@saha.vn', from: '"SAHA" <kd@gmail.com>' }));
    expect(prisma.tenantIntegration.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastTestOk: true }) }));
  });

  it('explains a wrong Gmail password in Vietnamese', async () => {
    const { svc, mail } = setup(tenantRow());
    const err = Object.assign(new Error('Invalid login: 535-5.7.8'), { code: 'EAUTH', responseCode: 535 });
    mail.resolve.mockResolvedValue({ transporter: { verify: vi.fn().mockRejectedValue(err), sendMail: vi.fn() }, from: 'x', source: 'tenant' });
    const r = await svc.test(user, { to: 'kh@x.vn' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Mật khẩu ứng dụng');
    expect(smtpErrorMessage(err)).toContain('Sai tài khoản hoặc mật khẩu SMTP');
    expect(smtpErrorMessage(Object.assign(new Error('530-5.7.0 Authentication Required'), { responseCode: 530 }))).toContain('yêu cầu đăng nhập');
  });
});
