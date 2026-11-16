import { buildXlsxBytes, XLSX_MIME, type XlsxSheet } from '@saha/shared';
import { readZipEntry } from '@/lib/docx';

export type { XlsxCell, XlsxSheet } from '@saha/shared';

/**
 * Đọc/ghi file Excel .xlsx dạng bảng dữ liệu ngay trên trình duyệt (không cần thư viện):
 * - readXlsxRows: đọc trang tính đầu tiên thành mảng dòng chuỗi (nhập dữ liệu).
 * - buildXlsx: tạo file .xlsx (bộ tạo dùng chung trong @saha/shared) dạng Blob để tải về.
 */

// ---------- Đọc ----------

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const els = (n: Document | Element, tag: string) => Array.from(n.getElementsByTagNameNS('*', tag));
const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Đọc trang tính đầu tiên; ô trống ⇒ ''. Số giữ dạng chữ như Excel lưu (không định dạng). */
export async function readXlsxRows(file: Blob): Promise<string[][]> {
  const dec = new TextDecoder();
  const read = async (path: string) => {
    const bytes = await readZipEntry(file, path).catch(() => null);
    return bytes ? dec.decode(bytes) : null;
  };
  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('File không phải định dạng Excel .xlsx');
  const firstSheet = els(xml(wb), 'sheet')[0];
  const rid = firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  let path = 'xl/worksheets/sheet1.xml';
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (rels && rid) {
    const target = els(xml(rels), 'Relationship')
      .find((r) => r.getAttribute('Id') === rid)
      ?.getAttribute('Target');
    if (target) path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? els(xml(sharedXml), 'si').map((si) => els(si, 't').map((t) => t.textContent ?? '').join('')) : [];
  const sheet = await read(path);
  if (!sheet) throw new Error('Không đọc được trang tính đầu tiên');

  const rows: string[][] = [];
  for (const r of els(xml(sheet), 'row')) {
    const rowNo = Number(r.getAttribute('r')) || rows.length + 1;
    const cells: string[] = [];
    for (const c of els(r, 'c')) {
      const ref = c.getAttribute('r');
      const idx = ref ? colIndex(ref) : cells.length;
      const t = c.getAttribute('t');
      const v = els(c, 'v')[0]?.textContent ?? '';
      let value = v;
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = els(c, 't').map((x) => x.textContent ?? '').join('');
      else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      cells[idx] = value;
    }
    rows[rowNo - 1] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}

// ---------- Ghi ----------

/** File .xlsx dạng Blob để tải về. */
export function buildXlsx(sheets: XlsxSheet[]): Blob {
  return new Blob([buildXlsxBytes(sheets) as BlobPart], { type: XLSX_MIME });
}

/** Tải một Blob xuống máy với tên tệp cho trước. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
