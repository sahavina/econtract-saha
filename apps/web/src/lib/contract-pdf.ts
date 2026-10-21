'use client';

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { type DocSigner, ROLE_LABELS } from '@/components/signed-document';
import { formatDateTime } from '@/lib/format';
import { fitTables } from '@/lib/pdf-tables';

/**
 * Tạo PDF hợp đồng ngay trong trình duyệt (chữ thật, chọn/tìm kiếm được) và tải về,
 * không phụ thuộc hộp thoại in – trình duyệt nhúng thường không hiển thị hộp thoại in.
 * Thư viện (~1 MB) và font chỉ được tải khi người dùng bấm "Tải PDF".
 */

const MM = 72 / 25.4;
const MARGIN = 20 * MM;

/** Font Tinos (cùng kích thước chữ với Times New Roman, đủ dấu tiếng Việt) phục vụ từ /public/fonts. */
const fontUrl = (file: string) => `${window.location.origin}/fonts/tinos/${file}`;

/** Bảng có độ rộng cột (px) trong <colgroup> ⇒ ghi tỉ lệ % vào data-pdfmake để PDF giữ đúng tỉ lệ như trên màn hình. */
function withColumnPercents(html: string): string {
  if (!html.includes('<colgroup')) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const cols = Array.from(table.querySelectorAll(':scope > colgroup > col')).map((c) => parseFloat((c as HTMLElement).style.width));
    const total = cols.reduce((a, b) => a + b, 0);
    if (!cols.length || cols.some((w) => !(w > 0))) continue;
    table.setAttribute('data-pdfmake', JSON.stringify({ widths: cols.map((w) => `${((w / total) * 100).toFixed(2)}%`) }));
  }
  return doc.body.firstElementChild?.innerHTML ?? html;
}

function signatureBlock(s: DocSigner): Content {
  const mark: Content =
    s.status !== 'SIGNED' || !s.signatureImage
      ? {
          text: s.status === 'REJECTED' ? 'Đã từ chối ký' : s.method === 'MISA_ESIGN' ? 'Ký số MISA eSign (trang Chữ ký số)' : 'Chưa ký',
          color: '#888888',
          fontSize: 9,
          margin: [0, 22, 0, 22],
        }
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

/** Trang cuối dành cho chữ ký số: khung chữ ký MISA eSign đặt ở góc dưới phải, xếp chồng theo thứ tự ký. */
function digitalPage(names: string[]): Content[] {
  return [
    { text: 'CHỮ KÝ SỐ', bold: true, fontSize: 14, alignment: 'center', pageBreak: 'before', margin: [0, 0, 0, 8] },
    {
      text: `Văn bản được ký bằng chữ ký số (chứng thư số MISA eSign) của: ${names.join(', ')}. Kiểm tra chữ ký số bằng Adobe Acrobat Reader hoặc phần mềm đọc PDF có hỗ trợ chữ ký số; mọi chỉnh sửa sau khi ký sẽ làm chữ ký mất hiệu lực.`,
      fontSize: 10,
      color: '#444444',
    },
  ];
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
  /** Bản để ký số: thêm trang cuối "Chữ ký số" dành chỗ cho khung chữ ký MISA eSign (không đè lên nội dung). */
  digitalSigners?: string[];
}

async function createContractPdf({ title, html, signed, digitalSigners }: Omit<ContractPdfInput, 'fileName'>) {
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
  // Dấu câu toàn chiều rộng (vd "：" trong file Word gõ bằng bộ gõ Trung/Nhật) không có trong font Tinos ⇒ đổi về ký tự thường.
  const clean = withColumnPercents(
    html
      .replace(/<mark\b[^>]*>/g, '')
      .replace(/<\/mark>/g, '')
      .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)),
  );
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
    content: [...body, ...(signed ? signedSection(signed.documentHash, signed.signers) : []), ...(digitalSigners?.length ? digitalPage(digitalSigners) : [])],
  };
  return pdfMake.createPdf(doc);
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_');

export async function downloadContractPdf({ fileName, ...input }: ContractPdfInput) {
  await (await createContractPdf(input)).download(`${safeName(fileName)}.pdf`);
}

/** Tạo PDF dưới dạng File (để lưu vào tab Tài liệu, ví dụ trước khi ký số). */
export async function contractPdfFile({ fileName, ...input }: ContractPdfInput) {
  const blob = await (await createContractPdf(input)).getBlob();
  return new File([blob], `${safeName(fileName)}.pdf`, { type: 'application/pdf' });
}
