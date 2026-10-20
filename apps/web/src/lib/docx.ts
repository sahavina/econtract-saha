import type { DocBlock } from '@saha/shared';
import { apiRaw } from '@/lib/api';

/** Word 97–2003 (.doc) ⇒ máy chủ chuyển sang .docx (LibreOffice) để đọc như file .docx. Lỗi ⇒ ném ApiError kèm thông báo. */
export async function convertDocToDocx(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiRaw('/documents/convert-doc', { method: 'POST', formData });
  return res.blob();
}

/**
 * Đọc nội dung file Word (.docx) ngay trong trình duyệt, không cần thư viện:
 * .docx là file zip ⇒ tìm word/document.xml trong central directory, giải nén deflate bằng DecompressionStream,
 * rồi tách đoạn văn và bảng (mỗi ô là các đoạn nối bằng xuống dòng).
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export async function readZipEntry(file: Blob, entryName: string): Promise<Uint8Array | null> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  // End of central directory: chữ ký 0x06054b50, nằm trong 64 KB cuối file.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) return null;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === entryName) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8) return null;
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function paragraphText(p: Element): string {
  let s = '';
  for (const el of Array.from(p.getElementsByTagNameNS(W, '*'))) {
    if (el.localName === 't') s += el.textContent ?? '';
    else if (el.localName === 'tab') s += '\t';
    else if (el.localName === 'br' || el.localName === 'cr') s += '\n';
  }
  return s;
}

function children(el: Element, name: string) {
  return Array.from(el.children).filter((c) => c.namespaceURI === W && c.localName === name);
}

/** Văn bản của một ô: các đoạn (kể cả trong bảng lồng) nối bằng xuống dòng. */
function cellText(tc: Element): string {
  return Array.from(tc.getElementsByTagNameNS(W, 'p'))
    .map(paragraphText)
    .join('\n')
    .trim();
}

// ───────────── Chuyển sang HTML nội dung hợp đồng ─────────────

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function child(el: Element | undefined, name: string): Element | undefined {
  return el ? children(el, name)[0] : undefined;
}

function val(el: Element | undefined): string | null {
  return el ? (el.getAttributeNS(W, 'val') ?? el.getAttribute('w:val')) : null;
}

/** Thuộc tính bật/tắt của Word: <w:b/> bật, <w:b w:val="0|false"/> tắt; không khai báo ⇒ undefined (lấy theo kiểu). */
function flag(el: Element | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = val(el);
  return v === null || !['0', 'false', 'none'].includes(v);
}

interface RunFmt {
  b: boolean;
  i: boolean;
  u: boolean;
  s: boolean;
}
type PartialFmt = Partial<RunFmt>;

function rPrFmt(pr: Element | undefined): PartialFmt {
  const out: PartialFmt = {};
  const set = (k: keyof RunFmt, v: boolean | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set('b', flag(child(pr, 'b')));
  set('i', flag(child(pr, 'i')));
  set('u', flag(child(pr, 'u')));
  set('s', flag(child(pr, 'strike')));
  return out;
}

/** Kiểu đoạn/ký tự trong styles.xml: căn lề + định dạng chữ, đã gộp kế thừa basedOn. */
interface StyleInfo {
  jc?: string;
  fmt: PartialFmt;
}
type Styles = { byId: Map<string, StyleInfo>; defaultPara?: string };
let styles: Styles = { byId: new Map() };

function parseStyles(xml: string | null): Styles {
  const out: Styles = { byId: new Map() };
  if (!xml) return out;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const raw = new Map<string, { basedOn?: string; jc?: string; fmt: PartialFmt }>();
  for (const st of Array.from(doc.getElementsByTagNameNS(W, 'style'))) {
    const id = st.getAttributeNS(W, 'styleId') ?? st.getAttribute('w:styleId');
    if (!id) continue;
    const type = st.getAttributeNS(W, 'type') ?? st.getAttribute('w:type');
    if (type === 'paragraph' && ['1', 'true'].includes(st.getAttributeNS(W, 'default') ?? st.getAttribute('w:default') ?? '')) out.defaultPara = id;
    raw.set(id, {
      basedOn: val(child(st, 'basedOn')) ?? undefined,
      jc: val(child(child(st, 'pPr'), 'jc')) ?? undefined,
      fmt: rPrFmt(child(st, 'rPr')),
    });
  }
  const resolve = (id: string, depth = 0): StyleInfo => {
    const r = raw.get(id);
    if (!r || depth > 10) return { fmt: {} };
    const base = r.basedOn ? resolve(r.basedOn, depth + 1) : { fmt: {} };
    return { jc: r.jc ?? base.jc, fmt: { ...base.fmt, ...r.fmt } };
  };
  for (const id of raw.keys()) out.byId.set(id, resolve(id));
  return out;
}

function paraStyle(p: Element): StyleInfo {
  const id = val(child(child(p, 'pPr'), 'pStyle')) ?? styles.defaultPara;
  return (id && styles.byId.get(id)) || { fmt: {} };
}

function runFmt(r: Element, paraFmt: PartialFmt): RunFmt {
  const pr = child(r, 'rPr');
  const charStyle = val(child(pr, 'rStyle'));
  const f = { ...paraFmt, ...(charStyle ? styles.byId.get(charStyle)?.fmt : {}), ...rPrFmt(pr) };
  return { b: !!f.b, i: !!f.i, u: !!f.u, s: !!f.s };
}

function wrap(html: string, f: RunFmt) {
  let h = html;
  if (f.s) h = `<s>${h}</s>`;
  if (f.u) h = `<u>${h}</u>`;
  if (f.i) h = `<em>${h}</em>`;
  if (f.b) h = `<strong>${h}</strong>`;
  return h;
}

/** Nội dung một đoạn: gộp các run liền nhau cùng định dạng (Word hay cắt chữ thành nhiều run). */
function paragraphHtml(p: Element): string {
  const paraFmt = paraStyle(p).fmt;
  const parts: { html: string; fmt: RunFmt }[] = [];
  const visit = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === 'r') {
        const fmt = runFmt(c, paraFmt);
        let html = '';
        for (const x of Array.from(c.children)) {
          if (x.localName === 't') html += esc(x.textContent ?? '');
          else if (x.localName === 'tab') html += '\u2003';
          else if (x.localName === 'br' || x.localName === 'cr') html += '<br>';
        }
        if (!html) continue;
        const last = parts[parts.length - 1];
        if (last && JSON.stringify(last.fmt) === JSON.stringify(fmt)) last.html += html;
        else parts.push({ html, fmt });
      } else if (['hyperlink', 'ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(c.localName)) {
        visit(c);
      }
    }
  };
  visit(p);
  return parts.map((x) => wrap(x.html, x.fmt)).join('');
}

