'use client';

import { amountInWordsVnd, escapeHtml as esc, formatDateVi, orderItemsTableHtml } from '@saha/shared';
import type { CompanyProfile } from '@/lib/company';
import { contractPdfFile, downloadContractPdf } from '@/lib/contract-pdf';
import { downloadWordHtml } from '@/lib/payment-request';
import type { QuoteDetail } from '@/lib/types';

const row = (label: string, value: string | null | undefined) => (value?.trim() ? `<p>${label}: ${esc(value.trim())}</p>` : '');
const block = (label: string, value: string | null | undefined) =>
  value?.trim() ? `<p><strong>${label}:</strong> ${esc(value.trim()).replace(/\n/g, '<br>')}</p>` : '';

/** Giấy báo giá: dùng chung cho PDF và Word. Bố cục tạm, sẽ theo file mẫu của SAHA. */
export function quoteHtml(q: QuoteDetail, company: CompanyProfile | undefined): string {
  const total = String(Math.round(Number(q.total) || 0));
  return [
    `<p><strong>${esc(company?.name ?? '')}</strong></p>`,
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
    '<p>Chúng tôi xin trân trọng báo giá như sau:</p>',
    orderItemsTableHtml(q.items, q.vatRate),
    Number(total) ? `<p><em>Bằng chữ: ${esc(amountInWordsVnd(total))}</em></p>` : '',
    q.validUntil ? `<p><strong>Hiệu lực báo giá:</strong> đến hết ngày ${esc(formatDateVi(q.validUntil) ?? '')}</p>` : '',
    block('Điều kiện thanh toán', q.paymentTerms),
    block('Điều kiện giao hàng', q.deliveryTerms),
    block('Ghi chú', q.note),
    `<p style="text-align:right"><strong>${esc(company?.position ?? 'Đại diện')}</strong></p>`,
    '<p></p><p></p><p></p>',
    `<p style="text-align:right"><strong>${esc(company?.representative ?? '')}</strong></p>`,
  ].join('');
}

const pdfInput = (q: QuoteDetail, company: CompanyProfile | undefined) => ({ fileName: `Bao gia ${q.code}`, title: `Báo giá ${q.code}`, html: quoteHtml(q, company) });

export const quoteFileName = (q: QuoteDetail) => `Bao gia ${q.code}.pdf`;
export const quotePdfFile = (q: QuoteDetail, company: CompanyProfile | undefined) => contractPdfFile(pdfInput(q, company));
export const downloadQuotePdf = (q: QuoteDetail, company: CompanyProfile | undefined) => downloadContractPdf(pdfInput(q, company));
export const downloadQuoteWord = (q: QuoteDetail, company: CompanyProfile | undefined) => downloadWordHtml(`Bao gia ${q.code}`, quoteHtml(q, company));
