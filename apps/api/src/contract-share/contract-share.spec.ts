import { ConflictException, GoneException, HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { createShareLinkSchema, submitFeedbackSchema } from './contract-share.schemas.js';
import {
  buildPreview,
  ContractShareService,
  FEEDBACK_MIN_INTERVAL_MS,
  FEEDBACK_PER_LINK_PER_DAY,
  linkState,
  type PreviewSource,
} from './contract-share.service.js';

const TOKEN = 'a'.repeat(43);
const party = (role: string, name: string) => ({
  role,
  name,
  isInternal: role === 'PARTY_B',
  entityType: 'ORGANIZATION',
  taxCode: null,
  address: null,
  email: null,
  phone: null,
  representative: null,
  position: null,
  authorizationRef: null,
  bankAccount: null,
});
const source = (over: Partial<PreviewSource> = {}): PreviewSource => ({
  code: 'HD-2026-00001',
  title: 'HĐMB keo',
  status: 'DRAFT',
  value: { toString: () => '26400000' },
  currency: 'VND',
  vatRate: null,
  expectedSignDate: null,
  effectiveDate: null,
  expiryDate: null,
  contentHtml: '<p>Bên A: {{party_a.name}} – MST {{party_a.tax_code}} – {{la.bien}}</p>',
  contractType: { name: 'Hợp đồng mua bán' },
  parties: [party('PARTY_A', 'Thuận Nhật'), party('PARTY_B', 'SAHA')],
  ...over,
});

describe('buildPreview', () => {
  it('fills variables and hides unfilled/unknown ones behind a blank', () => {
    const p = buildPreview(source(), 3);
    expect(p.contentHtml).toBe('<p>Bên A: Thuận Nhật – MST …… – ……</p>');
    expect(p.contract).toMatchObject({ code: 'HD-2026-00001', value: '26400000', contractType: 'Hợp đồng mua bán' });
    expect(p.version.seq).toBe(3);
    expect(p.version.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the hash whenever what the customer sees changes, not otherwise', () => {
    const h = buildPreview(source(), 1).version.hash;
    expect(buildPreview(source(), 2).version.hash).toBe(h);
    expect(buildPreview(source({ contentHtml: '<p>Khác</p>' }), 1).version.hash).not.toBe(h);
    expect(buildPreview(source({ value: { toString: () => '1' } }), 1).version.hash).not.toBe(h);
    expect(buildPreview(source({ parties: [party('PARTY_A', 'Đổi tên')] }), 1).version.hash).not.toBe(h);
  });
});

describe('linkState', () => {
  const now = new Date('2026-10-19T00:00:00Z');
  it('reports revoked, expired and active links', () => {
    expect(linkState({ revokedAt: now, expiresAt: new Date('2027-01-01') }, now)).toBe('REVOKED');
    expect(linkState({ revokedAt: null, expiresAt: now }, now)).toBe('EXPIRED');
    expect(linkState({ revokedAt: null, expiresAt: new Date('2026-10-20') }, now)).toBe('ACTIVE');
  });
});

describe('schemas', () => {
  const fb = { kind: 'CHANGE_REQUEST', name: 'Nguyễn Văn A', contact: 'a@kh.vn', message: 'Sửa điều 3', revisionSeq: 2, contentHash: 'f'.repeat(64) };
  it('validates customer feedback: contact, message length, change request needs a message', () => {
    expect(submitFeedbackSchema.safeParse(fb).success).toBe(true);
    expect(submitFeedbackSchema.safeParse({ ...fb, contact: '0903 123 456' }).success).toBe(true);
    expect(submitFeedbackSchema.safeParse({ ...fb, contact: 'abc' }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ ...fb, message: '' }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ ...fb, message: 'x'.repeat(4001) }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ ...fb, kind: 'AGREE', message: '' }).success).toBe(true);
    expect(submitFeedbackSchema.safeParse({ ...fb, contentHash: 'zz' }).success).toBe(false);
  });

  it('requires a recipient email to send the link by email', () => {
    expect(createShareLinkSchema.safeParse({ sendEmail: true }).success).toBe(false);
    expect(createShareLinkSchema.parse({ sendEmail: true, recipientEmail: 'KH@x.vn' })).toMatchObject({ recipientEmail: 'kh@x.vn', expiresInDays: 14 });
    expect(createShareLinkSchema.safeParse({ expiresInDays: 91 }).success).toBe(false);
  });
});