function alignOf(p: Element): string | null {
  const jc = val(child(child(p, 'pPr'), 'jc')) ?? paraStyle(p).jc ?? null;
  if (jc === 'center') return 'center';
  if (jc === 'right' || jc === 'end') return 'right';
  if (jc === 'both' || jc === 'distribute') return 'justify';
  return null;
}

function pHtml(p: Element): string {
  const align = alignOf(p);
  return `<p${align ? ` style="text-align: ${align}"` : ''}>${paragraphHtml(p)}</p>`;
}

/** Bảng có kẻ viền khi có kiểu bảng (Table Grid…) hoặc khai báo viền hiển thị; ngược lại coi là bảng không viền. */
function hasBorders(tbl: Element): boolean {
  const pr = child(tbl, 'tblPr');
  if (child(pr, 'tblStyle')) return true;
  const borders = child(pr, 'tblBorders');
  if (borders && Array.from(borders.children).some((b) => !['nil', 'none'].includes(val(b) ?? 'nil'))) return true;
  return Array.from(tbl.getElementsByTagNameNS(W, 'tcBorders')).some((tb) =>
    Array.from(tb.children).some((b) => !['nil', 'none'].includes(val(b) ?? 'nil')),
  );
}

/** Độ rộng các cột (px) từ <w:tblGrid>; null nếu file không khai báo đủ. */
function gridWidths(tbl: Element): number[] | null {
  const cols = children(child(tbl, 'tblGrid') ?? tbl, 'gridCol').map((c) => Math.round(Number(c.getAttributeNS(W, 'w') ?? c.getAttribute('w:w')) / 15));
  return cols.length && cols.every((w) => w > 0) ? cols : null;
}

function blockHtml(el: Element): string {
  if (el.localName === 'p') return pHtml(el);
  if (el.localName !== 'tbl') return '';
  const widths = gridWidths(el);
  const rows = children(el, 'tr').map((tr) => {
    let col = 0;
    const cells = children(tr, 'tc').map((tc) => {
      const pr = child(tc, 'tcPr');
      const span = Number(val(child(pr, 'gridSpan')) ?? 1);
      // colwidth: trình soạn thảo (Tiptap) đọc thuộc tính này để giữ độ rộng cột khi sửa và lưu lại.
      const cw = widths?.slice(col, col + span);
      col += span;
      const colwidth = cw && cw.length === span ? ` colwidth="${cw.join(',')}"` : '';
      const vMerge = child(pr, 'vMerge');
      // Ô gộp dọc (phần tiếp theo) ⇒ để trống, giữ đúng số cột.
      const inner = vMerge && val(vMerge) !== 'restart' ? '<p></p>' : Array.from(tc.children).filter((c) => c.namespaceURI === W).map(blockHtml).join('') || '<p></p>';
      return `<td${span > 1 ? ` colspan="${span}"` : ''}${colwidth}>${inner}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });
  const colgroup = widths ? `<colgroup>${widths.map((w) => `<col style="width: ${w}px">`).join('')}</colgroup>` : '';
  return `<table${hasBorders(el) ? '' : ' class="borderless"'}>${colgroup}<tbody>${rows.join('')}</tbody></table>`;
}

export interface DocxContent {
  /** Khối văn bản để trích thông tin (tên, các bên, giá trị…). */
  blocks: DocBlock[];
  /** Nội dung hợp đồng dạng HTML (máy chủ làm sạch lại khi lưu). */
  html: string;
}

/** Đọc file .docx; trả null nếu không đọc được (file hỏng, .doc cũ, có mật khẩu…). */
export async function readDocx(file: Blob): Promise<DocxContent | null> {
  const xml = await readZipEntry(file, 'word/document.xml').catch(() => null);
  if (!xml) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return null;
  const stylesXml = await readZipEntry(file, 'word/styles.xml').catch(() => null);
  styles = parseStyles(stylesXml && new TextDecoder().decode(stylesXml));
  const blocks: DocBlock[] = [];
  let html = '';
  for (const el of Array.from(body.children)) {
    if (el.namespaceURI !== W) continue;
    if (el.localName === 'p') {
      const text = paragraphText(el);
      if (text.trim()) blocks.push({ type: 'p', text });
    } else if (el.localName === 'tbl') {
      blocks.push({ type: 'table', rows: children(el, 'tr').map((tr) => children(tr, 'tc').map(cellText)) });
    }
    html += blockHtml(el);
  }
  // Bỏ đoạn trống ở cuối văn bản.
  html = html.replace(/(<p>[\s\u2003]*<\/p>)+$/, '');
  return { blocks, html };
}
