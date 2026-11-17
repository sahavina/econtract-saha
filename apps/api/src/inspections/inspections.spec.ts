import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { inspectionCreateSchema, inspectionUpdateSchema } from './inspections.schemas.js';
import { InspectionsService, mergeItemResults } from './inspections.service.js';

const A = '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b';
const B = '7f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b';
const I1 = '8f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a21';
const I2 = '8f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a22';
const staff = (id: string, manage = false) =>
  ({ userId: id, tenantId: 't1', fullName: 'NV', permissions: new Set(manage ? ['inspection.manage'] : ['inspection.create']) }) as unknown as AuthUser;

describe('mergeItemResults – kết quả từng dòng hàng', () => {
  it('chỉ giữ dòng thuộc hồ sơ, dòng gửi sau ghi đè, giữ thứ tự dòng hàng', () => {
    const r = mergeItemResults([I1, I2], [{ itemId: I2, ok: true }], [{ itemId: I1, ok: false, note: '  móp vỏ ' }, { itemId: 'x', ok: true }, { itemId: I2, ok: null }]);
    expect(r).toEqual([
      { itemId: I1, ok: false, note: 'móp vỏ' },
      { itemId: I2, ok: null, note: null },
    ]);
  });
});

describe('inspection schemas', () => {
  it('bắt buộc người phụ trách và nội dung; cập nhật không áp mặc định', () => {
    expect(inspectionCreateSchema.safeParse({ contractId: A, assigneeId: B, content: '' }).success).toBe(false);
    expect(inspectionCreateSchema.parse({ contractId: A, assigneeId: B, content: 'Kiểm hàng', dueDate: '' }).dueDate).toBeNull();
    expect(inspectionUpdateSchema.parse({})).toEqual({});
  });
});

describe('InspectionsService', () => {
  let row: Record<string, unknown>;
  const tx = {
    inspectionRequest: { create: vi.fn(async ({ data }) => ({ id: 'r1', ...data })), update: vi.fn(async ({ data }) => ({ ...row, ...data })) },
    $queryRaw: vi.fn(async () => [{ current: 7 }]),
  };
  const prisma = {
    inspectionRequest: { findFirst: vi.fn(async (_args: { where: { AND: unknown[] } }) => row) },
    user: { count: vi.fn(async () => 1) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const audit = { log: vi.fn() };
  const contracts = { get: vi.fn(async () => ({ id: 'c1', code: 'HD-1', deletedAt: null })), scopeWhere: vi.fn(() => ({ SCOPE: true })) };
  const notifications = { notify: vi.fn() };
  const service = new InspectionsService(prisma as never, audit as never, contracts as never, notifications as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.count.mockResolvedValue(1);
    row = {
      id: 'r1',
      code: 'KT-2026-0001',
      status: 'PENDING',
      assigneeId: B,
      requestedById: A,
      contractId: 'c1',
      result: null,
      itemResults: [],
      contract: { code: 'HD-1', items: [{ id: I1 }, { id: I2 }] },
    };
  });

  it('tạo: kiểm tra quyền xem hồ sơ, sinh số theo năm, báo người phụ trách', async () => {
    await service.create(staff(A), inspectionCreateSchema.parse({ contractId: A, assigneeId: B, content: 'Kiểm hàng trước giao' }));
    expect(contracts.get).toHaveBeenCalledWith(expect.objectContaining({ userId: A }), A);
    const data = tx.inspectionRequest.create.mock.calls[0][0].data;
    expect(data.code).toMatch(/^KT-\d{4}-0007$/);
    expect(data).toMatchObject({ tenantId: 't1', assigneeId: B, requestedById: A });
    expect(notifications.notify).toHaveBeenCalledWith('t1', [B], expect.objectContaining({ type: 'inspection.assigned', link: '/inspections/r1' }), tx);
    expect(audit.log).toHaveBeenCalledOnce();
  });

  it('từ chối người phụ trách không thuộc doanh nghiệp', async () => {
    prisma.user.count.mockResolvedValue(0);
    await expect(service.create(staff(A), inspectionCreateSchema.parse({ contractId: A, assigneeId: B, content: 'x' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.inspectionRequest.create).not.toHaveBeenCalled();
  });

  it('chỉ người phụ trách hoặc quản lý mới xử lý', async () => {
    await expect(service.start(staff(A), 'r1')).rejects.toBeInstanceOf(ForbiddenException);
    await service.start(staff(B), 'r1');
    expect(tx.inspectionRequest.update.mock.calls[0][0].data.status).toBe('IN_PROGRESS');
    await service.saveResult(staff('manager', true), 'r1', { result: 'ok' });
  });

  it('không kết thúc "Đạt" khi còn dòng không đạt; kết thúc thì báo người gửi', async () => {
    await expect(service.saveResult(staff(B), 'r1', { itemResults: [{ itemId: I1, ok: false }], finish: 'DONE' })).rejects.toThrow('không đạt');
    await service.saveResult(staff(B), 'r1', { itemResults: [{ itemId: I1, ok: false, note: 'móp' }], finish: 'ISSUE' });
    const data = tx.inspectionRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('ISSUE');
    expect(data.itemResults).toEqual([{ itemId: I1, ok: false, note: 'móp' }]);
    expect(notifications.notify).toHaveBeenCalledWith('t1', [A], expect.objectContaining({ type: 'inspection.finished' }), tx);
  });

  it('báo "Có vấn đề" phải ghi rõ vấn đề', async () => {
    await expect(service.saveResult(staff(B), 'r1', { finish: 'ISSUE' })).rejects.toThrow('Ghi rõ vấn đề');
  });

  it('người không phải người gửi/quản lý không hủy được; yêu cầu đã xong không hủy', async () => {
    await expect(service.cancel(staff(B), 'r1')).rejects.toBeInstanceOf(ForbiddenException);
    row.status = 'DONE';
    await expect(service.cancel(staff(A), 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ghi nhận đã in: thời điểm, người in, tăng số lần in, ghi nhật ký', async () => {
    tx.inspectionRequest.update.mockResolvedValueOnce({ id: 'r1', printedAt: new Date(), printCount: 2 } as never);
    const r = await service.markPrinted(staff(A), 'r1');
    expect(tx.inspectionRequest.update.mock.calls[0][0].data).toMatchObject({ printedById: A, printCount: { increment: 1 } });
    expect(r.printCount).toBe(2);
    expect(audit.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'inspection.print' }), tx);
  });

  it('người không có quyền quản lý chỉ thấy việc của mình, mình gửi hoặc của hồ sơ mình xem được', async () => {
    await service.get(staff(A), 'r1');
    expect(prisma.inspectionRequest.findFirst.mock.calls[0][0].where.AND[0]).toEqual({ tenantId: 't1', OR: [{ assigneeId: A }, { requestedById: A }, { contract: { SCOPE: true } }] });
    await service.get(staff('m', true), 'r1');
    expect(prisma.inspectionRequest.findFirst.mock.calls[1][0].where.AND[0]).toEqual({ tenantId: 't1' });
  });
});
