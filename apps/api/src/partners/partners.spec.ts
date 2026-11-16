import { partnerInputSchema, partnerQuerySchema, partnerUpdateSchema } from './partners.schemas.js';
import { PartnersService, summarizePartnerContracts } from './partners.service.js';

const row = (partnerId: string, id: string, value: string, status: string) => ({ partnerId, contract: { id, value, status } });

describe('summarizePartnerContracts – tổng giá trị và tình trạng hợp tác', () => {
  it('cộng giá trị mỗi hợp đồng một lần (đối tác đứng hai vai trong cùng hợp đồng)', () => {
    const s = summarizePartnerContracts([row('p1', 'c1', '100.50', 'ACTIVE'), row('p1', 'c1', '100.50', 'ACTIVE'), row('p1', 'c2', '200', 'DRAFT')]);
    expect(s.get('p1')).toEqual({ totalValue: '300.5', contractCount: 2, cooperation: 'ACTIVE' });
  });

  it('phân loại tình trạng: đàm phán, kết thúc', () => {
    const s = summarizePartnerContracts([
      row('neg', 'a', '1', 'PENDING_SIGNATURE'),
      row('neg', 'b', '1', 'EXPIRED'),
      row('end', 'c', '5', 'LIQUIDATED'),
      row('end', 'd', '5', 'EXPIRED'),
    ]);
    expect(s.get('neg')?.cooperation).toBe('NEGOTIATING');
    expect(s.get('end')).toEqual({ totalValue: '10', contractCount: 2, cooperation: 'ENDED' });
  });

  it('bỏ qua dòng không gắn đối tác', () => {
    expect(summarizePartnerContracts([{ partnerId: null, contract: { id: 'x', value: '1', status: 'ACTIVE' } }]).size).toBe(0);
  });
});

describe('partner schemas – người phụ trách', () => {
  it('chuỗi rỗng ⇒ bỏ chọn; id sai định dạng ⇒ lỗi', () => {
    expect(partnerUpdateSchema.parse({ ownerId: '' })).toEqual({ ownerId: null });
    expect(partnerInputSchema.safeParse({ code: 'KH1', type: 'CUSTOMER', name: 'A', ownerId: 'abc' }).success).toBe(false);
    expect(partnerQuerySchema.parse({ ownerId: '' }).ownerId).toBeUndefined();
  });
});

describe('PartnersService – người phụ trách cùng doanh nghiệp', () => {
  const user = { userId: 'u1', tenantId: 't1', permissions: new Set<string>() };
  const make = (found: number) => {
    const create = vi.fn().mockResolvedValue({ id: 'p1', code: 'KH1', name: 'A' });
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(found) },
      $transaction: (fn: (tx: unknown) => unknown) => fn({ partner: { create } }),
    };
    const audit = { log: vi.fn().mockResolvedValue(undefined) };
    return { service: new PartnersService(prisma as never, audit as never, {} as never), create, prisma };
  };

  it('từ chối người phụ trách không thuộc doanh nghiệp', async () => {
    const { service, create } = make(0);
    await expect(service.create(user as never, { code: 'KH1', type: 'CUSTOMER', entityType: 'ORGANIZATION', name: 'A', ownerId: '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b' })).rejects.toThrow('không thuộc doanh nghiệp');
    expect(create).not.toHaveBeenCalled();
  });

  it('kiểm tra theo tenant của người dùng và tạo khi hợp lệ', async () => {
    const { service, create, prisma } = make(1);
    await service.create(user as never, { code: 'KH1', type: 'CUSTOMER', entityType: 'ORGANIZATION', name: 'A', ownerId: '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b' });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { id: '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b', tenantId: 't1' } });
    expect(create).toHaveBeenCalled();
  });
});
