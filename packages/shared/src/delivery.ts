/** Phiếu xuất kho và phiếu gửi hàng (chành xe). */
export const STOCK_ISSUE_STATUS_LABELS = {
  ISSUED: 'Đã xuất kho',
  CANCELLED: 'Đã hủy',
} as const;
export type StockIssueStatus = keyof typeof STOCK_ISSUE_STATUS_LABELS;

export const SHIPPING_NOTE_STATUSES = ['DRAFT', 'SENT', 'DELIVERED', 'CANCELLED'] as const;
export type ShippingNoteStatus = (typeof SHIPPING_NOTE_STATUSES)[number];
export const SHIPPING_NOTE_STATUS_LABELS: Record<ShippingNoteStatus, string> = {
  DRAFT: 'Chưa gửi',
  SENT: 'Đã gửi chành',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
};

export const FREIGHT_PAYER_LABELS = {
  SENDER: 'Người gửi trả',
  RECEIVER: 'Người nhận trả',
} as const;
export type FreightPayer = keyof typeof FREIGHT_PAYER_LABELS;
