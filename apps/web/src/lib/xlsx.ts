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

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

interface Merge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** "A1:K3" ⇒ vùng gộp (hàng tính từ 1 như Excel, cột từ 0). */
function parseMerge(ref: string): Merge | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  return { c1: columnIndex(`${m[1]}1`), r1: Number(m[2]), c2: columnIndex(`${m[3]}1`), r2: Number(m[4]) };
}

/**
 * Bảng HTML theo trang tính – làm nội dung hồ sơ lập từ file Excel, gần với bản in của Excel:
 * - hàng có kẻ khung trong Excel (bảng hàng) thành bảng có viền; phần thông tin, tiêu đề thành bảng không viền;
 * - giữ ô gộp (colspan/rowspan); bỏ hàng, cột trống (Excel hay chừa lề bằng cột rỗng);
 * - ở phần không viền, chữ tràn sang ô trống bên phải như Excel hiển thị; ô gộp rộng căn giữa.
 */
function sheetHtml(rows: string[][], rowNums: number[], merges: Merge[], bordered: boolean[]): string {
  const out: string[] = [];
  for (let start = 0; start < rows.length; ) {
    let end = start;
    while (end + 1 < rows.length && bordered[end + 1] === bordered[start]) end++;
    out.push(segmentHtml(rows, rowNums, merges, start, end, bordered[start]));
    start = end + 1;
  }
  return out.join('');
}

function segmentHtml(rows: string[][], rowNums: number[], merges: Merge[], start: number, end: number, bordered: boolean): string {
  const idx = Array.from({ length: end - start + 1 }, (_, k) => start + k);
  const width = Math.max(...idx.map((i) => rows[i].length));
  const keptCols = Array.from({ length: width }, (_, c) => c).filter((c) => idx.some((i) => rows[i][c]));
  const keptCol = new Set(keptCols);
  const span = new Map<string, { colspan: number; rowspan: number }>();
  const covered = new Set<string>();
  for (const m of merges) {
    const top = idx.find((i) => rowNums[i] === m.r1);
    if (top === undefined || !rows[top][m.c1] || !keptCol.has(m.c1)) continue;
    const cols = keptCols.filter((c) => c >= m.c1 && c <= m.c2);
    const rowsIn = idx.filter((i) => rowNums[i] >= m.r1 && rowNums[i] <= m.r2);
    span.set(`${top}:${m.c1}`, { colspan: cols.length, rowspan: rowsIn.length });
    for (const r of rowsIn) for (const c of cols) if (r !== top || c !== m.c1) covered.add(`${r}:${c}`);
  }
  // Chữ tràn sang các ô trống liền kề bên phải (chỉ phần không viền, như Excel hiển thị).
  if (!bordered) {
    for (const i of idx) {
      keptCols.forEach((c, k) => {
        if (!rows[i][c] || span.has(`${i}:${c}`) || covered.has(`${i}:${c}`)) return;
        let n = 1;
        while (k + n < keptCols.length && !rows[i][keptCols[k + n]] && !covered.has(`${i}:${keptCols[k + n]}`) && !span.has(`${i}:${keptCols[k + n]}`)) {
          covered.add(`${i}:${keptCols[k + n]}`);
          n++;
        }
        if (n > 1) span.set(`${i}:${c}`, { colspan: n, rowspan: 1 });
      });
    }
  }
  const body = idx
    .map((i) => {
      const cells = keptCols
        .filter((c) => !covered.has(`${i}:${c}`))
        .map((c) => {
          const s = span.get(`${i}:${c}`);
          const attrs = `${s && s.colspan > 1 ? ` colspan="${s.colspan}"` : ''}${s && s.rowspan > 1 ? ` rowspan="${s.rowspan}"` : ''}`;
          // Ô gộp phủ gần hết bề ngang (tiêu đề) thì căn giữa; chữ tràn giữ căn trái như Excel.
          const merged = merges.some((m) => m.r1 === rowNums[i] && m.c1 === c);
          const center = merged && s && s.colspan >= Math.max(3, Math.ceil(keptCols.length / 2)) ? ' style="text-align:center"' : '';
          return `<td${attrs}><p${center}>${esc(rows[i][c] ?? '')}</p></td>`;
        });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `<table${bordered ? '' : ' class="borderless"'}><tbody>${body}</tbody></table>`;
}

/** Ô có kẻ khung: tra kiểu ô (thuộc tính s) ⇒ cellXfs ⇒ borders có cạnh nào được kẻ. */
async function borderedStyles(file: Blob): Promise<Set<number>> {
  const xml = await readZipEntry(file, 'xl/styles.xml').catch(() => null);
  if (!xml) return new Set();
  const doc = parse(xml);
  const borders = Array.from(doc.getElementsByTagNameNS(S, 'borders')[0]?.getElementsByTagNameNS(S, 'border') ?? []).map((b) =>
    ['left', 'right', 'top', 'bottom'].some((side) => !!b.getElementsByTagNameNS(S, side)[0]?.getAttribute('style')),
  );
  const xfs = Array.from(doc.getElementsByTagNameNS(S, 'cellXfs')[0]?.getElementsByTagNameNS(S, 'xf') ?? []);
  return new Set(xfs.map((xf, i) => (borders[Number(xf.getAttribute('borderId') ?? 0)] ? i : -1)).filter((i) => i >= 0));
}

/** Đọc file .xlsx; trả null nếu không đọc được. Số trong ô ghi theo kiểu Việt Nam (dấu phẩy thập phân) để bộ trích hiểu đúng. */
export async function readXlsx(file: Blob): Promise<{ blocks: DocBlock[]; html: string } | null> {
  const sheetXml = await readZipEntry(file, await firstSheetPath(file)).catch(() => null);
  if (!sheetXml) return null;
  const sharedXml = await readZipEntry(file, 'xl/sharedStrings.xml').catch(() => null);
  const shared = sharedXml ? Array.from(parse(sharedXml).getElementsByTagNameNS(S, 'si')).map(textOf) : [];
  const rows: string[][] = [];
  const rowNums: number[] = [];
  const bordered: boolean[] = [];
  const borderedXf = await borderedStyles(file);
  const sheet = parse(sheetXml);
  const merges = Array.from(sheet.getElementsByTagNameNS(S, 'mergeCell'))
    .map((m) => parseMerge(m.getAttribute('ref') ?? ''))
    .filter((m): m is Merge => !!m);
  for (const row of Array.from(sheet.getElementsByTagNameNS(S, 'row'))) {
    const cells: string[] = [];
    let framed = 0;
    for (const c of Array.from(row.getElementsByTagNameNS(S, 'c'))) {
      if (borderedXf.has(Number(c.getAttribute('s') ?? -1))) framed++;
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
    if (cells.some(Boolean)) {
      rows.push(cells);
      rowNums.push(Number(row.getAttribute('r')) || rowNums.length + 1);
      // Hàng có từ hai ô kẻ khung trở lên coi là hàng của bảng (bảng hàng, bảng tổng).
      bordered.push(framed >= 2);
    }
  }
  if (!rows.length) return null;
  const blocks: DocBlock[] = rows.map((r) => ({ type: 'p', text: r.filter(Boolean).join(' ') }));
  blocks.push({ type: 'table', rows });
  return { blocks, html: sheetHtml(rows, rowNums, merges, bordered) };
}
