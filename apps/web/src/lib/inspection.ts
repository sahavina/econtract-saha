'use client';

import { formatDateVi, formatQtyVi, type InspectionItemResult, type InspectionStatus, INSPECTION_STATUS_LABELS } from '@saha/shared';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Tone } from '@/components/list-ui';
import type { CompanyProfile } from '@/lib/company';
import { formatDateTime } from '@/lib/format';
import { setupPdfFonts } from '@/lib/pdf-fonts';
import type { ContractKind, OrderItem } from '@/lib/types';

interface UserRef {
  id: string;
  fullName: string;
  email: string;
}

export interface InspectionListItem {
  id: string;
  code: string;
  content: string;
  dueDate: string | null;
  status: InspectionStatus;
  assigneeId: string;
  requestedById: string;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Lần in phiếu gần nhất, người in, số lần in. */
  printedAt: string | null;
  printCount: number;
  printedBy: UserRef | null;
  createdAt: string;
  assignee: UserRef;
  requestedBy: UserRef;
  /** Hồ sơ được kiểm tra: hợp đồng/đơn, đề nghị thanh toán, hoặc cả hai (đề nghị gắn đơn). */
  contract: InspectionContract | null;
  paymentRequest: InspectionPaymentRequest | null;
}

interface InspectionContract {
  id: string;
  code: string;
  title: string;
  kind: ContractKind;
  status: string;
  parties: { name: string; isInternal: boolean }[];
}

export interface InspectionPaymentRequest {
  id: string;
  number: string;
  date: string;
  company: string;
  recipient: string;
  basis: string | null;
  amount: string;
  status: string;
  contractId: string | null;
}

export interface InspectionDetail extends InspectionListItem {
  itemResults: InspectionItemResult[];
  contract: (InspectionContract & {
    value: string;
    vatRate: string | null;
    currency: string;
    expectedSignDate: string | null;
    deliveryDate: string | null;
    deliveryAddress: string | null;
    owner: { fullName: string } | null;
    items: OrderItem[];
  }) | null;
}

export const INSPECTION_TONE: Record<InspectionStatus, Tone> = {
  PENDING: 'amber',
  IN_PROGRESS: 'sky',
  DONE: 'green',
  ISSUE: 'red',
  CANCELLED: 'gray',
};

const partyOf = (c: Pick<InspectionContract, 'parties'>) => (c.parties.find((p) => !p.isInternal) ?? c.parties[0])?.name ?? '';

/** Hồ sơ được kiểm tra để hiển thị: số, tên, liên kết, khách hàng/đối tác (đề nghị thanh toán: bên nhận đề nghị). */
export function targetOf(r: Pick<InspectionListItem, 'contract' | 'paymentRequest'>) {
  if (r.contract) {
    const c = r.contract;
    return { code: c.code, title: c.title, href: `/contracts/${c.id}`, kind: c.kind === 'ORDER' ? 'Đơn hàng' : 'Hợp đồng', party: partyOf(c) };
  }
  const p = r.paymentRequest;
  return {
    code: p ? `ĐNTT ${p.number}` : '—',
    title: p ? `Đề nghị thanh toán ${p.number}` : '',
    href: p ? `/payment-requests/${p.id}` : '#',
    kind: 'Đề nghị thanh toán',
    party: p?.recipient ?? '',
  };
}

/** Quá hạn: còn mở và hạn xử lý trước hôm nay. */
export function isOverdue(r: Pick<InspectionListItem, 'status' | 'dueDate'>) {
  if (!r.dueDate || !(r.status === 'PENDING' || r.status === 'IN_PROGRESS')) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return r.dueDate.slice(0, 10) < today;
}

// ---------- Phiếu in ----------

const MM = 72 / 25.4;
const ACCENT = '#1e3a8a';
const MUTED = '#555555';
const LINE = '#9aa3b5';

