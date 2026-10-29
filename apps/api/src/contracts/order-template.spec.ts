import { buildTemplateValues, numberToVietnameseWords, orderFulfillment, orderTotals, renderTemplate } from '@saha/shared';
import { describe, expect, it } from 'vitest';

describe('đơn đặt hàng – tính tiền và nội dung', () => {
  it('đọc số tiền bằng chữ', () => {
    expect(numberToVietnameseWords(0)).toBe('không');
    expect(numberToVietnameseWords(21)).toBe('hai mươi mốt');
    expect(numberToVietnameseWords(105)).toBe('một trăm linh năm');
    expect(numberToVietnameseWords(1_250_000)).toBe('một triệu hai trăm năm mươi nghìn');
    expect(numberToVietnameseWords(2_000_005_000)).toBe('hai tỷ không trăm linh năm nghìn');
    expect(numberToVietnameseWords(1_000_000_000_000n)).toBe('một nghìn tỷ');
  });

  it('cộng tiền hàng, thuế và tổng không sai số dấu phẩy động', () => {
    expect(orderTotals([{ name: 'a', quantity: '3', unitPrice: '0.1' }, { name: 'b', quantity: '1', unitPrice: '0.2' }], 10)).toEqual({
      subtotal: '0.50',
      vatAmount: '0.05',
      total: '0.55',
    });
  });

  it('tình trạng giao hàng', () => {
    expect(orderFulfillment([{ quantity: '2', deliveredQty: '0' }])).toBe('NONE');
    expect(orderFulfillment([{ quantity: '2', deliveredQty: '1' }])).toBe('PARTIAL');
    expect(orderFulfillment([{ quantity: '2', deliveredQty: '2' }])).toBe('DONE');
  });

  it('bảng hàng hóa thay cả đoạn chứa biến, tên hàng được escape', () => {
    const values = buildTemplateValues({
      code: 'DDH-1',
      title: 'Đơn',
      value: '0',
      currency: 'VND',
      vatRate: '8',
      parties: [],
      items: [{ name: 'Keo <b>A</b>', unit: 'Thùng', quantity: '2', unitPrice: '1000000' }],
      parentContract: { code: '0501/2026/HĐNT/APOLLO-SAHA', signedDate: '2026-01-05' },
    });
    const html = renderTemplate('<p>{{order.items_table}}</p><p>{{order.total}} – {{order.total_words}} – {{order.parent_code}}</p>', values).html;
    expect(html.startsWith('<table><colgroup>')).toBe(true);
    expect(html).toContain('<col style="width: 212px">');
    expect(html).toContain('Keo &lt;b&gt;A&lt;/b&gt;');
    expect(html).toContain('2.160.000 – Hai triệu một trăm sáu mươi nghìn đồng – 0501/2026/HĐNT/APOLLO-SAHA');
  });
});
