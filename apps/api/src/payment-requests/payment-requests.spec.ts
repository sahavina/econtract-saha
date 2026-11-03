import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { PaymentRequestsService } from './payment-requests.service.js';

const user = { userId: 'u1', tenantId: 't1' } as AuthUser;
const pdf = { buffer: Buffer.from('%PDF-1.7 x'), originalname: 'de-nghi.pdf' } as Express.Multer.File;
const emailInput = { to: 'kt@kh.vn', subject: 'S', message: 'M' };

describe('PaymentRequestsService – gửi và thanh toán', () => {
  let row: Record<string, unknown>;
  const update = vi.fn(async ({ data }) => ({ ...row, ...data }));
  const prisma = {
    paymentRequest: { findFirst: vi.fn(async () => row), update },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ paymentRequest: { update } })),
  };
  const audit = { log: vi.fn() };
  const mail = { send: vi.fn() };
  const service = new PaymentRequestsService(prisma as never, audit as never, {} as never, mail as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mail.send.mockResolvedValue(undefined);
    row = { id: 'p1', number: 'DN-1', status: 'DRAFT', sentAt: null, paidAt: null, contractId: null, templateId: null };
  });

  it('đánh dấu đã gửi ghi người gửi, cách gửi, ghi chú', async () => {
    await service.markSent(user, 'p1', { method: 'ZALO', note: 'chị Thủy' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'SENT', sentById: 'u1', sentMethod: 'ZALO', sentNote: 'chị Thủy', sentTo: null });
    expect(audit.log).toHaveBeenCalledOnce();
  });

  it('không gửi đề nghị đã hủy hoặc đã thanh toán', async () => {
    row.status = 'CANCELLED';
    await expect(service.markSent(user, 'p1', { method: 'ZALO' })).rejects.toBeInstanceOf(BadRequestException);
    row.status = 'PAID';
    await expect(service.sendEmail(user, 'p1', emailInput, pdf)).rejects.toBeInstanceOf(BadRequestException);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('gửi email kèm PDF rồi mới chuyển sang Đã gửi', async () => {
    await service.sendEmail(user, 'p1', emailInput, pdf);
    expect(mail.send).toHaveBeenCalledWith('t1', expect.objectContaining({ to: 'kt@kh.vn', attachments: [expect.objectContaining({ filename: 'de-nghi.pdf', contentType: 'application/pdf' })] }));
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'SENT', sentMethod: 'EMAIL', sentTo: 'kt@kh.vn' });
  });

  it('email lỗi thì giữ nguyên trạng thái', async () => {
    mail.send.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.sendEmail(user, 'p1', emailInput, pdf)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('từ chối tệp không phải PDF', async () => {
    const fake = { buffer: Buffer.from('MZ...'), originalname: 'x.pdf' } as Express.Multer.File;
    await expect(service.sendEmail(user, 'p1', emailInput, fake)).rejects.toBeInstanceOf(BadRequestException);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('đánh dấu thanh toán theo ngày đã chọn; trả về Chưa gửi thì xóa thông tin gửi', async () => {
    await service.markPaid(user, 'p1', { date: '2026-11-03' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'PAID', paidAt: new Date('2026-11-03'), paidById: 'u1' });
    update.mockClear();
    row.status = 'SENT';
    await service.update(user, 'p1', { status: 'DRAFT' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'DRAFT', sentAt: null, sentMethod: null, paidAt: null });
  });
});
