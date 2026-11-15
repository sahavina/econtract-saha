import type { PaymentRequestStatus, QuoteDisplayStatus, ShippingNoteStatus } from '@saha/shared';
import type { Tone } from '@/components/list-ui';

/** Màu nhãn trạng thái dùng chung cho danh sách và trang chi tiết. */
export const QUOTE_TONE: Record<QuoteDisplayStatus, Tone> = { DRAFT: 'gray', SENT: 'sky', ACCEPTED: 'green', REJECTED: 'red', EXPIRED: 'orange' };
export const PAYMENT_REQUEST_TONE: Record<PaymentRequestStatus, Tone> = { DRAFT: 'gray', SENT: 'sky', PAID: 'green', CANCELLED: 'red' };
export const SHIPPING_NOTE_TONE: Record<ShippingNoteStatus, Tone> = { DRAFT: 'gray', SENT: 'sky', DELIVERED: 'green', CANCELLED: 'red' };
export const stockIssueTone = (status: string): Tone => (status === 'CANCELLED' ? 'red' : 'green');
