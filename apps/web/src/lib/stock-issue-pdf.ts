'use client';

import { amountInWordsVnd, formatQtyVi } from '@saha/shared';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { StockIssueDetail } from '@/lib/types';

/** Phiếu xuất kho theo Mẫu số 02 - VT (Thông tư 200/2014/TT-BTC). */
export interface StockIssueCompany {
  name: string;
  address?: string | null;
}

const fontUrl = (file: string) => `${window.location.origin}/fonts/tinos/${file}`;
const MM = 72 / 25.4;
const money = (v: string | number) => formatQtyVi(String(Math.round(Number(v) || 0)));
const qty = (v: string) => formatQtyVi(v);

function dateParts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `Ngày ${d} tháng ${m} năm ${y}`;
}

function content(issue: StockIssueDetail, company: StockIssueCompany): Content[] {
  const line = (label: string, value: string | null | undefined, extra?: Content[]): Content => ({
    text: [{ text: `- ${label}: ` }, { text: value?.trim() || '……………………………………', bold: !!value?.trim() }, ...((extra ?? []) as never[])],
    margin: [0, 2, 0, 2],
  });
  const th = (text: string) => ({ text, bold: true, alignment: 'center' as const, fontSize: 10 });
  const td = (text: string, align: 'left' | 'right' | 'center' = 'left'): TableCell => ({ text, alignment: align, fontSize: 10.5 });
  const body: TableCell[][] = [
    [
      { ...th('STT'), rowSpan: 2 },
      { ...th('Tên, nhãn hiệu, quy cách, phẩm chất vật tư, dụng cụ, sản phẩm, hàng hóa'), rowSpan: 2 },
      { ...th('Mã số'), rowSpan: 2 },
      { ...th('Đơn vị tính'), rowSpan: 2 },
      { ...th('Số lượng'), colSpan: 2 },
      {},
      { ...th('Đơn giá'), rowSpan: 2 },
      { ...th('Thành tiền'), rowSpan: 2 },
    ],
    [{}, {}, {}, {}, th('Yêu cầu'), th('Thực xuất'), {}, {}],
    ['A', 'B', 'C', 'D', '1', '2', '3', '4'].map((t) => ({ text: t, alignment: 'center', italics: true, fontSize: 9.5 })),
    ...issue.items.map((i, k) => [
      td(String(k + 1), 'center'),
      td(i.name),
      td(i.code ?? '', 'center'),
      td(i.unit ?? '', 'center'),
      td(qty(i.requestedQty), 'right'),
      td(qty(i.quantity), 'right'),
      td(money(i.unitPrice), 'right'),
      td(money(i.amount), 'right'),
    ]),
    [
      td(''),
      { text: 'Cộng', bold: true, alignment: 'center', fontSize: 10.5 },
      td('x', 'center'),
      td('x', 'center'),
      td('x', 'center'),
      td('x', 'center'),
      td('x', 'center'),
      { text: money(issue.totalAmount), bold: true, alignment: 'right', fontSize: 10.5 },
    ],
  ];
  const total = Math.round(Number(issue.totalAmount) || 0);
  const sign = (title: string, note = '(Ký, họ tên)'): Content => ({
    stack: [
      { text: title, bold: true, alignment: 'center', fontSize: 10.5 },
      { text: note, italics: true, alignment: 'center', fontSize: 9.5 },
    ],
  });

  return [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: [{ text: 'Đơn vị: ' }, { text: company.name, bold: true }] },
            { text: `Bộ phận: ${issue.warehouse ?? ''}` },
          ],
          fontSize: 10.5,
        },
        {
          width: 230,
          stack: [
            { text: 'Mẫu số 02 - VT', bold: true },
            { text: '(Ban hành theo Thông tư số 200/2014/TT-BTC', italics: true, fontSize: 9.5 },
            { text: 'Ngày 22/12/2014 của Bộ Tài chính)', italics: true, fontSize: 9.5 },
          ],
          alignment: 'center',
        },
      ],
    },
    {
      columns: [
        { width: 120, text: '' },
        {
          width: '*',
          stack: [
            { text: 'PHIẾU XUẤT KHO', bold: true, fontSize: 17, alignment: 'center', margin: [0, 10, 0, 2] },
            { text: dateParts(issue.issueDate), italics: true, alignment: 'center' },
            { text: `Số: ${issue.code}`, alignment: 'center' },
          ],
        },
        {
          width: 120,
          stack: [{ text: `Nợ: ${issue.debitAccount ?? '…………'}` }, { text: `Có: ${issue.creditAccount ?? '…………'}` }],
          margin: [10, 32, 0, 0],
          fontSize: 10.5,
        },
      ],
    },
    {
      margin: [0, 10, 0, 6],
      stack: [
        line('Họ và tên người nhận hàng', issue.receiverName, [
          { text: '   Địa chỉ (bộ phận): ' },
          { text: [issue.receiverUnit, issue.receiverAddress].filter(Boolean).join(' – ') || '……………………', bold: !!(issue.receiverUnit || issue.receiverAddress) },
        ] as Content[]),
        line('Lý do xuất kho', issue.reason),
        line('Xuất tại kho (ngăn lô)', issue.warehouse, [
          { text: '   Địa điểm: ' },
          { text: issue.warehouseAddress || '……………………', bold: !!issue.warehouseAddress },
        ] as Content[]),
      ],
    },
    {
      table: { headerRows: 3, widths: [24, '*', 52, 44, 50, 50, 62, 72], body },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, paddingTop: () => 3, paddingBottom: () => 3 },
    },
    {
      margin: [0, 8, 0, 0],
      stack: [
        { text: [{ text: '- Tổng số tiền (viết bằng chữ): ' }, { text: total ? amountInWordsVnd(String(total)) : '……………………', bold: true, italics: true }] },
        { text: `- Số chứng từ gốc kèm theo: ${issue.attachments || (issue.order ? `Đơn đặt hàng ${issue.order.code}` : '……………………')}` },
      ],
    },
    { text: dateParts(issue.issueDate), italics: true, alignment: 'right', margin: [0, 10, 0, 6] },
    {
      columns: [
        sign('Người lập phiếu'),
        sign('Người nhận hàng'),
        sign('Thủ kho'),
        sign('Kế toán trưởng', '(Hoặc bộ phận có nhu cầu nhập)\n(Ký, họ tên)'),
        sign('Giám đốc', '(Ký, họ tên, đóng dấu)'),
      ],
      columnGap: 6,
    },
    { text: issue.createdBy.fullName, alignment: 'left', bold: true, margin: [8, 52, 0, 0], fontSize: 10.5 },
  ];
}

