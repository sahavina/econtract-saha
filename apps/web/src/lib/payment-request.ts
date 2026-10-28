'use client';

import { amountInWordsVnd, formatQtyVi } from '@saha/shared';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/** Giấy đề nghị thanh toán gửi khách hàng (theo mẫu SAHA): kính gửi, căn cứ, số tiền, tài khoản thụ hưởng. */
export interface PaymentRequest {
  /** Công ty đề nghị (bên nhận tiền) – in ở góc trái và phần ký. */
  company: string;
  number: string;
  place: string;
  /** yyyy-mm-dd */
  date: string;
  recipient: string;
  basis: string;
  /** Số tiền dạng số, ví dụ "1036800". */
  amount: string;
  beneficiary: string;
  account: string;
  accountHolder: string;
  signerPosition: string;
  signerName: string;
}

/** Số đề nghị mặc định kiểu "15.10.26.ĐNTT/SAHA". */
export function defaultRequestNumber(date: string, suffix = 'SAHA'): string {
  const [y, m, d] = date.split('-');
  return y && m && d ? `${d}.${m}.${y.slice(2)}.ĐNTT/${suffix}` : `ĐNTT/${suffix}`;
}

export function amountDigits(amount: string): string {
  return amount.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

export function amountText(r: PaymentRequest) {
  const n = amountDigits(r.amount);
  return { figure: n ? `${formatQtyVi(n)} đồng` : '', words: n ? amountInWordsVnd(n) : '' };
}

/** Giá trị biến {{payment.*}} khi lập từ trang Đề nghị thanh toán – ghi đè giá trị suy ra từ hợp đồng. */
export function paymentValues(r: PaymentRequest): Record<string, string | null> {
  const { figure, words } = amountText(r);
  const [y, m, d] = r.date.split('-');
  const v = (s: string) => s.trim() || null;
  return {
    'payment.number': v(r.number),
    'payment.date_text': y && m && d ? `ngày ${d} tháng ${m} năm ${y}` : null,
    'payment.recipient': v(r.recipient),
    'payment.basis': v(r.basis),
    'payment.amount': figure ? figure.replace(/ đồng$/, '') : null,
    'payment.amount_words': v(words),
    'payment.beneficiary': v(r.beneficiary),
    'payment.account': v(r.account),
    'payment.account_holder': v(r.accountHolder),
    'payment.signer_position': v(r.signerPosition),
    'payment.signer_name': v(r.signerName),
  };
}

export function dateLine(r: PaymentRequest): string {
  const [y, m, d] = r.date.split('-');
  return `${r.place.trim() || 'Hà Nội'}, ngày ${d ?? '…'} tháng ${m ?? '…'} năm ${y ?? '…'}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const up = (s: string) => s.trim().toUpperCase();

/**
 * HTML của giấy đề nghị – dùng cho xem trước trên trang và xuất Word (.doc: Word mở trực tiếp HTML).
 * Mọi giá trị đã escape.
 */
export function paymentRequestHtml(r: PaymentRequest): string {
  const { figure, words } = amountText(r);
  const p = (html: string, style = '') => `<p style="margin:0 0 6pt;text-align:justify;text-indent:1.1cm;${style}">${html}</p>`;
  const cell = 'border:none;vertical-align:top;padding:0 4pt;';
  return `<div style="font-family:'Times New Roman',Tinos,serif;font-size:13pt;line-height:1.45;color:#000">
<table style="width:100%;border-collapse:collapse;margin-bottom:14pt"><tbody>
<tr><td style="${cell}width:42%;text-align:center;font-weight:bold;font-size:12pt">${esc(up(r.company))}</td>
<td style="${cell}text-align:center;font-weight:bold;font-size:12pt;white-space:nowrap">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập - Tự do - Hạnh phúc</td></tr>
<tr><td style="${cell}text-align:center">Số: ${esc(r.number.trim())}</td><td style="${cell}text-align:center">-----------o0o-----------</td></tr>
<tr><td style="${cell}"></td><td style="${cell}text-align:right;font-style:italic">${esc(dateLine(r))}</td></tr>
</tbody></table>
<p style="margin:12pt 0 18pt;text-align:center;font-weight:bold;font-size:16pt">ĐỀ NGHỊ THANH TOÁN</p>
${p(`<b><i><u>Kính gửi</u></i>: ${esc(up(r.recipient))}</b>`, 'margin-bottom:8pt')}
${r.basis.trim() ? p(esc(r.basis.trim())) : ''}
${p(`Số tiền là : <b>${esc(figure)}</b>${words ? ` <b><i>( ${esc(words)} )</i></b>` : ''}`)}
${p('Công ty chúng tôi kính đề nghị Quý Công ty thanh toán cho chúng tôi số tiền trên vào tài khoản sau:')}
${p('<b>Tài khoản thụ hưởng:</b>', 'text-indent:0.6cm')}
${p(`<b>${esc(up(r.beneficiary))}</b>`, 'text-indent:0.6cm;font-size:14pt')}
${r.account.trim() ? p(`Tài khoản: ${esc(r.account.trim())}`) : ''}
${r.accountHolder.trim() ? p(`Chủ tài khoản: ${esc(r.accountHolder.trim())}`) : ''}
${p('Rất mong nhận được sự quan tâm của Quý đơn vị.')}
${p('Trân trọng cảm ơn!')}
<table style="width:100%;border-collapse:collapse;margin-top:18pt"><tbody><tr>
<td style="${cell}width:45%"></td>
<td style="${cell}text-align:center"><b>${esc(up(r.company))}</b>${r.signerPosition.trim() ? `<br><b>${esc(up(r.signerPosition))}</b>` : ''}<br><br><br><br>${r.signerName.trim() ? `<b>${esc(r.signerName.trim())}</b>` : ''}</td>
</tr></tbody></table>
</div>`;
}

const fontUrl = (file: string) => `${window.location.origin}/fonts/tinos/${file}`;
const MM = 72 / 25.4;

function pdfContent(r: PaymentRequest): Content[] {
  const { figure, words } = amountText(r);
  const para = (text: unknown, extra: Record<string, unknown> = {}): Content =>
    ({ text, alignment: 'justify', leadingIndent: 1.1 * 28.35, margin: [0, 0, 0, 6], ...extra }) as Content;
  const noBorder = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 2, paddingRight: () => 2 };
  return [
    {
      table: {
        widths: ['42%', '*'],
        body: [
          [
            { text: up(r.company), bold: true, fontSize: 12, alignment: 'center' },
            { fontSize: 12, stack: [{ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true }, { text: 'Độc lập - Tự do - Hạnh phúc', bold: true }], alignment: 'center' },
          ],
          [
            { text: `Số: ${r.number.trim()}`, alignment: 'center' },
            { text: '-----------o0o-----------', alignment: 'center' },
          ],
          ['', { text: dateLine(r), italics: true, alignment: 'right' }],
        ],
      },
      layout: noBorder,
      margin: [0, 0, 0, 14],
    },
    { text: 'ĐỀ NGHỊ THANH TOÁN', bold: true, fontSize: 16, alignment: 'center', margin: [0, 8, 0, 18] },
    para([{ text: 'Kính gửi', bold: true, italics: true, decoration: 'underline' }, { text: `: ${up(r.recipient)}`, bold: true }], { margin: [0, 0, 0, 8] }),
    ...(r.basis.trim() ? [para(r.basis.trim())] : []),
    para(['Số tiền là : ', { text: figure, bold: true }, ...(words ? [{ text: ` ( ${words} )`, bold: true, italics: true }] : [])]),
    para('Công ty chúng tôi kính đề nghị Quý Công ty thanh toán cho chúng tôi số tiền trên vào tài khoản sau:'),
    para({ text: 'Tài khoản thụ hưởng:', bold: true }, { leadingIndent: 0.6 * 28.35 }),
    para({ text: up(r.beneficiary), bold: true, fontSize: 14 }, { leadingIndent: 0.6 * 28.35 }),
    ...(r.account.trim() ? [para(`Tài khoản: ${r.account.trim()}`, { alignment: 'left' })] : []),
    ...(r.accountHolder.trim() ? [para(`Chủ tài khoản: ${r.accountHolder.trim()}`, { alignment: 'left' })] : []),
    para('Rất mong nhận được sự quan tâm của Quý đơn vị.'),
    para('Trân trọng cảm ơn!'),
    {
      columns: [
        { width: '45%', text: '' },
        {
          width: '*',
          alignment: 'center',
          stack: [
            { text: up(r.company), bold: true },
            ...(r.signerPosition.trim() ? [{ text: up(r.signerPosition), bold: true }] : []),
            { text: ' ', margin: [0, 0, 0, 52] },
            ...(r.signerName.trim() ? [{ text: r.signerName.trim(), bold: true }] : []),
          ],
        },
      ],
      margin: [0, 18, 0, 0],
      unbreakable: true,
    },
  ];
}

async function createPdf(r: PaymentRequest) {
  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(`${window.location.origin}/`));
  pdfMake.setFonts({
    Tinos: { normal: fontUrl('Tinos-Regular.ttf'), bold: fontUrl('Tinos-Bold.ttf'), italics: fontUrl('Tinos-Italic.ttf'), bolditalics: fontUrl('Tinos-BoldItalic.ttf') },
  });
  const doc: TDocumentDefinitions = {
    info: { title: `Đề nghị thanh toán ${r.number}`, creator: 'SAHA eContract' },
    pageSize: 'A4',
    pageMargins: [25 * MM, 18 * MM, 18 * MM, 18 * MM],
    defaultStyle: { font: 'Tinos', fontSize: 13, lineHeight: 1.3 },
    content: pdfContent(r),
  };
  return pdfMake.createPdf(doc);
}

export const fileBase = (r: PaymentRequest) => `De nghi thanh toan - ${(r.recipient || r.number || 'SAHA').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}`;

export async function downloadPaymentRequestPdf(r: PaymentRequest) {
  await (await createPdf(r)).download(`${fileBase(r)}.pdf`);
}

export async function openPaymentRequestPdf(r: PaymentRequest) {
  const url = URL.createObjectURL(await (await createPdf(r)).getBlob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Kiểu cho file Word: Times New Roman cho mọi phần tử và các kiểu chuẩn của Word (Normal, Table) –
 * Word không cho ô bảng thừa hưởng font của body nên phải khai báo riêng, nếu không bảng sẽ về font mặc định (Calibri).
 */
const WORD_STYLES = `@page{size:21cm 29.7cm;margin:1.8cm 1.8cm 1.8cm 2.5cm}
body,div,p,span,b,strong,i,em,u,li,ol,ul,table,tr,td,th,h1,h2,h3,h4,h5,h6,p.MsoNormal,li.MsoNormal,div.MsoNormal,table.MsoNormalTable{font-family:"Times New Roman",serif;mso-ascii-font-family:"Times New Roman";mso-hansi-font-family:"Times New Roman";mso-bidi-font-family:"Times New Roman";mso-fareast-font-family:"Times New Roman"}
body,p,td,th,li{font-size:13pt}
table{border-collapse:collapse}
td,th{border:1px solid #000;padding:2pt 4pt;vertical-align:top}
table.borderless td,table.borderless th{border:none}`;

/** Word mở được tệp HTML đặt đuôi .doc – giữ bố cục để người dùng chỉnh tiếp. */
export function downloadPaymentRequestWord(r: PaymentRequest, bodyHtml = paymentRequestHtml(r)) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>Đề nghị thanh toán</title>
<style>${WORD_STYLES}</style></head><body lang="VI">${bodyHtml}</body></html>`;
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase(r)}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
