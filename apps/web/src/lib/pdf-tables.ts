import type { ContentTable } from 'pdfmake/interfaces';

/** Xử lý bảng trong PDF hợp đồng (pdfmake) – tách riêng, không phụ thuộc trình duyệt để kiểm thử được. */

const BORDER = '#999999';

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    return textOf(n.text ?? n.stack ?? '');
  }
  return '';
}

/**
 * Bảng chiếm hết bề ngang; bảng ẩn viền thì không kẻ đường. Độ rộng cột (khi bảng không ghi sẵn tỉ lệ %):
 * - các cột dài tương đương nhau (dài nhất ≤ 2 lần ngắn nhất) ⇒ chia đều – ví dụ khối "ĐẠI DIỆN BÊN A | ĐẠI DIỆN BÊN B";
 * - ngược lại cột có nội dung dài nhất co giãn ('*'), các cột khác vừa nội dung.
 */
export function fitTables(node: unknown) {
  if (Array.isArray(node)) return node.forEach(fitTables);
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown> & Partial<ContentTable>;
  if (n.table?.body?.length) {
    const body = n.table.body as unknown[][];
    const cols = Math.max(...body.map((r) => r.length));
    const len = Array.from({ length: cols }, (_, c) =>
      Math.max(0, ...body.map((r) => (r[c] && !(r[c] as { colSpan?: number }).colSpan ? textOf(r[c]).length : 0))),
    );
    const widest = len.indexOf(Math.max(...len));
    const preset = n.table.widths;
    const keep = Array.isArray(preset) && preset.length === cols && preset.every((w) => typeof w === 'string' && w.endsWith('%'));
    // Chỉ chênh vài ký tự (vd "ĐẠI DIỆN BÊN A " so với "ĐẠI DIỆN BÊN B") mà để một cột '*', cột kia 'auto' thì cột '*'
    // nuốt gần hết bề ngang và cả hai khối bị đẩy lệch sang phải.
    const even = cols > 1 && Math.min(...len) > 0 && Math.max(...len) <= 2 * Math.min(...len);
    if (!keep) n.table.widths = len.map((_, c) => (even || c === widest ? '*' : 'auto'));
    // Cột nhãn ngắn ("Tên cơ quan", "Mã số thuế", "ĐVT"…) không xuống dòng – pdfmake hay bóp cột 'auto' để nhường cột '*'.
    body.forEach((row) =>
      row.forEach((cell, c) => {
        const x = cell as { colSpan?: number; noWrap?: boolean } | null;
        if (!keep && !even && c !== widest && len[c] <= 30 && x && typeof x === 'object' && !x.colSpan) x.noWrap = true;
      }),
    );
    // Bảng đặt "Ẩn viền bảng" trong trình soạn thảo (class borderless) – html-to-pdfmake đưa class vào style.
    const line = ([] as unknown[]).concat(n.style ?? []).includes('borderless') ? 0 : 0.5;
    n.layout = {
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      hLineWidth: () => line,
      vLineWidth: () => line,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    };
    body.forEach((row) => row.forEach(fitTables));
    return;
  }
  for (const v of Object.values(n)) if (v && typeof v === 'object') fitTables(v);
}