async function createPdf(issue: StockIssueDetail, company: StockIssueCompany) {
  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(`${window.location.origin}/`));
  pdfMake.setFonts({
    Tinos: { normal: fontUrl('Tinos-Regular.ttf'), bold: fontUrl('Tinos-Bold.ttf'), italics: fontUrl('Tinos-Italic.ttf'), bolditalics: fontUrl('Tinos-BoldItalic.ttf') },
  });
  const doc: TDocumentDefinitions = {
    info: { title: `Phiếu xuất kho ${issue.code}`, creator: 'SAHA eContract' },
    pageSize: 'A4',
    pageMargins: [15 * MM, 12 * MM, 12 * MM, 12 * MM],
    defaultStyle: { font: 'Tinos', fontSize: 11.5, lineHeight: 1.2 },
    ...(issue.status === 'CANCELLED' && {
      watermark: { text: 'ĐÃ HỦY', color: '#cc0000', opacity: 0.18, bold: true },
    }),
    content: content(issue, company),
  };
  return pdfMake.createPdf(doc);
}

export async function downloadStockIssuePdf(issue: StockIssueDetail, company: StockIssueCompany) {
  await (await createPdf(issue, company)).download(`Phieu xuat kho ${issue.code}.pdf`);
}

export async function openStockIssuePdf(issue: StockIssueDetail, company: StockIssueCompany) {
  const url = URL.createObjectURL(await (await createPdf(issue, company)).getBlob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
