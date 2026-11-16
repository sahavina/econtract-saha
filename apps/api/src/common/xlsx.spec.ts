import { inflateRawSync } from 'node:zlib';
import { buildXlsxBytes } from '@saha/shared';

/** Đọc các tệp trong zip không nén (stored) do buildXlsxBytes tạo. */
function entries(bytes: Uint8Array) {
  const buf = Buffer.from(bytes);
  const out = new Map<string, string>();
  for (let p = 0; buf.readUInt32LE(p) === 0x04034b50; ) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8');
    const data = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    out.set(name, (buf.readUInt16LE(p + 8) === 8 ? inflateRawSync(data) : data).toString('utf8'));
    p += 30 + nameLen + size;
  }
  return out;
}

describe('buildXlsxBytes – tạo file Excel', () => {
  const files = entries(
    buildXlsxBytes([{ name: 'Hợp đồng/2026', rows: [['Mã', 'Giá trị', 'Ngày'], ['<HĐ & "1">', 1_500_000, new Date('2026-11-16T00:00:00Z')], [null, '', undefined]] }]),
  );

  it('đủ các phần của file .xlsx và tên trang hợp lệ', () => {
    expect([...files.keys()]).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']));
    expect(files.get('xl/workbook.xml')).toContain('name="Hợp đồng 2026"');
  });

  it('chữ được thoát ký tự XML, số là ô số, ngày là số ngày kiểu Excel', () => {
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('&lt;HĐ &amp; &quot;1&quot;&gt;');
    expect(sheet).toContain('<c r="B2" s="2"><v>1500000</v></c>');
    expect(sheet).toContain('<c r="C2" s="4"><v>46342</v></c>');
    // Ô trống không ghi; ô chữ không bao giờ là công thức.
    expect(sheet).not.toContain('r="A3"');
    expect(sheet).not.toContain('<f>');
  });
});
