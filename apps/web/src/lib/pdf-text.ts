import { type DocBlock, foldVi } from '@saha/shared';
import { fitColumnWidths } from '@/lib/table-widths';

/**
 * Đọc lớp chữ của file PDF (pdf.js) để trích thông tin đơn đặt hàng.
 * Chữ được gom thành dòng theo tọa độ y và tách ô theo khoảng trống; bảng hàng hóa nhận ra từ dòng tiêu đề
 * (có "tên hàng" và "số lượng"), các dòng sau xếp vào cột theo vị trí x của tiêu đề.
 * Kèm `html`: lớp chữ dựng lại thành đoạn văn để làm nội dung hợp đồng (bảng biểu thành các dòng chữ).
 * PDF dạng ảnh scan không có lớp chữ ⇒ trả null.
 */

interface Cell {
  x: number;
  end: number;
  text: string;
}

interface Line {
  y: number;
  height: number;
  cells: Cell[];
}

const HEADER_NAME = /^(ten hang|ten san pham|ten vat tu|hang hoa|san pham|dien giai|mo ta|description)/;
const HEADER_QTY = /^(so luong|sl|khoi luong|qty|quantity)/;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // Worker chép vào public/vendor khi dev/build (scripts/copy-pdf-worker.mjs) – cùng origin, không tải từ CDN.
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  return pdfjs;
}

/** Gom các mẩu chữ cùng dòng (sai lệch y ≤ 3pt) và nối/tách ô theo khoảng trống giữa chúng. */
function toLines(items: TextItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines: { y: number; parts: typeof sorted }[] = [];
  for (const it of sorted) {
    const y = it.transform[5];
    const line = lines.find((l) => Math.abs(l.y - y) <= 3);
    if (line) line.parts.push(it);
    else lines.push({ y, parts: [it] });
  }
  return lines.map((l) => {
    const parts = l.parts.sort((a, b) => a.transform[4] - b.transform[4]);
    const cells: Cell[] = [];
    for (const p of parts) {
      const x = p.transform[4];
      const last = cells[cells.length - 1];
      const fontSize = Math.max(p.height || 0, 6);
      // Khoảng trống lớn hơn ~1,2 lần cỡ chữ ⇒ sang ô mới.
      if (last && x - last.end <= fontSize * 1.2) {
        last.text += (x - last.end > fontSize * 0.15 ? ' ' : '') + p.str;
        last.end = Math.max(last.end, x + p.width);
      } else cells.push({ x, end: x + p.width, text: p.str });
    }
    return {
      y: l.y,
      height: Math.max(...parts.map((p) => p.height || 0), 6),
      cells: cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() })),
    };
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
/** Dòng mở đầu mục: gạch đầu dòng, số thứ tự, "Điều 1", "Bên A"… */
const STARTS_ITEM = /^([-–•+]|\d{1,2}\s*[.)/]|[a-z]\)|dieu\s+\d|ben\s+[abc]\b|chuong\s+\d)/;
const isUpper = (t: string) => /\p{L}/u.test(t) && t === t.toLocaleUpperCase('vi');

/** Các dòng nhiều cột liền nhau ⇒ một bảng không viền; cột lấy theo vị trí bắt đầu của các khối chữ (lệch dưới 20pt coi là cùng cột). */
function columnsHtml(lines: Line[]): string {
  const xs = lines.flatMap((l) => l.cells.map((c) => c.x)).sort((a, b) => a - b);
  const starts: number[] = [];
  for (const x of xs) if (!starts.length || x - starts[starts.length - 1] > 20) starts.push(x);
  const rows = lines.map((l) => {
    const cols = starts.map(() => [] as string[]);
    for (const c of l.cells) {
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= c.x + 5) k++;
      cols[k].push(esc(c.text));
    }
    return `<tr>${cols.map((t) => `<td><p>${t.join(' ')}</p></td>`).join('')}</tr>`;
  });
  return `<table class="borderless"><tbody>${rows.join('')}</tbody></table>`;
}