describe('ContractShareService', () => {
  const user = { userId: 'u1', tenantId: 't1', fullName: 'Nhân viên', permissions: new Set() } as unknown as AuthUser;
  const contractRow = (over: Record<string, unknown> = {}) => ({
    ...source(),
    id: 'c1',
    tenantId: 't1',
    ownerId: 'u-owner',
    createdById: 'u-creator',
    deletedAt: null,
    archivedAt: null,
    ...over,
  });

  function setup(opts: { link?: Record<string, unknown>; contract?: Record<string, unknown>; recent?: unknown[]; seq?: number | null; mail?: boolean } = {}) {
    const contract = contractRow(opts.contract);
    const link = {
      id: 'l1',
      tenantId: 't1',
      contractId: 'c1',
      recipientName: 'Anh B',
      createdById: 'u-link',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastViewedAt: null,
      contract,
      ...opts.link,
    };
    const tx = {
      contractShareLink: { create: vi.fn(async ({ data }) => ({ ...data, id: 'l-new' })), update: vi.fn() },
      contractFeedback: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'f1' })) },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      contractShareLink: { findUnique: vi.fn(async () => link) },
      contractFeedback: { findMany: vi.fn(async () => opts.recent ?? []) },
      contractRevision: { findFirst: vi.fn(async () => (opts.seq === null ? null : { seq: opts.seq ?? 2 })) },
      tenant: { findUniqueOrThrow: vi.fn(async () => ({ name: 'SAHA' })) },
    };
    const contracts = { get: vi.fn(async () => contract) };
    const audit = { log: vi.fn(), logExternal: vi.fn() };
    const mail = { isEnabled: vi.fn().mockResolvedValue(opts.mail ?? false), send: vi.fn() };
    const notifications = { notify: vi.fn() };
    const config = { get: () => 'https://hopdong.example.vn/' };
    const svc = new ContractShareService(prisma as never, contracts as never, audit as never, mail as never, notifications as never, config as never);
    return { svc, prisma, tx, audit, mail, notifications, contract };
  }
  const current = () => buildPreview(contractRow(), 2).version;
  const input = (over: Record<string, unknown> = {}) =>
    ({ kind: 'CHANGE_REQUEST', name: 'Anh B', contact: 'b@kh.vn', clauseRef: 'Điều 3', message: 'Đổi hạn thanh toán', revisionSeq: 2, contentHash: current().hash, ...over }) as never;

  it('creates a link storing only the token hash and returns the URL once', async () => {
    const { svc, tx, audit, mail } = setup({ mail: false });
    const r = await svc.createLink(user, 'c1', { expiresInDays: 7, sendEmail: true, recipientEmail: 'b@kh.vn' } as never);
    const token = r.url.split('/preview/')[1];
    expect(r.url).toMatch(/^https:\/\/hopdong\.example\.vn\/preview\/[A-Za-z0-9_-]{43}$/);
    expect(tx.contractShareLink.create.mock.calls[0]![0].data.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(tx.contractShareLink.create.mock.calls[0]![0])).not.toContain(token);
    expect(audit.log).toHaveBeenCalledWith(user, expect.objectContaining({ action: 'contract.preview_link_create' }), tx);
    // Không có SMTP ⇒ không gửi email, chỉ sao chép link.
    expect(r.emailed).toBe(false);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('emails the link when SMTP is configured', async () => {
    const { svc, mail } = setup({ mail: true });
    const r = await svc.createLink(user, 'c1', { expiresInDays: 7, sendEmail: true, recipientEmail: 'b@kh.vn' } as never);
    expect(r.emailed).toBe(true);
    expect(mail.send).toHaveBeenCalledWith(user.tenantId, expect.objectContaining({ to: 'b@kh.vn', text: expect.stringContaining(r.url) }));
  });

  it('still returns the link when sending the email fails', async () => {
    const { svc, mail } = setup({ mail: true });
    mail.send.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));
    const r = await svc.createLink(user, 'c1', { expiresInDays: 7, sendEmail: true, recipientEmail: 'b@kh.vn' } as never);
    expect(r).toMatchObject({ emailed: false, emailFailed: true });
    expect(r.url).toContain('/preview/');
  });

  it('refuses expired, revoked links and closed contracts', async () => {
    for (const s of [
      setup({ link: { expiresAt: new Date(Date.now() - 1) } }),
      setup({ link: { revokedAt: new Date() } }),
      setup({ contract: { deletedAt: new Date() } }),
      setup({ contract: { status: 'CANCELLED' } }),
    ]) {
      await expect(s.svc.publicView(TOKEN, {})).rejects.toBeInstanceOf(GoneException);
    }
  });

  it('public view exposes the current version and whether feedback is accepted', async () => {
    const { svc } = setup();
    const v = await svc.publicView(TOKEN, {});
    expect(v.version).toEqual(current());
    expect(v.acceptsFeedback).toBe(true);
    expect(v.organization).toBe('SAHA');
    expect((await setup({ contract: { status: 'PENDING_SIGNATURE' } }).svc.publicView(TOKEN, {})).acceptsFeedback).toBe(false);
  });

  it('records a change request with the viewed revision, audit and notifications in one transaction', async () => {
    const { svc, tx, audit, notifications } = setup();
    expect(await svc.submitFeedback(TOKEN, input(), { ip: '1.2.3.4' })).toEqual({ ok: true, id: 'f1' });
    expect(tx.contractFeedback.create.mock.calls[0]![0].data).toMatchObject({ tenantId: 't1', contractId: 'c1', linkId: 'l1', revisionSeq: 2, ip: '1.2.3.4' });
    expect(audit.logExternal).toHaveBeenCalledWith('t1', expect.anything(), expect.objectContaining({ action: 'contract.feedback_submit' }), tx);
    expect(notifications.notify).toHaveBeenCalledWith('t1', ['u-owner', 'u-creator', 'u-link'], expect.objectContaining({ link: '/contracts/c1?tab=feedback' }), tx);
  });

  it('keeps the older revision the customer saw when the contract changed meanwhile', async () => {
    const { svc, tx } = setup({ seq: 5 });
    await svc.submitFeedback(TOKEN, input({ revisionSeq: 3, contentHash: 'e'.repeat(64) }), {});
    expect(tx.contractFeedback.create.mock.calls[0]![0].data).toMatchObject({ revisionSeq: 3, contentHash: 'e'.repeat(64) });
    // Phiên bản do client gửi lớn hơn phiên bản hiện có ⇒ dùng phiên bản hiện tại.
    const s2 = setup({ seq: 5 });
    await s2.svc.submitFeedback(TOKEN, input({ revisionSeq: 99 }), {});
    expect(s2.tx.contractFeedback.create.mock.calls[0]![0].data.revisionSeq).toBe(5);
  });

  it('only accepts "agree" for the current content', async () => {
    const { svc, tx } = setup();
    await expect(svc.submitFeedback(TOKEN, input({ kind: 'AGREE', message: null, contentHash: 'e'.repeat(64) }), {})).rejects.toBeInstanceOf(ConflictException);
    expect(tx.contractFeedback.create).not.toHaveBeenCalled();
    await expect(svc.submitFeedback(TOKEN, input({ kind: 'AGREE', message: null }), {})).resolves.toMatchObject({ ok: true });
  });

  it('limits frequency, volume and duplicates per link; ignores bot honeypot', async () => {
    const old = (ms: number, extra = {}) => ({ createdAt: new Date(Date.now() - ms), kind: 'CHANGE_REQUEST', message: 'khác', ...extra });
    await expect(setup({ recent: [old(1000)] }).svc.submitFeedback(TOKEN, input(), {})).rejects.toBeInstanceOf(HttpException);
    await expect(
      setup({ recent: Array.from({ length: FEEDBACK_PER_LINK_PER_DAY }, () => old(FEEDBACK_MIN_INTERVAL_MS * 2)) }).svc.submitFeedback(TOKEN, input(), {}),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      setup({ recent: [old(FEEDBACK_MIN_INTERVAL_MS * 2, { message: 'Đổi hạn thanh toán' })] }).svc.submitFeedback(TOKEN, input(), {}),
    ).rejects.toBeInstanceOf(ConflictException);
    const bot = setup();
    await expect(bot.svc.submitFeedback(TOKEN, input({ website: 'http://spam' }), {})).resolves.toEqual({ ok: true });
    expect(bot.tx.contractFeedback.create).not.toHaveBeenCalled();
  });

  it('stops taking feedback once the contract went to signing', async () => {
    const { svc } = setup({ contract: { status: 'PENDING_SIGNATURE' } });
    await expect(svc.submitFeedback(TOKEN, input(), {})).rejects.toMatchObject({ status: 400 });
  });
});
