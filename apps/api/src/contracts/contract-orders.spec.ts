import { BadRequestException } from '@nestjs/common';
import { DEFAULT_ORDER_HTML } from '@saha/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { contractCreateSchema } from './contracts.schemas.js';
import { ContractsService } from './contracts.service.js';

const user = {
  tenantId: 't1',
  userId: 'u1',
  departmentId: null,
  fullName: 'Admin',
  permissions: new Set(['contract.view_all']),
} as unknown as AuthUser;

const ORDER_TYPE = { id: '00000000-0000-4000-8000-000000000001', code: 'DDH', codePattern: 'DDH-{YYYY}-{SEQUENCE:4}', kind: 'ORDER' };
const PARENT = '00000000-0000-4000-8000-0000000000aa';

function setup(opts: { type?: Record<string, unknown> | null; parent?: Record<string, unknown> | null; order?: Record<string, unknown> } = {}) {
  const tx = {
    contract: { create: vi.fn((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new', ...a.data })) },
    contractItem: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([{ current: 7 }]),
  };
  const prisma = {
    contractType: { findFirst: vi.fn().mockResolvedValue(opts.type ?? null) },
    contract: {
      findFirst: vi.fn((a: { where: { AND?: unknown[] } }) => {
        // Lần gọi kiểm tra hợp đồng nguyên tắc dùng AND [scope, {id, kind, deletedAt}].
        const cond = (a.where.AND?.[1] ?? {}) as { kind?: string };
        return Promise.resolve(cond.kind === 'CONTRACT' ? (opts.parent ?? null) : (opts.order ?? null));
      }),
    },
    product: { count: vi.fn().mockResolvedValue(1) },
    department: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
    partner: { count: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: vi.fn() };
  const limits = { assertCanCreateContract: vi.fn() };
  const revisions = { recordCreate: vi.fn() };
  const svc = new ContractsService(prisma as never, audit as never, {} as never, limits as never, {} as never, revisions as never);
  return { svc, prisma, tx, audit };
}

const orderInput = (extra: Record<string, unknown> = {}) =>
  contractCreateSchema.parse({
    title: 'Đơn tháng 10',
    contractTypeId: ORDER_TYPE.id,
    vatRate: 8,
    items: [
      { name: 'Keo A500', unit: 'Thùng', quantity: '10', unitPrice: '1250000' },
      { name: 'Keo A300', unit: 'Thùng', quantity: '2.5', unitPrice: '980000' },
    ],
    ...extra,
  });

describe('ContractsService – đơn đặt hàng', () => {
  it('tạo đơn: kind ORDER, thành tiền tính ở máy chủ, giá trị = cộng tiền hàng, nội dung mặc định', async () => {
    const { svc, tx } = setup({ type: ORDER_TYPE });
    await svc.create(user, orderInput());
    const data = tx.contract.create.mock.calls[0][0].data as Record<string, unknown> & { items: { create: { amount: string; sortOrder: number }[] } };
    expect(data.kind).toBe('ORDER');
    expect(data.value).toBe('14950000.00');
    expect(data.items.create.map((i) => i.amount)).toEqual(['12500000.00', '2450000.00']);
    expect(data.contentHtml).toContain('{{order.items_table}}');
    expect(data.code).toMatch(/^DDH-\d{4}-0007$/);
    expect(DEFAULT_ORDER_HTML).toContain('{{order.total_words}}');
  });

  it('loại "Đơn đặt hàng" luôn tạo đơn kể cả khi client không gửi kind', async () => {
    const { svc, tx } = setup({ type: ORDER_TYPE });
    await svc.create(user, orderInput({ kind: 'CONTRACT' }));
    expect(tx.contract.create.mock.calls[0][0].data.kind).toBe('ORDER');
  });

  it('đơn không dùng loại hợp đồng thường; hợp đồng thường không gắn hợp đồng nguyên tắc', async () => {
    const normal = { ...ORDER_TYPE, kind: 'CONTRACT' };
    await expect(setup({ type: normal }).svc.create(user, orderInput({ kind: 'ORDER' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ type: normal, parent: { id: PARENT } }).svc.create(user, orderInput({ parentContractId: PARENT }))).rejects.toThrow('Chỉ đơn đặt hàng');
  });

  it('hợp đồng mua bán có dòng hàng: lưu dòng hàng, giá trị = cộng tiền hàng', async () => {
    const normal = { ...ORDER_TYPE, kind: 'CONTRACT' };
    const ok = setup({ type: normal });
    await ok.svc.create(user, orderInput({ value: '1' }));
    const data = ok.tx.contract.create.mock.calls[0][0].data;
    expect(data.kind).toBe('CONTRACT');
    expect(data.value).toBe('14950000.00');
    expect((data.items as { create: unknown[] }).create).toHaveLength(2);
  });

  it('hợp đồng nguyên tắc phải là hợp đồng xem được trong cùng doanh nghiệp', async () => {
    await expect(setup({ type: ORDER_TYPE, parent: null }).svc.create(user, orderInput({ parentContractId: PARENT }))).rejects.toThrow('Hợp đồng nguyên tắc không hợp lệ');
    const ok = setup({ type: ORDER_TYPE, parent: { id: PARENT } });
    await ok.svc.create(user, orderInput({ parentContractId: PARENT }));
    expect(ok.tx.contract.create.mock.calls[0][0].data.parentContractId).toBe(PARENT);
  });
});

describe('ContractsService.updateDelivery', () => {
  const signedOrder = {
    id: 'o1',
    code: 'DDH-2026-0001',
    kind: 'ORDER',
    status: 'ACTIVE',
    deletedAt: null,
    archivedAt: null,
    items: [
      { id: 'i1', name: 'Keo A500', quantity: { toString: () => '10' }, deliveredQty: { toString: () => '0' } },
      { id: 'i2', name: 'Keo A300', quantity: { toString: () => '2.5' }, deliveredQty: { toString: () => '0' } },
    ],
  };

  it('không cho giao vượt số lượng đặt', async () => {
    const { svc } = setup({ order: signedOrder });
    await expect(svc.updateDelivery(user, 'o1', { items: [{ id: 'i1', deliveredQty: '10.5' }] })).rejects.toThrow('vượt số lượng đặt');
  });

  it('chỉ cập nhật khi đơn đã ký', async () => {
    const { svc } = setup({ order: { ...signedOrder, status: 'DRAFT' } });
    await expect(svc.updateDelivery(user, 'o1', { items: [{ id: 'i1', deliveredQty: '1' }] })).rejects.toThrow('khi đơn đã ký');
  });

  it('ghi số lượng đã giao và nhật ký tình trạng giao hàng', async () => {
    const { svc, tx, audit } = setup({ order: signedOrder });
    tx.contractItem.findMany.mockResolvedValue([
      { quantity: '10', deliveredQty: '10' },
      { quantity: '2.5', deliveredQty: '0' },
    ]);
    await svc.updateDelivery(user, 'o1', { items: [{ id: 'i1', deliveredQty: '10' }] });
    expect(tx.contractItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { deliveredQty: '10' } });
    expect(audit.log).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: 'order.delivery_update', data: expect.objectContaining({ fulfillment: 'PARTIAL' }) }),
      tx,
    );
  });
});
