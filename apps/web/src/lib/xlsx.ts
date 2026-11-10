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

/** Bề ngang vùng nội dung trang A4 (px, 96 dpi) – độ rộng cột của bảng được chia theo tỉ lệ Excel trong phạm vi này. */
const A4_CONTENT_PX = 640;
/** Khoảng đệm hai bên ô (px) – cộng vào bề ngang từ dài nhất để ước lượng cột tối thiểu. */
const CELL_PADDING_PX = 14;
/** Bề ngang ước lượng một từ ở cỡ chữ bảng nhiều cột (khoảng 10pt): chữ in hoa, chữ số rộng hơn chữ thường. */
const wordPx = (word: string) => Array.from(word).reduce((s, ch) => s + (/[A-ZĐ0-9]/.test(ch.normalize('NFD')[0]) ? 9.4 : 6.8), 0);

interface Sheet {
  rows: string[][];
  /** Chữ hiển thị trong nội dung: số có phân cách hàng nghìn, ngày dd/mm/yyyy, phần trăm. */
  shown: string[][];
  numeric: boolean[][];
  /** Căn lề ngang của ô theo Excel ('' = mặc định: chữ trái, số phải). */
  align: string[][];
  rowNums: number[];
  merges: Merge[];
  bordered: boolean[];
  /** Độ rộng cột theo Excel (đơn vị ký tự). */
  colWidth: (c: number) => number;
}

/**
 * Bảng HTML theo trang tính – làm nội dung hồ sơ lập từ file Excel, gần với bản in của Excel:
 * - hàng có kẻ khung trong Excel (bảng hàng) thành bảng có viền; phần thông tin, tiêu đề thành bảng không viền;
 * - giữ ô gộp (colspan/rowspan); bỏ hàng, cột trống (Excel hay chừa lề bằng cột rỗng);
 * - độ rộng cột theo tỉ lệ cột trong Excel, vừa khổ A4 (không chia đều làm ngắt chữ giữa từ);
 * - ở phần không viền, chữ tràn sang ô trống bên phải như Excel hiển thị; căn lề theo từng ô của Excel.
 */
function sheetHtml(sheet: Sheet): string {
  const out: string[] = [];
  for (let start = 0; start < sheet.rows.length; ) {
    let end = start;
    while (end + 1 < sheet.rows.length && sheet.bordered[end + 1] === sheet.bordered[start]) end++;
    out.push(segmentHtml(sheet, start, end));
    start = end + 1;
  }
  return out.join('');
}

