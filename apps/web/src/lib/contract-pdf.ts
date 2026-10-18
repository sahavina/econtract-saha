'use client';

import type { Content, ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces';
import { type DocSigner, ROLE_LABELS } from '@/components/signed-document';
import { formatDateTime } from '@/lib/format';

/**
 * Tạo PDF hợp đồng ngay trong trình duyệt (chữ thật, chọn/tìm kiếm được) và tải về,
 * không phụ thuộc hộp thoại in – trình duyệt nhúng thường không hiển thị hộp thoại in.
 * Thư viện (~1 MB) và font chỉ được tải khi người dùng bấm "Tải PDF".
 */

const MM = 72 / 25.4;
const MARGIN = 20 * MM;
const BORDER = '#999999';

/** Font Tinos (cùng kích thước chữ với Times New Roman, đủ dấu tiếng Việt) phục vụ từ /public/fonts. */
const fontUrl = (file: string) => `${window.location.origin}/fonts/tinos/${file}`;

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    return textOf(n.text ?? n.stack ?? '');
  }
  return '';
}

/** Bảng chiếm hết bề ngang: cột có nội dung dài nhất co giãn ('*'), các cột khác vừa nội dung. */
function fitTables(node: unknown) {
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
    n.table.widths = len.map((_, c) => (c === widest ? '*' : 'auto'));
    n.layout = {
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
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

function signatureBlock(s: DocSigner): Content {
  const mark: Content =
    s.status !== 'SIGNED' || !s.signatureImage
      ? { text: s.status === 'REJECTED' ? 'Đã từ chối ký' : 'Chưa ký', color: '#888888', fontSize: 9, margin: [0, 22, 0, 22] }
      : s.signatureImage.startsWith('text:')
        ? { text: s.signatureImage.slice(5), italics: true, fontSize: 18, color: '#1e3a8a', margin: [0, 16, 0, 16] }
        : { image: s.signatureImage, fit: [150, 56], alignment: 'center', margin: [0, 4, 0, 4] };
  return {
    stack: [
      { text: s.partyRole ? ROLE_LABELS[s.partyRole] : 'NGƯỜI KÝ', bold: true },
      ...(s.title ? [{ text: s.title, italics: true }] : []),
      mark,
      { text: s.name, bold: true },
      ...(s.signedAt && s.status === 'SIGNED' ? [{ text: `Ký điện tử lúc ${formatDateTime(s.signedAt)}`, fontSize: 8, color: '#555555' }] : []),
    ],
    alignment: 'center',
    unbreakable: true,
  };
}

function signedSection(documentHash: string, signers: DocSigner[]): Content[] {
  const rank = (r: DocSigner['partyRole']) => (r ? ['PARTY_A', 'PARTY_B', 'PARTY_C', 'RELATED'].indexOf(r) : 9);
  const ordered = [...signers].sort((a, b) => rank(a.partyRole) - rank(b.partyRole));
  const rows: Content[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    const pair = ordered.slice(i, i + 2).map(signatureBlock);
    rows.push({ columns: pair.length === 2 ? pair : [pair[0], { text: '' }], columnGap: 24, margin: [0, 24, 0, 0] });
  }
  const signed = ordered.filter((s) => s.status === 'SIGNED');
  const method = (m?: string) => (m === 'EMAIL_OTP' ? 'OTP qua email' : m === 'INTERNAL_PASSWORD' ? 'Tài khoản + mật khẩu' : '—');
  const cell = (text: string, bold = false) => ({ text, bold, fontSize: 8, ...(bold && { fillColor: '#f3f3f3' }) });
  const certificate: Content[] = signed.length
    ? [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595.28 - 2 * MARGIN, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 28, 0, 8] },
        { text: 'CHỨNG THƯ KÝ ĐIỆN TỬ', bold: true, fontSize: 9, margin: [0, 0, 0, 4] },
        { text: `Mã băm SHA-256 của văn bản: ${documentHash}`, fontSize: 8, margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Người ký', 'Email', 'Phương thức', 'Thời điểm', 'IP', 'Khớp mã băm'].map((h) => cell(h, true)),
              ...signed.map((s) => [
                cell(s.name),
                cell(s.email ?? '—'),
                cell(method(s.method)),
                cell(formatDateTime(s.signedAt)),
                cell(s.ip ?? '—'),
                cell(s.signedHash ? (s.signedHash === documentHash ? 'Có' : 'Không') : '—'),
              ]),
            ],
          },
          layout: { hLineColor: () => '#cccccc', vLineColor: () => '#cccccc', hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        },
      ]
    : [];
  return [...rows, ...certificate];
}

export interface ContractPdfInput {
  /** Tên file tải về (không gồm .pdf). */
  fileName: string;
  title: string;
  /** HTML nội dung đã thay biến (bản xem trước) hoặc snapshot đã ký. */
  html: string;
  signed?: { documentHash: string; signers: DocSigner[] };
}

export async function downloadContractPdf({ fileName, title, html, signed }: ContractPdfInput) {
  const [{ default: pdfMake }, { default: htmlToPdfmake }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('html-to-pdfmake'),
  ]);
  // Chỉ cho phép tải font/ảnh từ chính ứng dụng (ảnh chữ ký là data URL, không cần mạng).
  pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(`${window.location.origin}/`));
  pdfMake.setFonts({
    Tinos: {
      normal: fontUrl('Tinos-Regular.ttf'),
      bold: fontUrl('Tinos-Bold.ttf'),
      italics: fontUrl('Tinos-Italic.ttf'),
      bolditalics: fontUrl('Tinos-BoldItalic.ttf'),
    },
  });

  // Ô highlight biến thiếu dữ liệu chỉ có ý nghĩa trên màn hình.
  const clean = html.replace(/<mark\b[^>]*>/g, '').replace(/<\/mark>/g, '');
  const body = htmlToPdfmake(clean, {
    window,
    removeExtraBlanks: true,
    defaultStyles: {
      p: { margin: [0, 0, 0, 5] },
      h1: { fontSize: 17, bold: true, margin: [0, 6, 0, 6] },
      h2: { fontSize: 15, bold: true, margin: [0, 6, 0, 4] },
      h3: { fontSize: 13, bold: true, margin: [0, 6, 0, 4] },
      h4: { fontSize: 12, bold: true, margin: [0, 4, 0, 3] },
      table: { margin: [0, 2, 0, 8] },
      th: { bold: true, fillColor: '#f3f3f3' },
      a: { color: '#1d4ed8', decoration: 'underline' },
    },
  }) as Content[];
  fitTables(body);

  const doc: TDocumentDefinitions = {
    info: { title, creator: 'SAHA eContract' },
    pageSize: 'A4',
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    defaultStyle: { font: 'Tinos', fontSize: 12, lineHeight: 1.25 },
    footer: (current, total) => ({ text: `${current}/${total}`, alignment: 'center', fontSize: 8, color: '#888888', margin: [0, 20, 0, 0] }),
    content: [...body, ...(signed ? signedSection(signed.documentHash, signed.signers) : [])],
  };
  await pdfMake.createPdf(doc).download(`${fileName.replace(/[\\/:*?"<>|]+/g, '_')}.pdf`);
}
