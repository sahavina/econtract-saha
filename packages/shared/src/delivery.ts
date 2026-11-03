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

/** Đề nghị thanh toán gửi khách hàng. */
export const PAYMENT_REQUEST_STATUSES = ['DRAFT', 'SENT', 'PAID', 'CANCELLED'] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];
export const PAYMENT_REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  DRAFT: 'Chưa gửi',
  SENT: 'Đã gửi',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
};

/** Cách gửi đề nghị cho khách (EMAIL khi gửi từ hệ thống hoặc tự gửi bằng email). */
export const PAYMENT_SEND_METHODS = ['ZALO', 'EMAIL', 'PAPER', 'OTHER'] as const;
export type PaymentSendMethod = (typeof PAYMENT_SEND_METHODS)[number];
export const PAYMENT_SEND_METHOD_LABELS: Record<PaymentSendMethod, string> = {
  ZALO: 'Zalo',
  EMAIL: 'Email',
  PAPER: 'Bản giấy',
  OTHER: 'Khác',
};
