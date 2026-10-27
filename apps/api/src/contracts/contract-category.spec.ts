import { inferContractCategory } from '@saha/shared';

describe('inferContractCategory – phân loại hợp đồng khi để trống', () => {
  it('đơn đặt hàng luôn là hợp đồng khách hàng', () => {
    expect(inferContractCategory({ kind: 'ORDER', partyTypes: ['SUPPLIER'] })).toBe('CUSTOMER');
  });

  it('loại hợp đồng có chữ "lao động" ⇒ hợp đồng lao động', () => {
    expect(inferContractCategory({ kind: 'CONTRACT', typeName: 'Hợp đồng lao động', partyTypes: [] })).toBe('LABOR');
  });

  it('theo phân loại đối tác đầu tiên là khách hàng/nhà cung cấp', () => {
    expect(inferContractCategory({ kind: 'CONTRACT', partyTypes: [undefined, 'BOTH', 'SUPPLIER'] })).toBe('SUPPLIER');
    expect(inferContractCategory({ kind: 'CONTRACT', typeName: 'Hợp đồng mua bán', partyTypes: ['CUSTOMER'] })).toBe('CUSTOMER');
  });

  it('không đủ căn cứ ⇒ chưa phân loại', () => {
    expect(inferContractCategory({ kind: 'CONTRACT', partyTypes: ['OTHER', null] })).toBeNull();
  });
});
