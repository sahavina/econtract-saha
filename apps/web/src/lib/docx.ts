import type { DocBlock } from '@saha/shared';

/**
 * Đọc nội dung file Word (.docx) ngay trong trình duyệt, không cần thư viện:
 * .docx là file zip ⇒ tìm word/document.xml trong central directory, giải nén deflate bằng DecompressionStream,
 * rồi tách đoạn văn và bảng (mỗi ô là các đoạn nối bằng xuống dòng).
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function readZipEntry(file: Blob, entryName: string): Promise<Uint8Array | null> {
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

/** Tách khối nội dung của file .docx; trả null nếu không đọc được (file hỏng, .doc cũ, có mật khẩu…). */
export async function readDocxBlocks(file: Blob): Promise<DocBlock[] | null> {
  const xml = await readZipEntry(file, 'word/document.xml').catch(() => null);
  if (!xml) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return null;
  const blocks: DocBlock[] = [];
  for (const el of Array.from(body.children)) {
    if (el.namespaceURI !== W) continue;
    if (el.localName === 'p') {
      const text = paragraphText(el);
      if (text.trim()) blocks.push({ type: 'p', text });
    } else if (el.localName === 'tbl') {
      blocks.push({ type: 'table', rows: children(el, 'tr').map((tr) => children(tr, 'tc').map(cellText)) });
    }
  }
  return blocks;
}
