'use client';

import { amountInWordsVnd, escapeHtml as esc, formatDateVi, formatQtyVi, orderItemsTableHtml } from '@saha/shared';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CompanyProfile } from '@/lib/company';
import { downloadWordHtml } from '@/lib/payment-request';
import { setupPdfFonts } from '@/lib/pdf-fonts';
import type { QuoteDetail } from '@/lib/types';

/**
 * Báo giá gửi khách (mẫu chuẩn doanh nghiệp): đầu trang thông tin công ty + số/ngày báo giá, khung khách hàng,
 * bảng hàng hóa (tiêu đề lặp lại khi sang trang), cộng tiền – thuế – tổng và số tiền bằng chữ, điều kiện,
 * tài khoản ngân hàng, chữ ký đại diện; chân trang có số báo giá và số trang.
 */

const MM = 72 / 25.4;
const ACCENT = '#1e3a8a';
const MUTED = '#555555';
const LINE = '#c7cbd6';
const HEAD_FILL = '#e8edf8';

const up = (s: string | null | undefined) => (s ?? '').trim().toLocaleUpperCase('vi-VN');
const money = (v: string | number | null | undefined) => formatQtyVi(String(Math.round(Number(v) || 0)));
const has = (s: string | null | undefined): s is string => !!s?.trim();

/** Dòng "Nhãn: giá trị" trong khung thông tin (bỏ qua khi trống). */
const infoRows = (rows: [string, string | null | undefined][]) =>
  rows.filter(([, v]) => has(v)).map(([label, v]) => [{ text: label, color: MUTED }, { text: v!.trim() }]);

function header(q: QuoteDetail, c: CompanyProfile | undefined): Content {
  const lines = infoRows([
    ['Địa chỉ', c?.address],
    ['Mã số thuế', c?.taxCode],
    ['Điện thoại', c?.phone],
    ['Email', c?.email],
  ]).map(([l, v]) => ({ text: [{ text: `${l.text}: `, color: MUTED }, v.text], fontSize: 9.5 }));
  return {
    columns: [
      { width: '*', stack: [{ text: up(c?.name), bold: true, fontSize: 12.5, color: ACCENT, margin: [0, 0, 0, 3] }, ...lines] },
      {
        width: 170,
        alignment: 'right',
        stack: [
          { text: 'BÁO GIÁ', bold: true, fontSize: 24, color: ACCENT, characterSpacing: 1 },
          { text: 'QUOTATION', fontSize: 8.5, color: MUTED, characterSpacing: 2, margin: [0, 0, 0, 6] },
          {
            table: {
              widths: ['*', 'auto'],
              body: [
                [{ text: 'Số:', color: MUTED }, { text: q.code, bold: true }],
                [{ text: 'Ngày:', color: MUTED }, formatDateVi(q.date) ?? ''],
                ...(q.validUntil ? [[{ text: 'Hiệu lực đến:', color: MUTED }, formatDateVi(q.validUntil) ?? '']] : []),
              ],
            },
            layout: 'noBorders',
            fontSize: 10,
          },
        ],
      },
    ],
    columnGap: 16,
  };
}

const rule = (color = ACCENT, width = 1.5): Content => ({
  // Bề ngang vùng nội dung: A4 210 mm trừ lề trái/phải 18 mm.
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: (210 - 36) * MM, y2: 0, lineWidth: width, lineColor: color }],
  margin: [0, 8, 0, 10],
});

function customerBox(q: QuoteDetail): Content {
  const rows = infoRows([
    ['Địa chỉ', q.customerAddress],
    ['Mã số thuế', q.customerTaxCode],
    ['Người liên hệ', q.customerContact],
    ['Điện thoại', q.customerPhone],
    ['Email', q.customerEmail],
  ]);
  return {
    table: {
      widths: [90, '*'],
      body: [
        [{ text: 'KÍNH GỬI', bold: true, color: ACCENT, fontSize: 9.5 }, { text: q.customerName, bold: true, fontSize: 11.5 }],
        ...rows,
      ],
    },
    layout: {
      fillColor: () => '#f6f8fc',
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
      vLineColor: () => ACCENT,
      paddingLeft: (i: number) => (i === 0 ? 10 : 4),
      paddingTop: (i: number) => (i === 0 ? 7 : 1.5),
      paddingBottom: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length - 1 ? 7 : 1.5),
    },
    fontSize: 10,
    margin: [0, 0, 0, 10],
  };
}

