import { type DocBlock, extractContractFields, parseVietnameseNumber } from '@saha/shared';

const p = (text: string): DocBlock => ({ type: 'p', text });

describe('extractContractFields', () => {
  it('reads the SAHA sales contract layout (party tables, price table)', () => {
    const x = extractContractFields([
      { type: 'table', rows: [['', 'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM\nHà Nội, ngày 15 tháng 10 năm 2026']] },
      p('HỢP ĐỒNG MUA BÁN HÀNG HÓA'),
      p('Số：01/ THUANNHAT-SAHA/20261015'),
      p('Căn cứ Bộ luật Dân sự … thông qua ngày 24/11/2015;'),
      p('Hôm nay, ngày 15 tháng 10 năm 2026,  chúng tôi gồm:'),
      p('1/ ĐẠI DIỆN BÊN A'),
      {
        type: 'table',
        rows: [
          ['Tên cơ quan  ', 'CÔNG TY TNHH ĐIỆN TỰ ĐỘNG THUẬN NHẬT'],
          ['Mã số thuế', '3702 142 667'],
          ['Đại diện là', 'Ông: NGUYỄN VĂN NHẬT'],
          ['Chức vụ', 'Giám đốc\n'],
          ['Số tài khoản', '153629529 Ngân hàng ACB'],
        ],
      },
      p('2/ ĐẠI DIỆN BÊN B'),
      {
        type: 'table',
        rows: [
          ['Tên cơ quan', 'CÔNG TY TNHH SAHA'],
          ['Điện thoại', '0966753382'],
          ['Số tài khoản', '……………………'],
        ],
      },
      p('Các bên thống nhất ký hợp đồng như sau：'),
      {
        type: 'table',
        rows: [
          ['STT', 'Nội dung', 'Thành tiền'],
          ['Thuế VAT 8%', '2.112.000'],
          ['Tổng cộng (Bao gồm VAT)', '28.512.000'],
        ],
      },
    ]);
    expect(x).toMatchObject({
      title: 'HỢP ĐỒNG MUA BÁN HÀNG HÓA',
      code: '01/THUANNHAT-SAHA/20261015',
      signDate: '2026-10-15',
      value: '28512000',
      vatRate: 8,
      currency: 'VND',
    });
    expect(x.parties).toEqual([
      {
        role: 'PARTY_A',
        name: 'CÔNG TY TNHH ĐIỆN TỰ ĐỘNG THUẬN NHẬT',
        taxCode: '3702142667',
        representative: 'NGUYỄN VĂN NHẬT',
        position: 'Giám đốc',
        bankAccount: '153629529 Ngân hàng ACB',
      },
      // Ô "………" để trống ⇒ không lấy.
      { role: 'PARTY_B', name: 'CÔNG TY TNHH SAHA', phone: '0966753382' },
    ]);
  });

  it('reads "Nhãn: giá trị" paragraphs and party name after the marker', () => {
    const x = extractContractFields([
      p('HỢP ĐỒNG DỊCH VỤ'),
      p('Số: 12/2026/HĐDV'),
      p('Hôm nay, ngày 05/11/2026, tại Hà Nội'),
      p('BÊN A (BÊN THUÊ DỊCH VỤ): CÔNG TY CP ABC'),
      p('Địa chỉ: 1 Tràng Tiền, Hà Nội'),
      p('Điện thoại: 024 1234 5678\tEmail: ketoan@abc.vn'),
      p('Mã số thuế: 0101234567'),
      p('Đại diện: Bà Trần Thị B\t\tChức vụ: Tổng Giám đốc'),
      p('BÊN B: CÔNG TY TNHH XYZ'),
      p('Tài khoản số: 0011 tại Vietcombank'),
      p('Điều 1: Nội dung'),
      p('Địa chỉ: không thuộc bên nào'),
      p('- Tổng giá trị hợp đồng: 150.000.000 đồng (đã bao gồm thuế GTGT 10%)'),
    ]);
    expect(x).toMatchObject({ title: 'HỢP ĐỒNG DỊCH VỤ', code: '12/2026/HĐDV', signDate: '2026-11-05', value: '150000000', vatRate: 10 });
    expect(x.parties).toEqual([
      {
        role: 'PARTY_A',
        name: 'CÔNG TY CP ABC',
        address: '1 Tràng Tiền, Hà Nội',
        phone: '024 1234 5678',
        email: 'ketoan@abc.vn',
        taxCode: '0101234567',
        representative: 'Trần Thị B',
        position: 'Tổng Giám đốc',
      },
      { role: 'PARTY_B', name: 'CÔNG TY TNHH XYZ', bankAccount: '0011 tại Vietcombank' },
    ]);
  });

  it('reads labels padded with spaces/tabs before the colon (HĐNT TTG – SAHA layout)', () => {
    const x = extractContractFields([
      p('HỢP ĐỒNG NGUYÊN TẮC'),
      p('Số: 0107/2025/HĐNT/TT-SAHA'),
      p('Hôm nay, ngày 01 tháng 07 năm 2025, tại văn phòng Công ty, chúng tôi gồm có:'),
      p('BÊN A (Bên Mua)\t: CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ TRỰC TUYẾN SAHA'),
      p('Địa chỉ        \t: Số 54 đường Lương Ngọc Quyến, Hà Nội'),
      p('Mã số thuế \t: 0110690109'),
      p('Tài khoản số\t: 921019999 - Ngân hàng MB'),
      p('Đại diện  \t: Ông Nguyễn Đức Chung\tChức vụ: Giám đốc'),
      p('BÊN B (Bên Bán)\t: CÔNG TY CỔ PHẦN TẬP ĐOÀN THUẬN THÀNH'),
      p('Điện thoại \t: 028. 6290.9592\tFax: 028. 6290.9591'),
      p('ĐIỀU 1: HÀNG HÓA.'),
    ]);
    expect(x).toMatchObject({ title: 'HỢP ĐỒNG NGUYÊN TẮC', code: '0107/2025/HĐNT/TT-SAHA', signDate: '2025-07-01' });
    expect(x.parties).toEqual([
      {
        role: 'PARTY_A',
        name: 'CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ TRỰC TUYẾN SAHA',
        address: 'Số 54 đường Lương Ngọc Quyến, Hà Nội',
        taxCode: '0110690109',
        bankAccount: '921019999 - Ngân hàng MB',
        representative: 'Nguyễn Đức Chung',
        position: 'Giám đốc',
        side: 'BUY',
      },
      { role: 'PARTY_B', name: 'CÔNG TY CỔ PHẦN TẬP ĐOÀN THUẬN THÀNH', phone: '028. 6290.9592', side: 'SELL' },
    ]);
  });

  it('parses Vietnamese numbers', () => {
    expect(parseVietnameseNumber('28.512.000 (VNĐ)')).toBe('28512000');
    expect(parseVietnameseNumber('1,250,000.50')).toBe('1250000.50');
    expect(parseVietnameseNumber('125.000.000,5 đ')).toBe('125000000.5');
    expect(parseVietnameseNumber('không có số')).toBeUndefined();
  });
});