type TextItem = { str: string; transform: number[]; width: number; height: number };

/** Đoạn kẻ ngang (y cố định, x1→x2) hoặc dọc (x cố định, y1→y2), tọa độ trang PDF (gốc dưới trái). */
interface Rule {
  at: number;
  from: number;
  to: number;
}

/** Bảng kẻ khung tìm được trên trang: vùng chiếm chỗ và HTML dựng lại. */
interface GridTable {
  top: number;
  bottom: number;
  left: number;
  right: number;
  html: string;
}

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;

/** Gộp các giá trị gần nhau (lệch ≤ tol) thành một. */
function cluster(values: number[], tol = 2.5): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/**
 * Đường kẻ khung trên trang: Excel/Word xuất PDF vẽ viền ô bằng hình chữ nhật rất mảnh (tô) hoặc đường thẳng (nét).
 * Theo dõi ma trận biến đổi (save/restore/transform) để đổi về tọa độ trang như lớp chữ.
 */
async function pageRules(
  page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }> },
  OPS: Record<string, number>,
): Promise<{ h: Rule[]; v: Rule[] }> {
  const { fnArray, argsArray } = await page.getOperatorList();
  const h: Rule[] = [];
  const v: Rule[] = [];
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const addSeg = (x1: number, y1: number, x2: number, y2: number) => {
    if (Math.abs(y1 - y2) < 0.5 && Math.abs(x2 - x1) > 3) h.push({ at: (y1 + y2) / 2, from: Math.min(x1, x2), to: Math.max(x1, x2) });
    else if (Math.abs(x1 - x2) < 0.5 && Math.abs(y2 - y1) > 3) v.push({ at: (x1 + x2) / 2, from: Math.min(y1, y2), to: Math.max(y1, y2) });
  };
  fnArray.forEach((fn, i) => {
    const args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
    else if (fn === OPS.constructPath) {
      const op = args?.[0] as number;
      const data = (args?.[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data || typeof data.length !== 'number' || !(strokeOps.has(op) || fillOps.has(op))) return;
      // Tách đường đi thành các đường gấp khúc (moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4).
      const polys: (readonly [number, number])[][] = [];
      let cur: (readonly [number, number])[] = [];
      let curved = false;
      for (let k = 0; k < data.length; ) {
        const code = data[k];
        if (code === 0) {
          if (cur.length) polys.push(cur);
          cur = [apply(ctm, data[k + 1], data[k + 2])];
          k += 3;
        } else if (code === 1) {
          cur.push(apply(ctm, data[k + 1], data[k + 2]));
          k += 3;
        } else if (code === 2) {
          curved = true;
          k += 7;
        } else if (code === 3) {
          curved = true;
          k += 5;
        } else {
          if (cur.length > 2) cur.push(cur[0]);
          k += 1;
        }
      }
      if (cur.length) polys.push(cur);
      if (curved) return;
      for (const p of polys) {
        if (strokeOps.has(op)) for (let k = 1; k < p.length; k++) addSeg(p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]);
        if (fillOps.has(op) && p.length >= 4) {
          const xs = p.map((q) => q[0]);
          const ys = p.map((q) => q[1]);
          const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
          // Hình chữ nhật mảnh = một đường kẻ; hình lớn (tô nền) bỏ qua.
          if (y2 - y1 <= 2.5 && x2 - x1 > 3) addSeg(x1, (y1 + y2) / 2, x2, (y1 + y2) / 2);
          else if (x2 - x1 <= 2.5 && y2 - y1 > 3) addSeg((x1 + x2) / 2, y1, (x1 + x2) / 2, y2);
        }
      }
    }
  });
  return { h, v };
}

