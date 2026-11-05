import { BadRequestException } from '@nestjs/common';
import { quoteDisplayStatus } from '@saha/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { quoteCreateSchema } from './quotes.schemas.js';
import { QuotesService } from './quotes.service.js';

const user = { userId: 'u1', tenantId: 't1' } as AuthUser;
const pdf = { buffer: Buffer.from('%PDF-1.7 x'), originalname: 'bao-gia.pdf' } as Express.Multer.File;
const emailInput = { to: 'kt@kh.vn', subject: 'S', message: 'M' };
const input = {
  date: '2026-11-05',
  customerName: 'Công ty A',
  vatRate: '8',
  items: [{ name: 'Keo', quantity: '2.5', unitPrice: '100000' }],
};

describe('QuotesService', () => {
  let row: Record<string, unknown>;
  const update = vi.fn(async ({ data }) => ({ ...row, ...data }));
  const create = vi.fn(async ({ data }) => ({ id: 'q1', ...data }));
  const findLast = vi.fn();
  const tx = { quote: { create, update, findFirst: findLast }, quoteItem: { deleteMany: vi.fn() } };
  const prisma = {
    quote: { findFirst: vi.fn(async () => row), update },
    partner: { count: vi.fn(async () => 1) },
    product: { count: vi.fn(async () => 1) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const audit = { log: vi.fn() };
  const contracts = { get: vi.fn() };
  const mail = { send: vi.fn() };
  const service = new QuotesService(prisma as never, audit as never, contracts as never, mail as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mail.send.mockResolvedValue(undefined);
    findLast.mockResolvedValue(null);
    prisma.partner.count.mockResolvedValue(1);
    row = { id: 'q1', code: 'BG-2026-0001', status: 'DRAFT', sentAt: null, decidedAt: null, orderId: null, order: null, vatRate: null, items: [] };
  });

  it('tự sinh số theo năm và tính tiền phía máy chủ', async () => {
    findLast.mockResolvedValue({ code: 'BG-2026-0007' });
    await service.create(user, quoteCreateSchema.parse(input));
    const data = create.mock.calls[0][0].data;
    expect(data.code).toBe('BG-2026-0008');
    expect(data).toMatchObject({ subtotal: '250000.00', vatAmount: '20000.00', total: '270000.00', tenantId: 't1', createdById: 'u1' });
    expect(data.items.create[0].amount).toBe('250000.00');
    expect(audit.log).toHaveBeenCalledOnce();
  });

  it('từ chối đối tác của doanh nghiệp khác', async () => {
    prisma.partner.count.mockResolvedValue(0);
    await expect(service.create(user, quoteCreateSchema.parse({ ...input, partnerId: '7b2e0fef-4226-45c1-8e4c-4f5e65116771' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('báo giá phải có dòng hàng', () => {
    expect(quoteCreateSchema.safeParse({ ...input, items: [] }).success).toBe(false);
  });

  it('không sửa báo giá đã có quyết định', async () => {
    row.status = 'ACCEPTED';
    await expect(service.update(user, 'q1', { note: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('email lỗi thì giữ nguyên trạng thái; gửi được mới chuyển Đã gửi', async () => {
    mail.send.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.sendEmail(user, 'q1', emailInput, pdf)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    await service.sendEmail(user, 'q1', emailInput, pdf);
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'SENT', sentMethod: 'EMAIL', sentTo: 'kt@kh.vn' });
  });

  it('mở lại: về Đã gửi nếu đã gửi, ngược lại về Nháp', async () => {
    row = { ...row, status: 'REJECTED', sentAt: new Date() };
    await service.decide(user, 'q1', { decision: 'REOPEN' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'SENT', decidedAt: null });
    update.mockClear();
    row = { ...row, sentAt: null };
    await service.decide(user, 'q1', { decision: 'REOPEN' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'DRAFT' });
  });

  it('gắn đơn: chỉ đơn đặt hàng, chuyển Khách đồng ý, không đổi quyết định sau đó', async () => {
    contracts.get.mockResolvedValueOnce({ id: 'c1', code: 'HD-1', kind: 'CONTRACT' });
    await expect(service.linkOrder(user, 'q1', { orderId: 'c1' })).rejects.toBeInstanceOf(BadRequestException);
    contracts.get.mockResolvedValueOnce({ id: 'o1', code: 'DH-1', kind: 'ORDER' });
    await service.linkOrder(user, 'q1', { orderId: 'o1' });
    expect(update.mock.calls[0][0].data).toMatchObject({ orderId: 'o1', status: 'ACCEPTED' });
    row = { ...row, orderId: 'o1', order: { code: 'DH-1' } };
    await expect(service.decide(user, 'q1', { decision: 'REOPEN' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hết hạn suy ra từ ngày hiệu lực, chỉ khi chưa có quyết định', () => {
    expect(quoteDisplayStatus('SENT', '2026-11-04', '2026-11-05')).toBe('EXPIRED');
    expect(quoteDisplayStatus('SENT', '2026-11-05', '2026-11-05')).toBe('SENT');
    expect(quoteDisplayStatus('ACCEPTED', '2026-11-04', '2026-11-05')).toBe('ACCEPTED');
    expect(quoteDisplayStatus('DRAFT', null, '2026-11-05')).toBe('DRAFT');
  });
});