function itemsTable(q: QuoteDetail): Content {
  const th = (text: string, alignment: 'left' | 'center' | 'right' = 'center') => ({ text, bold: true, alignment, color: ACCENT, fontSize: 9.5 });
  const body: TableCell[][] = [
    [th('STT'), th('Mã hàng', 'left'), th('Tên hàng hóa, dịch vụ', 'left'), th('ĐVT'), th('Số lượng', 'right'), th('Đơn giá', 'right'), th('Thành tiền', 'right')],
    ...q.items.map((i, k) => [
      { text: String(k + 1), alignment: 'center' as const },
      { text: i.code ?? '', fontSize: 9 },
      { text: i.name },
      { text: i.unit ?? '', alignment: 'center' as const },
      { text: formatQtyVi(i.quantity), alignment: 'right' as const },
      { text: money(i.unitPrice), alignment: 'right' as const },
      { text: money(i.amount), alignment: 'right' as const },
    ]),
  ];
  const sum = (label: string, value: string, strong = false): TableCell[] => [
    { text: label, colSpan: 6, alignment: 'right', bold: strong, color: strong ? ACCENT : undefined },
    '',
    '',
    '',
    '',
    '',
    { text: value, alignment: 'right', bold: true, color: strong ? ACCENT : undefined },
  ];
  const hasVat = q.vatRate !== null && q.vatRate !== '' && q.vatAmount !== null;
  const footer = [
    sum(hasVat ? 'Cộng tiền hàng' : 'Tổng cộng', money(q.subtotal), !hasVat),
    ...(hasVat ? [sum(`Thuế GTGT (${formatQtyVi(q.vatRate)}%)`, money(q.vatAmount)), sum('TỔNG CỘNG THANH TOÁN', money(q.total), true)] : []),
  ];
  const itemRows = q.items.length;
  return {
    table: { headerRows: 1, widths: [24, 52, '*', 34, 48, 66, 74], body: [...body, ...footer], dontBreakRows: true },
    layout: {
      fillColor: (row: number) => (row === 0 ? HEAD_FILL : row > itemRows ? '#f6f8fc' : row % 2 === 0 ? '#fbfcfe' : null),
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === itemRows + 1 || i === node.table.body.length ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? ACCENT : LINE),
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    fontSize: 9.5,
  };
}

function terms(q: QuoteDetail, c: CompanyProfile | undefined): Content[] {
  const items: [string, string | null | undefined][] = [
    ['Hiệu lực báo giá', q.validUntil ? `Đến hết ngày ${formatDateVi(q.validUntil)}` : null],
    ['Điều kiện thanh toán', q.paymentTerms],
    ['Điều kiện giao hàng', q.deliveryTerms],
    ['Tài khoản thanh toán', c?.bankAccount ? `${c.bankAccount.trim()}${c.name ? ` – Chủ tài khoản: ${up(c.name)}` : ''}` : null],
    ['Ghi chú', q.note],
  ];
  const rows = items.filter(([, v]) => has(v));
  if (!rows.length) return [];
  return [
    { text: 'ĐIỀU KHOẢN & GHI CHÚ', bold: true, color: ACCENT, fontSize: 10, margin: [0, 12, 0, 4] },
    {
      table: { widths: [120, '*'], body: rows.map(([l, v]) => [{ text: l, bold: true }, { text: v!.trim() }]) },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingTop: () => 1.5, paddingBottom: () => 1.5 },
      fontSize: 10,
    },
  ];
}

function signature(c: CompanyProfile | undefined): Content {
  return {
    columns: [
      { width: '*', stack: [{ text: 'XÁC NHẬN CỦA KHÁCH HÀNG', bold: true }, { text: '(Ký, ghi rõ họ tên)', italics: true, fontSize: 9, color: MUTED }], alignment: 'center' },
      {
        width: '*',
        alignment: 'center',
        stack: [
          { text: up(c?.name) || 'ĐẠI DIỆN BÊN BÁO GIÁ', bold: true },
          { text: up(c?.position) || 'NGƯỜI ĐẠI DIỆN', bold: true, fontSize: 10 },
          { text: '(Ký, ghi rõ họ tên, đóng dấu)', italics: true, fontSize: 9, color: MUTED, margin: [0, 0, 0, 56] },
          ...(has(c?.representative) ? [{ text: c!.representative!.trim(), bold: true }] : []),
        ],
      },
    ],
    columnGap: 20,
    margin: [0, 20, 0, 0],
    unbreakable: true,
  };
}

