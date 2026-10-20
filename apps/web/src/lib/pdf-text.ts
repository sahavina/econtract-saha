import { type DocBlock, foldVi } from '@saha/shared';

/**
 * Đọc lớp chữ của file PDF (pdf.js) để trích thông tin đơn đặt hàng.
 * Chữ được gom thành dòng theo tọa độ y và tách ô theo khoảng trống; bảng hàng hóa nhận ra từ dòng tiêu đề
 * (có "tên hàng" và "số lượng"), các dòng sau xếp vào cột theo vị trí x của tiêu đề.
 * PDF dạng ảnh scan không có lớp chữ ⇒ trả null.
 */

interface Cell {
  x: number;
  end: number;
  text: string;
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
function toLines(items: { str: string; transform: number[]; width: number; height: number }[]): Cell[][] {
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
    return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }));
  });
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

export async function readPdfText(file: Blob): Promise<{ blocks: DocBlock[] } | null> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const blocks: DocBlock[] = [];
  let chars = 0;
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const lines = toLines(content.items.filter((i) => 'str' in i) as never);
      let header: Cell[] | null = null;
      let table: string[][] = [];
      const flush = () => {
        if (table.length > 1) blocks.push({ type: 'table', rows: table });
        table = [];
        header = null;
      };
      for (const cells of lines) {
        const text = cells.map((c) => c.text).join(' ');
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
  return chars < 20 ? null : { blocks };
}
