import { type DocBlock, extractOrderFields } from '@saha/shared';
import { describe, expect, it } from 'vitest';

const blocks: DocBlock[] = [
  { type: 'p', text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' },
  { type: 'p', text: 'ĐƠN ĐẶT HÀNG' },
  { type: 'p', text: 'Số đơn hàng: 125/2026/ĐĐH-HL' },
  { type: 'p', text: 'Hà Nội, ngày 18 tháng 10 năm 2026' },
  { type: 'p', text: 'BÊN MUA (BÊN A): CÔNG TY TNHH XÂY DỰNG HOÀNG LONG' },
  { type: 'p', text: 'Mã số thuế: 0109998877' },
  { type: 'p', text: 'BÊN BÁN (BÊN B): CÔNG TY TNHH SAHA' },
  {
    type: 'table',
    rows: [
      ['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT', 'Số lượng', 'Đơn giá (VNĐ)', 'Thành tiền'],
      ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)'],
      ['1', 'SIL-A500', 'Keo silicone trung tính A500', 'Thùng', '12', '1.250.000', '15.000.000'],
      ['2', '', 'Súng bắn keo', 'Cái', '2,5', '', '462.500'],
      ['', '', 'Cộng tiền hàng', '', '', '', '15.462.500'],
      ['', '', 'Thuế GTGT 8%', '', '', '', '1.237.000'],
    ],
  },
  { type: 'p', text: 'Địa điểm giao hàng: Công trình KĐT Hoàng Long, Bắc Ninh.' },
  { type: 'p', text: 'Thời gian giao hàng: trước ngày 25/10/2026' },
  { type: 'p', text: 'Điều kiện thanh toán: chuyển khoản trong 30 ngày.' },
];

describe('extractOrderFields', () => {
  it('đọc tiêu đề, số đơn, ngày, các bên, giao hàng, thanh toán', () => {
    const o = extractOrderFields(blocks);
    expect(o.title).toBe('Đơn đặt hàng 125/2026/ĐĐH-HL');
    expect(o.code).toBe('125/2026/ĐĐH-HL');
    expect(o.signDate).toBe('2026-10-18');
    expect(o.parties.find((p) => p.role === 'PARTY_A')).toMatchObject({ name: 'CÔNG TY TNHH XÂY DỰNG HOÀNG LONG', taxCode: '0109998877', side: 'BUY' });
    expect(o.deliveryAddress).toBe('Công trình KĐT Hoàng Long, Bắc Ninh');
    expect(o.deliveryDate).toBe('2026-10-25');
    expect(o.paymentTerms).toBe('chuyển khoản trong 30 ngày');
  });

  it('đọc bảng hàng hóa, bỏ dòng đánh số cột và dòng tổng; thiếu đơn giá thì suy từ thành tiền', () => {
    expect(extractOrderFields(blocks).items).toEqual([
      { code: 'SIL-A500', name: 'Keo silicone trung tính A500', unit: 'Thùng', quantity: '12', unitPrice: '1250000' },
      { code: undefined, name: 'Súng bắn keo', unit: 'Cái', quantity: '2.5', unitPrice: '185000' },
    ]);
  });

  it('hai bên đặt cạnh nhau (Nhà cung cấp | Khách hàng), số PO và ngày ở ô kế bên', () => {
    const rows = [
      ['ĐƠN ĐẶT HÀNG'],
      ['THÔNG TIN NHÀ CUNG CẤP:', '', '', 'THÔNG TIN BÊN MUA HÀNG:'],
      ['Nhà cung cấp', 'CÔNG TY TNHH SAHA', '', 'Khách hàng', 'CÔNG TY CP DOZA'],
      ['Mã số thuế (Tax code):    0110690109', '', '', 'Mã số thuế (Tax code):    0109166412'],
      ['Địa chỉ:', 'Số 54 Lương Ngọc Quyến', '', 'Địa chỉ', 'Số 16 An Hoà'],
      ['Tài khoản:', '921019999 MB', '', 'Số PO: ', '2010/DOZA-SAHA/2026', '', 'Date: 20/10/2026'],
      ['Đại diện: ', ' Ông Nguyễn Đức Chung ', 'Chức vụ: Giám đốc', 'Đại diện', 'Ông …...', '', 'Chức vu: ….'],
      ['Stt', 'Tên vật tư ', 'Số lượng', 'Đơn vị', 'Đơn Giá (VND)', 'Thành tiền (VND)'],
      ['1', 'Keo Titebond', '12', 'Chai', '88000', '1056000'],
      ['THÀNH TIỀN CHƯA VAT', '', '', '', '', '1056000'],
    ];
    const o = extractOrderFields([...rows.map((r) => ({ type: 'p' as const, text: r.filter(Boolean).join(' ') })), { type: 'table', rows }]);
    expect(o.code).toBe('2010/DOZA-SAHA/2026');
    expect(o.signDate).toBe('2026-10-20');
    expect(o.title).toBe('Đơn đặt hàng 2010/DOZA-SAHA/2026');
    expect(o.parties).toEqual([
      { role: 'PARTY_A', side: 'BUY', name: 'CÔNG TY CP DOZA', taxCode: '0109166412', address: 'Số 16 An Hoà' },
      {
        role: 'PARTY_B',
        side: 'SELL',
        name: 'CÔNG TY TNHH SAHA',
        taxCode: '0110690109',
        address: 'Số 54 Lương Ngọc Quyến',
        bankAccount: '921019999 MB',
        representative: 'Nguyễn Đức Chung',
        position: 'Giám đốc',
      },
    ]);
    expect(o.items).toEqual([{ code: undefined, name: 'Keo Titebond', unit: 'Chai', quantity: '12', unitPrice: '88000' }]);
  });

  it('không có bảng hàng hóa ⇒ danh sách rỗng', () => {
    expect(extractOrderFields([{ type: 'table', rows: [['Mã số thuế', '0101']] }]).items).toEqual([]);
  });
});