export function quotePdfContent(q: QuoteDetail, c: CompanyProfile | undefined): Content[] {
  const total = String(Math.round(Number(q.total) || 0));
  return [
    header(q, c),
    rule(),
    customerBox(q),
    { text: `${up(c?.name) || 'Chúng tôi'} trân trọng cảm ơn Quý khách đã quan tâm và xin gửi báo giá như sau:`, margin: [0, 0, 0, 6] },
    ...(q.items.length ? [itemsTable(q)] : [{ text: 'Chưa có hàng hóa trong báo giá.', italics: true, color: MUTED }]),
    ...(Number(total) ? [{ text: [{ text: 'Bằng chữ: ', bold: true }, { text: amountInWordsVnd(total), italics: true }], margin: [0, 6, 0, 0] } as Content] : []),
    ...terms(q, c),
    { text: 'Rất mong nhận được sự hợp tác của Quý khách. Trân trọng!', margin: [0, 12, 0, 0] },
    signature(c),
  ];
}

async function createPdf(q: QuoteDetail, c: CompanyProfile | undefined) {
  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  const font = await setupPdfFonts(pdfMake);
  const doc: TDocumentDefinitions = {
    info: { title: `Báo giá ${q.code}`, creator: 'SAHA eContract' },
    pageSize: 'A4',
    pageMargins: [18 * MM, 16 * MM, 18 * MM, 18 * MM],
    defaultStyle: { font, fontSize: 10.5, lineHeight: 1.25 },
    footer: (page, pages) => ({
      columns: [
        { text: `Báo giá ${q.code}`, color: MUTED },
        { text: `Trang ${page}/${pages}`, alignment: 'right', color: MUTED },
      ],
      fontSize: 8.5,
      margin: [18 * MM, 6 * MM, 18 * MM, 0],
    }),
    content: quotePdfContent(q, c),
  };
  return pdfMake.createPdf(doc);
}

export const quoteFileName = (q: QuoteDetail) => `Bao gia ${q.code}.pdf`;

export async function downloadQuotePdf(q: QuoteDetail, c: CompanyProfile | undefined) {
  await (await createPdf(q, c)).download(quoteFileName(q));
}

/** PDF báo giá dạng File (đính kèm email). */
export async function quotePdfFile(q: QuoteDetail, c: CompanyProfile | undefined) {
  const blob = await (await createPdf(q, c)).getBlob();
  return new File([blob], quoteFileName(q), { type: 'application/pdf' });
}

// ---------- Bản Word (HTML) – cùng nội dung, bố cục đơn giản để sửa tiếp trong Word ----------

const row = (label: string, value: string | null | undefined) => (value?.trim() ? `<p>${label}: ${esc(value.trim())}</p>` : '');
const block = (label: string, value: string | null | undefined) =>
  value?.trim() ? `<p><strong>${label}:</strong> ${esc(value.trim()).replace(/\n/g, '<br>')}</p>` : '';

export function quoteHtml(q: QuoteDetail, company: CompanyProfile | undefined): string {
  const total = String(Math.round(Number(q.total) || 0));
  return [
    `<p><strong>${esc(up(company?.name))}</strong></p>`,
    row('Địa chỉ', company?.address),
    row('Mã số thuế', company?.taxCode),
    row('Điện thoại', company?.phone),
    row('Email', company?.email),
    '<h2 style="text-align:center">BÁO GIÁ</h2>',
    `<p style="text-align:center">Số: ${esc(q.code)} – Ngày ${esc(formatDateVi(q.date) ?? '')}</p>`,
    `<p><strong>Kính gửi: ${esc(q.customerName)}</strong></p>`,
    row('Địa chỉ', q.customerAddress),
    row('Mã số thuế', q.customerTaxCode),
    row('Người liên hệ', q.customerContact),
    row('Điện thoại', q.customerPhone),
    row('Email', q.customerEmail),
    '<p>Chúng tôi trân trọng cảm ơn Quý khách đã quan tâm và xin gửi báo giá như sau:</p>',
    orderItemsTableHtml(q.items, q.vatRate),
    Number(total) ? `<p><em>Bằng chữ: ${esc(amountInWordsVnd(total))}</em></p>` : '',
    q.validUntil ? `<p><strong>Hiệu lực báo giá:</strong> đến hết ngày ${esc(formatDateVi(q.validUntil) ?? '')}</p>` : '',
    block('Điều kiện thanh toán', q.paymentTerms),
    block('Điều kiện giao hàng', q.deliveryTerms),
    block('Tài khoản thanh toán', company?.bankAccount),
    block('Ghi chú', q.note),
    '<p>Rất mong nhận được sự hợp tác của Quý khách. Trân trọng!</p>',
    `<p style="text-align:right"><strong>${esc(up(company?.position) || 'ĐẠI DIỆN')}</strong></p>`,
    '<p></p><p></p><p></p>',
    `<p style="text-align:right"><strong>${esc(company?.representative ?? '')}</strong></p>`,
  ].join('');
}

export const downloadQuoteWord = (q: QuoteDetail, company: CompanyProfile | undefined) => downloadWordHtml(`Bao gia ${q.code}`, quoteHtml(q, company));
