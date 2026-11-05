/** Báo giá gửi khách. "Hết hạn" không lưu: suy ra khi chưa có quyết định mà đã qua ngày hiệu lực. */
export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_FILTER_STATUSES = [...QUOTE_STATUSES, 'EXPIRED'] as const;
export type QuoteDisplayStatus = (typeof QUOTE_FILTER_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
  DRAFT: 'Nháp',
  SENT: 'Đã gửi',
  ACCEPTED: 'Khách đồng ý',
  REJECTED: 'Từ chối',
  EXPIRED: 'Hết hạn',
};

export const QUOTE_DECISIONS = ['ACCEPTED', 'REJECTED', 'REOPEN'] as const;
export type QuoteDecision = (typeof QUOTE_DECISIONS)[number];

/** Ngày dạng yyyy-mm-dd so với hôm nay (cũng yyyy-mm-dd). */
export function quoteDisplayStatus(status: QuoteStatus, validUntil: string | null | undefined, today: string): QuoteDisplayStatus {
  return (status === 'DRAFT' || status === 'SENT') && validUntil && validUntil.slice(0, 10) < today ? 'EXPIRED' : status;
}