/** Chữ trong một ô: các mẩu chữ gom thành dòng, nối các dòng bằng dấu cách; căn lề đoán theo khoảng trống hai bên. */
function cellHtml(items: TextItem[], x1: number, x2: number): { text: string; html: string } {
  if (!items.length) return { text: '', html: '<p></p>' };
  const text = toLines(items)
    .map((l) => l.cells.map((c) => c.text).join(' '))
    // Dòng xuống hàng ngay sau dấu gạch nối (mã hàng "406-" / "20g") thì nối liền.
    .reduce((s, t) => (!s ? t : /[-–/]$/.test(s) ? s + t : `${s} ${t}`), '');
  const minX = Math.min(...items.map((i) => i.transform[4]));
  const maxX = Math.max(...items.map((i) => i.transform[4] + i.width));
  const left = minX - x1;
  const right = x2 - maxX;
  const align = left > 3 && Math.abs(left - right) < 3 ? 'center' : right < 6 && left > right + 4 ? 'right' : '';
  return { text, html: `<p${align ? ` style="text-align:${align}"` : ''}>${esc(text)}</p>` };
}

/**
 * Bảng kẻ khung: các đường dọc chồng nhau theo chiều cao tạo thành một vùng bảng; lưới lấy từ vị trí đường dọc (cột) và
 * đường ngang (hàng). Hai ô lưới liền nhau không có đường kẻ ngăn cách ⇒ ô gộp (colspan/rowspan) như bản gốc.
 */
function gridTables(rules: { h: Rule[]; v: Rule[] }, items: TextItem[]): GridTable[] {
  const groups: Rule[][] = [];
  for (const r of [...rules.v].sort((a, b) => a.from - b.from)) {
    const g = groups.find((gr) => gr.some((o) => r.from <= o.to + 2 && r.to >= o.from - 2));
    if (g) g.push(r);
    else groups.push([r]);
  }
  const tables: GridTable[] = [];
  for (const g of groups) {
    const xs = cluster(g.map((r) => r.at));
    if (xs.length < 2) continue;
    const [left, right] = [xs[0], xs[xs.length - 1]];
    const [bottom, top] = [Math.min(...g.map((r) => r.from)), Math.max(...g.map((r) => r.to))];
    const hs = rules.h.filter((r) => r.at >= bottom - 2 && r.at <= top + 2 && r.to > left + 2 && r.from < right - 2);
    // Hàng từ trên xuống (y giảm dần).
    const ys = cluster([bottom, top, ...hs.map((r) => r.at)]).reverse();
    if (ys.length < 2) continue;
    const nr = ys.length - 1;
    const nc = xs.length - 1;
    const vAt = (x: number, y: number) => g.some((r) => Math.abs(r.at - x) <= 2.5 && r.from <= y + 1 && r.to >= y - 1);
    const hAt = (y: number, x: number) => hs.some((r) => Math.abs(r.at - y) <= 2.5 && r.from <= x + 1 && r.to >= x - 1);
    const inTable = items.filter((it) => {
      const cx = it.transform[4] + it.width / 2;
      const cy = it.transform[5] + it.height * 0.3;
      return it.str.trim() && cx >= left && cx <= right && cy >= bottom && cy <= top;
    });
    const covered = new Set<string>();
    const grid: { r: number; c: number; cs: number; rs: number; own: TextItem[]; x1: number; x2: number }[] = [];
    let filled = 0;
    for (let r = 0; r < nr; r++) {
      const ym = (ys[r] + ys[r + 1]) / 2;
      for (let c = 0; c < nc; c++) {
        if (covered.has(`${r}:${c}`)) continue;
        let cs = 1;
        while (c + cs < nc && !vAt(xs[c + cs], ym) && !covered.has(`${r}:${c + cs}`)) cs++;
        let rs = 1;
        while (r + rs < nr && Array.from({ length: cs }, (_, k) => c + k).every((k) => !hAt(ys[r + rs], (xs[k] + xs[k + 1]) / 2) && !covered.has(`${r + rs}:${k}`))) rs++;
        for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) covered.add(`${r + dr}:${c + dc}`);
        const [x1, x2, yTop, yBot] = [xs[c], xs[c + cs], ys[r], ys[r + rs]];
        const own = inTable.filter((it) => {
          const cx = it.transform[4] + it.width / 2;
          const cy = it.transform[5] + it.height * 0.3;
          return cx >= x1 && cx < x2 && cy <= yTop && cy > yBot;
        });
        if (own.length) filled++;
        grid.push({ r, c, cs, rs, own, x1, x2 });
      }
    }
    // Khung trang trí không chứa chữ (đường viền trang…) thì bỏ qua.
    if (!filled) continue;
    const html = grid.map((g) => ({ ...g, ...cellHtml(g.own, g.x1, g.x2) }));
    // Độ rộng cột theo tỉ lệ bản gốc, mỗi cột đủ chứa từ dài nhất (ô không gộp cột) để không ngắt chữ giữa từ.
    const px = fitColumnWidths(
      xs.slice(1).map((x, c) => x - xs[c]),
      Array.from({ length: nc }, (_, c) => html.filter((g) => g.c === c && g.cs === 1).map((g) => g.text)),
    );
    const rows = Array.from({ length: nr }, (_, r) =>
      html
        .filter((g) => g.r === r)
        .map((g) => {
          const attrs = `${g.cs > 1 ? ` colspan="${g.cs}"` : ''}${g.rs > 1 ? ` rowspan="${g.rs}"` : ''} colwidth="${px.slice(g.c, g.c + g.cs).join(',')}"`;
          return `<td${attrs}>${g.html}</td>`;
        })
        .join(''),
    ).map((cells) => `<tr>${cells}</tr>`);
    const colgroup = `<colgroup>${px.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>`;
    tables.push({ top, bottom, left, right, html: `<table>${colgroup}<tbody>${rows.join('')}</tbody></table>` });
  }
  return tables.sort((a, b) => b.top - a.top);
}

