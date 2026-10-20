import type { DocBlock } from '@saha/shared';
import { readZipEntry } from '@/lib/docx';

/**
 * Đọc trang tính đầu tiên của file Excel (.xlsx) ngay trong trình duyệt (không cần thư viện):
 * chuỗi dùng chung + ô của sheet ⇒ bảng (giữ đúng cột theo địa chỉ ô) và các dòng văn bản để trích thông tin đơn.
 */

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const parse = (bytes: Uint8Array) => new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
const textOf = (el: Element) =>
  Array.from(el.getElementsByTagNameNS(S, 't'))
    .map((t) => t.textContent ?? '')
    .join('');

/** "AB12" ⇒ 27 (chỉ số cột từ 0). */
function columnIndex(ref: string) {
  const letters = ref.replace(/\d+$/, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Đường dẫn sheet đầu tiên theo workbook (không có thì sheet1.xml). */
async function firstSheetPath(file: Blob) {
  const wb = await readZipEntry(file, 'xl/workbook.xml');
  const rels = await readZipEntry(file, 'xl/_rels/workbook.xml.rels');
  if (!wb || !rels) return 'xl/worksheets/sheet1.xml';
  const sheet = parse(wb).getElementsByTagNameNS(S, 'sheet')[0];
  const rid = sheet?.getAttributeNS(R, 'id') ?? sheet?.getAttribute('r:id');
  const rel = Array.from(parse(rels).getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
  const target = rel?.getAttribute('Target');
  if (!target) return 'xl/worksheets/sheet1.xml';
  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
}

/** Đọc file .xlsx; trả null nếu không đọc được. Số trong ô ghi theo kiểu Việt Nam (dấu phẩy thập phân) để bộ trích hiểu đúng. */
export async function readXlsx(file: Blob): Promise<{ blocks: DocBlock[] } | null> {
  const sheetXml = await readZipEntry(file, await firstSheetPath(file)).catch(() => null);
  if (!sheetXml) return null;
  const sharedXml = await readZipEntry(file, 'xl/sharedStrings.xml').catch(() => null);
  const shared = sharedXml ? Array.from(parse(sharedXml).getElementsByTagNameNS(S, 'si')).map(textOf) : [];
  const rows: string[][] = [];
  for (const row of Array.from(parse(sheetXml).getElementsByTagNameNS(S, 'row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagNameNS(S, 'c'))) {
      const ref = c.getAttribute('r');
      const idx = ref ? columnIndex(ref) : cells.length;
      const type = c.getAttribute('t');
      const v = c.getElementsByTagNameNS(S, 'v')[0]?.textContent ?? '';
      let text = '';
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = textOf(c);
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') text = v;
      // Ô số: làm tròn sai số dấu phẩy động của Excel, đổi dấu thập phân sang dấu phẩy.
      else if (v) text = String(Number(Number(v).toFixed(6))).replace('.', ',');
      while (cells.length < idx) cells.push('');
      cells[idx] = text.trim();
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  if (!rows.length) return null;
  const blocks: DocBlock[] = rows.map((r) => ({ type: 'p', text: r.filter(Boolean).join(' ') }));
  blocks.push({ type: 'table', rows });
  return { blocks };
}