const box = (checked: boolean | null | undefined): Content => ({
  canvas: [
    { type: 'rect', x: 0, y: 0, w: 9, h: 9, lineWidth: 0.8, lineColor: '#333333' },
    ...(checked ? [{ type: 'polyline' as const, points: [{ x: 1.8, y: 4.6 }, { x: 3.8, y: 7 }, { x: 7.5, y: 2 }], lineWidth: 1.3, lineColor: '#111111' }] : []),
  ],
});

/** Phiếu yêu cầu kiểm tra (A4): thông tin hồ sơ, nội dung cần kiểm tra, bảng hàng Đạt/Không đạt, QR mở yêu cầu, chữ ký. */
export async function inspectionSlipPdf(r: InspectionDetail, company: CompanyProfile | undefined, url: string) {
  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  const font = await setupPdfFonts(pdfMake);
  const c = r.contract;
  const t = targetOf(r);
  const pr = r.paymentRequest;
  const results = new Map(r.itemResults.map((x) => [x.itemId, x]));
  const info = (label: string, value: string | null | undefined): TableCell[] => [{ text: label, color: MUTED }, { text: value?.trim() || '—' }];

  const itemsTable: Content = c?.items.length
    ? {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [20, 50, '*', 34, 42, 30, 38, 90],
          body: [
            ['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT', 'SL', 'Đạt', 'K. đạt', 'Ghi chú'].map((t) => ({ text: t, bold: true, fontSize: 9, alignment: 'center' as const, fillColor: '#e8edf8', color: ACCENT })),
            ...c.items.map((i, k): TableCell[] => {
              const res = results.get(i.id);
              return [
                { text: String(k + 1), alignment: 'center' },
                { text: i.code ?? '', fontSize: 8.5 },
                { text: i.name },
                { text: i.unit ?? '', alignment: 'center' },
                { text: formatQtyVi(i.quantity), alignment: 'right' },
                { stack: [box(res?.ok === true)], alignment: 'center', margin: [8, 1, 0, 0] },
                { stack: [box(res?.ok === false)], alignment: 'center', margin: [12, 1, 0, 0] },
                { text: res?.note ?? '', fontSize: 8.5 },
              ];
            }),
          ],
        },
        layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 4, paddingBottom: () => 4 },
        fontSize: 9.5,
      }
    : { text: 'Hồ sơ không có dòng hàng – kiểm tra theo nội dung yêu cầu.', italics: true, color: MUTED };

  const writeLines = (n: number): Content => ({
    canvas: Array.from({ length: n }, (_, k) => ({ type: 'line' as const, x1: 0, y1: 16 + k * 18, x2: (210 - 36) * MM, y2: 16 + k * 18, lineWidth: 0.4, lineColor: LINE, dash: { length: 2 } })),
    margin: [0, 0, 0, 4],
  });

  const doc: TDocumentDefinitions = {
    info: { title: `Phiếu kiểm tra ${r.code}`, creator: 'SAHA eContract' },
    pageSize: 'A4',
    pageMargins: [18 * MM, 15 * MM, 18 * MM, 16 * MM],
    defaultStyle: { font, fontSize: 10.5, lineHeight: 1.25 },
    footer: (page, pages) => ({
      columns: [{ text: `Phiếu kiểm tra ${r.code}`, color: MUTED }, { text: `Trang ${page}/${pages}`, alignment: 'right', color: MUTED }],
      fontSize: 8.5,
      margin: [18 * MM, 6 * MM, 18 * MM, 0],
    }),
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: (company?.name ?? '').toLocaleUpperCase('vi-VN'), bold: true, color: ACCENT, fontSize: 11 },
              { text: 'PHIẾU YÊU CẦU KIỂM TRA', bold: true, fontSize: 18, margin: [0, 8, 0, 2] },
              { text: [{ text: 'Số: ', color: MUTED }, { text: r.code, bold: true }, { text: `   ·   Ngày lập: ${formatDateVi(r.createdAt) ?? ''}`, color: MUTED }] },
              { text: `Trạng thái: ${INSPECTION_STATUS_LABELS[r.status]}`, color: MUTED, fontSize: 9.5, margin: [0, 2, 0, 0] },
            ],
          },
          { width: 92, stack: [{ qr: url, fit: 88, foreground: '#111111' }, { text: 'Quét để mở yêu cầu', fontSize: 7.5, color: MUTED, alignment: 'center', margin: [0, 2, 0, 0] }], alignment: 'right' },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          widths: [96, '*', 86, '*'],
          body: [
            [...info(t.kind, t.code), ...info('Hạn xử lý', formatDateVi(r.dueDate))],
            [{ text: 'Tên hồ sơ', color: MUTED }, { text: t.title, colSpan: 3 }, '', ''],
            [{ text: pr && !c ? 'Kính gửi' : 'Khách hàng / đối tác', color: MUTED }, { text: t.party || '—', colSpan: 3 }, '', ''],
            ...(pr
              ? [
                  [...info('Đề nghị thanh toán', `${pr.number} · ${formatDateVi(pr.date) ?? ''}`), ...info('Số tiền', `${formatQtyVi(String(Math.round(Number(pr.amount) || 0)))} đồng`)],
                  ...(pr.basis ? [[{ text: 'Căn cứ', color: MUTED }, { text: pr.basis, colSpan: 3 }, '', ''] as TableCell[]] : []),
                ]
              : []),
            [...info('Người yêu cầu', r.requestedBy.fullName), ...info('Người kiểm tra', r.assignee.fullName)],
            ...(c && c.kind === 'ORDER' && (c.deliveryDate || c.deliveryAddress)
              ? [[...info('Ngày giao', formatDateVi(c.deliveryDate)), ...info('Nơi giao', c.deliveryAddress)]]
              : []),
          ],
        },
        layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 3, paddingBottom: () => 3 },
        fontSize: 10,
        margin: [0, 0, 0, 10],
      },
      { text: 'NỘI DUNG CẦN KIỂM TRA', bold: true, color: ACCENT, fontSize: 10, margin: [0, 0, 0, 3] },
      { text: r.content, margin: [0, 0, 0, 10] },
      { text: 'DANH SÁCH HÀNG HÓA', bold: true, color: ACCENT, fontSize: 10, margin: [0, 0, 0, 3] },
      itemsTable,
      { text: 'KẾT QUẢ / GHI CHÚ CỦA NGƯỜI KIỂM TRA', bold: true, color: ACCENT, fontSize: 10, margin: [0, 12, 0, 0] },
      r.result ? { text: r.result, margin: [0, 3, 0, 4] } : writeLines(4),
      {
        columns: [
          { text: 'Kết luận:', width: 'auto', margin: [0, 6, 0, 0] },
          { columns: [{ stack: [box(r.status === 'DONE')], width: 12 }, { text: 'Đạt', margin: [4, -1, 0, 0] }], width: 60, margin: [0, 8, 0, 0] },
          { columns: [{ stack: [box(r.status === 'ISSUE')], width: 12 }, { text: 'Có vấn đề', margin: [4, -1, 0, 0] }], width: 90, margin: [0, 8, 0, 0] },
          { text: r.completedAt ? `Hoàn tất lúc ${formatDateTime(r.completedAt)}` : '', color: MUTED, fontSize: 9, margin: [0, 7, 0, 0] },
        ],
        columnGap: 10,
      },
      {
        columns: [
          { stack: [{ text: 'NGƯỜI YÊU CẦU', bold: true }, { text: '(Ký, ghi rõ họ tên)', italics: true, fontSize: 9, color: MUTED, margin: [0, 0, 0, 50] }, { text: r.requestedBy.fullName, bold: true }], alignment: 'center' },
          { stack: [{ text: 'NGƯỜI KIỂM TRA', bold: true }, { text: '(Ký, ghi rõ họ tên)', italics: true, fontSize: 9, color: MUTED, margin: [0, 0, 0, 50] }, { text: r.assignee.fullName, bold: true }], alignment: 'center' },
        ],
        margin: [0, 22, 0, 0],
        unbreakable: true,
      },
    ],
  };
  return pdfMake.createPdf(doc);
}