/** Gom các dòng của một trang thành đoạn: dòng sau nối vào đoạn trước nếu dòng trước chạy hết khổ và không có khoảng cách lớn. */
function pageHtml(lines: Line[], pageWidth: number, tables: GridTable[] = []): string {
  // Bỏ số trang ở đầu/cuối trang.
  const body = lines.filter((l, i) => !((i === 0 || i === lines.length - 1) && /^\d{1,3}$/.test(l.cells.map((c) => c.text).join(' '))));
  const right = Math.max(0, ...body.flatMap((l) => l.cells.map((c) => c.end)));
  const out: string[] = [];
  let para = '';
  let group: Line[] = [];
  const flushGroup = () => {
    if (group.length) out.push(columnsHtml(group));
    group = [];
  };
  const flush = () => {
    if (para) out.push(`<p>${para}</p>`);
    para = '';
    flushGroup();
  };
  const pending = [...tables];
  let afterTable = false;
  body.forEach((l, i) => {
    // Bảng kẻ khung nằm phía trên dòng này: chèn vào đúng vị trí.
    while (pending.length && pending[0].bottom >= l.y) {
      flush();
      out.push(pending.shift()!.html);
      afterTable = true;
    }
    const breakBefore = afterTable;
    afterTable = false;
    // Dòng có nhiều khối chữ cách xa nhau (thông tin hai bên, bảng): giữ bố cục cột bằng bảng không viền.
    if (l.cells.length > 1) {
      if (para) out.push(`<p>${para}</p>`);
      para = '';
      group.push(l);
      return;
    }
    flushGroup();
    const raw = l.cells.map((c) => c.text).join(' ');
    const text = esc(raw);
    const start = l.cells[0].x;
    const end = l.cells[l.cells.length - 1].end;
    // Dòng ngắn nằm giữa trang: tiêu đề.
    if (Math.abs((start + end) / 2 - pageWidth / 2) < 12 && end - start < pageWidth * 0.7) {
      flush();
      out.push(`<p style="text-align:center">${isUpper(raw) ? `<strong>${text}</strong>` : text}</p>`);
      return;
    }
    const prev = body[i - 1];
    const prevEnd = prev ? prev.cells[prev.cells.length - 1].end : 0;
    const newPara = breakBefore || !prev || prev.cells.length > 1 || prev.y - l.y > l.height * 1.9 || prevEnd < right - pageWidth * 0.12 || STARTS_ITEM.test(foldVi(raw)) || isUpper(raw);
    if (newPara) flush();
    para += (para ? ' ' : '') + (isUpper(raw) ? `<strong>${text}</strong>` : text);
  });
  flush();
  for (const t of pending) out.push(t.html);
  return out.join('');
}