function segmentHtml(sheet: Sheet, start: number, end: number): string {
  const { rows, shown, numeric, align: cellAlign, rowNums, merges } = sheet;
  const bordered = sheet.bordered[start];
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
  // Độ rộng cột: tỉ lệ theo Excel, tổng vừa bề ngang A4. Ghi cả colgroup (xem, in, PDF) và colwidth của ô (trình soạn thảo).
  // Mỗi cột tối thiểu đủ chứa từ dài nhất của nó (ô không gộp) để không ngắt chữ giữa từ; phần còn lại chia theo tỉ lệ Excel.
  const raw = keptCols.map((c) => sheet.colWidth(c));
  const need = keptCols.map((c) => {
    const longest = Math.max(0, ...idx.filter((i) => !span.has(`${i}:${c}`) && !covered.has(`${i}:${c}`)).flatMap((i) => (shown[i][c] ?? '').split(/\s+/).map(wordPx)));
    return Math.round(longest + CELL_PADDING_PX);
  });
  const needTotal = need.reduce((s, w) => s + w, 0);
  const rawTotal = raw.reduce((s, w) => s + w, 0) || 1;
  const widthsPx =
    needTotal >= A4_CONTENT_PX
      ? need.map((w) => (w / needTotal) * A4_CONTENT_PX)
      : need.map((w, k) => w + ((A4_CONTENT_PX - needTotal) * raw[k]) / rawTotal);
  const px = new Map(keptCols.map((c, k) => [c, Math.max(24, Math.round(widthsPx[k]))]));
  const colgroup = `<colgroup>${keptCols.map((c) => `<col style="width:${px.get(c)}px">`).join('')}</colgroup>`;
  const body = idx
    .map((i) => {
      const cells = keptCols
        .filter((c) => !covered.has(`${i}:${c}`))
        .map((c) => {
          const s = span.get(`${i}:${c}`);
          const k = keptCols.indexOf(c);
          const widths = keptCols.slice(k, k + (s?.colspan ?? 1)).map((x) => px.get(x));
          const attrs = `${s && s.colspan > 1 ? ` colspan="${s.colspan}"` : ''}${s && s.rowspan > 1 ? ` rowspan="${s.rowspan}"` : ''} colwidth="${widths.join(',')}"`;
          // Căn lề theo Excel; ô để mặc định thì số căn phải, chữ căn trái như Excel hiển thị.
          const align = cellAlign[i][c] || (numeric[i][c] ? 'right' : '');
          return `<td${attrs}><p${align ? ` style="text-align:${align}"` : ''}>${esc(shown[i][c] ?? '')}</p></td>`;
        });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `<table${bordered ? '' : ' class="borderless"'}>${colgroup}<tbody>${body}</tbody></table>`;
}

/**
 * Kiểu ô (thuộc tính s ⇒ cellXfs): có kẻ khung không (borders), là ngày hay phần trăm (numFmtId, định dạng tự đặt).
 * Định dạng dựng sẵn: 9–10 phần trăm; 14–22, 45–47 ngày giờ.
 */
async function cellStyles(file: Blob) {
  const bordered = new Set<number>();
  const kind = new Map<number, 'date' | 'percent'>();
  const align = new Map<number, string>();
  const xml = await readZipEntry(file, 'xl/styles.xml').catch(() => null);
  if (!xml) return { bordered, kind, align };
  const doc = parse(xml);
  const borders = Array.from(doc.getElementsByTagNameNS(S, 'borders')[0]?.getElementsByTagNameNS(S, 'border') ?? []).map((b) =>
    ['left', 'right', 'top', 'bottom'].some((side) => !!b.getElementsByTagNameNS(S, side)[0]?.getAttribute('style')),
  );
  const custom = new Map(
    Array.from(doc.getElementsByTagNameNS(S, 'numFmt')).map((f) => [Number(f.getAttribute('numFmtId')), (f.getAttribute('formatCode') ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '')]),
  );
  const xfs = Array.from(doc.getElementsByTagNameNS(S, 'cellXfs')[0]?.getElementsByTagNameNS(S, 'xf') ?? []);
  xfs.forEach((xf, i) => {
    if (borders[Number(xf.getAttribute('borderId') ?? 0)]) bordered.add(i);
    const h = xf.getElementsByTagNameNS(S, 'alignment')[0]?.getAttribute('horizontal');
    if (h === 'center' || h === 'centerContinuous') align.set(i, 'center');
    else if (h === 'right') align.set(i, 'right');
    else if (h === 'justify' || h === 'distributed') align.set(i, 'justify');
    else if (h === 'left') align.set(i, 'left');
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    const code = custom.get(id);
    if (id === 9 || id === 10 || code?.includes('%')) kind.set(i, 'percent');
    else if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (code && /[dy]/i.test(code) && !/[0#]/.test(code))) kind.set(i, 'date');
  });
  return { bordered, kind, align };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Số kiểu Việt Nam: dấu chấm phân cách hàng nghìn, dấu phẩy thập phân. */
const viNumber = (n: number) => {
  const [int, frac] = String(Number(n.toFixed(6))).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${frac ? `,${frac}` : ''}`;
};

/** Đọc file .xlsx; trả null nếu không đọc được. Số trong ô ghi theo kiểu Việt Nam (dấu phẩy thập phân) để bộ trích hiểu đúng. */
export async function readXlsx(file: Blob): Promise<{ blocks: DocBlock[]; html: string } | null> {
  const sheetXml = await readZipEntry(file, await firstSheetPath(file)).catch(() => null);
  if (!sheetXml) return null;
  const sharedXml = await readZipEntry(file, 'xl/sharedStrings.xml').catch(() => null);
  const shared = sharedXml ? Array.from(parse(sharedXml).getElementsByTagNameNS(S, 'si')).map(textOf) : [];
  const styles = await cellStyles(file);
  const doc = parse(sheetXml);
  const sheet: Sheet = { rows: [], shown: [], numeric: [], align: [], rowNums: [], bordered: [], merges: [], colWidth: () => 8.43 };
  sheet.merges = Array.from(doc.getElementsByTagNameNS(S, 'mergeCell'))
    .map((m) => parseMerge(m.getAttribute('ref') ?? ''))
    .filter((m): m is Merge => !!m);
  const defaultWidth = Number(doc.getElementsByTagNameNS(S, 'sheetFormatPr')[0]?.getAttribute('defaultColWidth')) || 8.43;
  const widths = Array.from(doc.getElementsByTagNameNS(S, 'col')).map((c) => ({
    min: Number(c.getAttribute('min')) - 1,
    max: Number(c.getAttribute('max')) - 1,
    width: Number(c.getAttribute('width')) || defaultWidth,
  }));
  sheet.colWidth = (c) => widths.find((w) => c >= w.min && c <= w.max)?.width ?? defaultWidth;

  for (const row of Array.from(doc.getElementsByTagNameNS(S, 'row'))) {
    const cells: string[] = [];
    const shown: string[] = [];
    const numeric: boolean[] = [];
    const aligns: string[] = [];
    let framed = 0;
    for (const c of Array.from(row.getElementsByTagNameNS(S, 'c'))) {
      const style = Number(c.getAttribute('s') ?? -1);
      if (styles.bordered.has(style)) framed++;
      const ref = c.getAttribute('r');
      const idx = ref ? columnIndex(ref) : cells.length;
      const type = c.getAttribute('t');
      const v = c.getElementsByTagNameNS(S, 'v')[0]?.textContent ?? '';
      let text = '';
      let display = '';
      let isNumber = false;
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = textOf(c);
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') text = v;
      else if (v) {
        const n = Number(v);
        if (styles.kind.get(style) === 'date' && n > 0) {
          // Ngày Excel: số ngày kể từ 30/12/1899.
          const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86_400_000));
          text = display = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
        } else {
          // Ô số: làm tròn sai số dấu phẩy động của Excel, đổi dấu thập phân sang dấu phẩy.
          text = String(Number(n.toFixed(6))).replace('.', ',');
          display = styles.kind.get(style) === 'percent' ? `${viNumber(n * 100)}%` : viNumber(n);
          isNumber = true;
        }
      }
      while (cells.length < idx) {
        cells.push('');
        shown.push('');
        numeric.push(false);
        aligns.push('');
      }
      cells[idx] = text.trim();
      shown[idx] = (display || text).trim();
      numeric[idx] = isNumber;
      aligns[idx] = styles.align.get(style) ?? '';
    }
    if (cells.some(Boolean)) {
      sheet.rows.push(cells);
      sheet.shown.push(shown);
      sheet.numeric.push(numeric);
      sheet.align.push(aligns);
      sheet.rowNums.push(Number(row.getAttribute('r')) || sheet.rowNums.length + 1);
      // Hàng có từ hai ô kẻ khung trở lên coi là hàng của bảng (bảng hàng, bảng tổng).
      sheet.bordered.push(framed >= 2);
    }
  }
  if (!sheet.rows.length) return null;
  const blocks: DocBlock[] = sheet.rows.map((r) => ({ type: 'p', text: r.filter(Boolean).join(' ') }));
  blocks.push({ type: 'table', rows: sheet.rows });
  return { blocks, html: sheetHtml(sheet) };
}
