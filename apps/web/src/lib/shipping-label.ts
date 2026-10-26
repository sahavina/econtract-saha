'use client';

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/** Phiếu gửi hàng dán thùng (gửi chành xe): người gửi, lưu ý, người nhận, điện thoại, ghi chú. */
export interface ShippingLabel {
  from: { contact: string; phone: string; company: string; address: string };
  warning: string;
  to: { company: string; contact: string; address: string; phones: string };
  note: string;
  /** Số thùng: in mỗi thùng một phiếu, kèm "Thùng i/N" khi showBoxNumber. */
  boxes: number;
  showBoxNumber: boolean;
  /** A4 ngang 1 phiếu/trang, hoặc A4 dọc 2 phiếu/trang (cắt đôi). */
  layout: 'A4' | 'A5x2';
}

export const DEFAULT_WARNING = 'HÀNG DỄ VỠ - XIN NHẸ TAY';
export const DEFAULT_NOTE = '(ĐIỆN THOẠI TRƯỚC KHI GIAO HÀNG)';

const fontUrl = (file: string) => `${window.location.origin}/fonts/tinos/${file}`;
const MM = 72 / 25.4;

/** Dòng "FROM: Chị Trinh – TPHCM – 0902 38 05 38": nhãn gạch chân, số điện thoại to hơn. */
function fromLine(l: ShippingLabel, s: number): Content {
  const who = l.from.contact.trim().toUpperCase();
  const phone = l.from.phone.trim();
  return {
    text: [
      { text: 'FROM:', decoration: 'underline' },
      { text: '    ' },
      ...(who ? [{ text: who }] : []),
      ...(who && phone ? [{ text: ' – ' }] : []),
      ...(phone ? [{ text: phone, fontSize: 26 * s }] : []),
    ],
    fontSize: 22 * s,
    bold: true,
    alignment: 'center',
  };
}

/** width: bề rộng vùng in (pt) — dòng lưu ý tự thu nhỏ để luôn nằm trên một dòng. */
function labelContent(l: ShippingLabel, s: number, box: number, width: number): Content[] {
  const line = (text: string, size: number, extra: Partial<{ margin: [number, number, number, number] }> = {}): Content[] =>
    text.trim() ? [{ text: text.trim().toUpperCase(), fontSize: size * s, bold: true, alignment: 'center', ...extra }] : [];
  // Tinos Bold chữ hoa rộng trung bình ~0.68em.
  const warningSize = Math.min(50, width / s / (Math.max(1, l.warning.trim().length) * 0.68));
  const toTitle = [l.to.company.trim(), l.to.contact.trim()].filter(Boolean).join(' – ').toUpperCase();
  return [
    ...(l.showBoxNumber && l.boxes > 1 ? [{ text: `Thùng ${box}/${l.boxes}`, fontSize: 16 * s, bold: true, alignment: 'right' as const }] : []),
    fromLine(l, s),
    ...line(l.from.company, 24, { margin: [0, 4 * s, 0, 0] }),
    ...line(l.from.address, 19, { margin: [0, 4 * s, 0, 0] }),
    ...line(l.warning, warningSize, { margin: [0, 18 * s, 0, 18 * s] }),
    {
      text: [{ text: 'TO:', decoration: 'underline' }, { text: ` ${toTitle}` }],
      fontSize: 24 * s,
      bold: true,
      alignment: 'center',
    },
    ...line(l.to.address, 19, { margin: [0, 4 * s, 0, 0] }),
    ...line(l.to.phones, 32, { margin: [0, 6 * s, 0, 0] }),
    ...line(l.note, 26, { margin: [0, 20 * s, 0, 0] }),
  ];
}

async function createPdf(l: ShippingLabel) {
  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(`${window.location.origin}/`));
  pdfMake.setFonts({
    Tinos: { normal: fontUrl('Tinos-Regular.ttf'), bold: fontUrl('Tinos-Bold.ttf'), italics: fontUrl('Tinos-Italic.ttf'), bolditalics: fontUrl('Tinos-BoldItalic.ttf') },
  });
  const boxes = Math.max(1, Math.min(200, Math.floor(l.boxes) || 1));
  const content: Content[] = [];
  if (l.layout === 'A4') {
    // A4 ngang: mỗi thùng một trang, chữ lớn.
    for (let b = 1; b <= boxes; b++) {
      content.push({ stack: labelContent(l, 1, b, (297 - 36) * MM), unbreakable: true, margin: [0, 22 * MM, 0, 0], ...(b < boxes && { pageBreak: 'after' as const }) });
    }
  } else {
    // A4 dọc: 2 phiếu/trang, mỗi phiếu nửa trang, đường cắt nét đứt ở giữa.
    for (let b = 1; b <= boxes; b++) {
      const top = b % 2 === 1;
      content.push({
        table: { widths: ['*'], heights: [128 * MM], dontBreakRows: true, body: [[{ stack: labelContent(l, 0.75, b, (210 - 24) * MM), margin: [0, 14 * MM, 0, 0] }]] },
        layout: {
          hLineWidth: (i: number) => (top && i === 1 && b < boxes ? 0.8 : 0),
          vLineWidth: () => 0,
          hLineStyle: () => ({ dash: { length: 4, space: 3 } }),
          hLineColor: () => '#999999',
        },
        ...(!top && b < boxes && { pageBreak: 'after' as const }),
      });
    }
  }
  const doc: TDocumentDefinitions = {
    info: { title: `Phiếu gửi hàng – ${l.to.company || 'SAHA'}`, creator: 'SAHA eContract' },
    pageSize: 'A4',
    pageOrientation: l.layout === 'A4' ? 'landscape' : 'portrait',
    pageMargins: l.layout === 'A4' ? [18 * MM, 15 * MM, 18 * MM, 15 * MM] : [12 * MM, 10 * MM, 12 * MM, 10 * MM],
    defaultStyle: { font: 'Tinos', lineHeight: 1.15 },
    content,
  };
  return pdfMake.createPdf(doc);
}

const fileName = (l: ShippingLabel) => `Phieu gui hang - ${(l.to.company || 'SAHA').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}.pdf`;

export async function downloadShippingLabel(l: ShippingLabel) {
  await (await createPdf(l)).download(fileName(l));
}

/** Mở PDF trong tab mới để in (máy in nhãn/A4). */
export async function openShippingLabel(l: ShippingLabel) {
  const blob = await (await createPdf(l)).getBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