/** Xếp ô của một dòng vào cột theo khoảng x của các ô tiêu đề. */
function alignToHeader(header: Cell[], cells: Cell[]): string[] {
  const out = header.map(() => '');
  for (const c of cells) {
    const mid = (c.x + c.end) / 2;
    let best = 0;
    let bestDist = Infinity;
    header.forEach((h, i) => {
      const next = header[i + 1]?.x ?? Infinity;
      const prevEnd = i > 0 ? (header[i - 1].end + h.x) / 2 : -Infinity;
      // Ô nằm trong vùng của cột i (từ giữa khe trước đến đầu cột sau) thì chọn ngay.
      if (mid >= prevEnd && mid < next) {
        bestDist = -1;
        best = i;
      } else if (bestDist >= 0) {
        const d = Math.abs(mid - (h.x + h.end) / 2);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
    });
    out[best] = out[best] ? `${out[best]} ${c.text}` : c.text;
  }
  return out;
}

export async function readPdfText(file: Blob): Promise<{ blocks: DocBlock[]; html: string } | null> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const blocks: DocBlock[] = [];
  let html = '';
  let chars = 0;
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter((i) => 'str' in i) as unknown as TextItem[];
      const lines = toLines(items);
      // Bảng kẻ khung dựng lại thành bảng có viền; phần chữ còn lại theo dòng/đoạn như trước. Lỗi đọc nét vẽ ⇒ bỏ qua bảng.
      const tables = await pageRules(page as never, pdfjs.OPS as unknown as Record<string, number>)
        .then((rules) => gridTables(rules, items))
        .catch(() => [] as GridTable[]);
      const inside = (it: TextItem) => {
        const cx = it.transform[4] + it.width / 2;
        const cy = it.transform[5] + it.height * 0.3;
        return tables.some((t) => cx >= t.left && cx <= t.right && cy >= t.bottom && cy <= t.top);
      };
      html += pageHtml(tables.length ? toLines(items.filter((it) => !inside(it))) : lines, page.getViewport({ scale: 1 }).width, tables);
      let header: Cell[] | null = null;
      let table: string[][] = [];
      const flush = () => {
        if (table.length > 1) blocks.push({ type: 'table', rows: table });
        table = [];
        header = null;
      };
      for (const { cells } of lines) {
        // Tab giữa các ô: tách được "Điện thoại: …   Mã số thuế: …" nằm trên cùng dòng.
        const text = cells.map((c) => c.text).join('\t');
        chars += text.length;
        blocks.push({ type: 'p', text });
        const folded = cells.map((c) => foldVi(c.text));
        if (folded.some((f) => HEADER_NAME.test(f)) && folded.some((f) => HEADER_QTY.test(f))) {
          flush();
          header = cells;
          table = [cells.map((c) => c.text)];
        } else if (header) {
          table.push(alignToHeader(header, cells));
        }
      }
      flush();
    }
  } finally {
    void task.destroy();
  }
  // Gần như không có chữ ⇒ PDF scan.
  return chars < 20 ? null : { blocks, html };
}
