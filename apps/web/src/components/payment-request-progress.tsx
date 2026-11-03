import { PAYMENT_SEND_METHOD_LABELS } from '@saha/shared';
import { formatDate } from '@/lib/format';
import type { PaymentRequestListItem } from '@/lib/types';

/** Đã gửi khi nào, cho ai, bằng cách nào; đã thanh toán khi nào. */
export function PaymentRequestProgress({ request: r, className }: { request: PaymentRequestListItem; className?: string }) {
  if (!r.sentAt && !r.paidAt) return null;
  const sent = r.sentAt && [`Gửi ${formatDate(r.sentAt)}`, r.sentMethod && PAYMENT_SEND_METHOD_LABELS[r.sentMethod], r.sentTo, r.sentBy?.fullName].filter(Boolean).join(' · ');
  const paid = r.paidAt && [`Thanh toán ${formatDate(r.paidAt)}`, r.paidBy?.fullName].filter(Boolean).join(' · ');
  return (
    <div className={`text-muted-foreground ${className ?? 'text-xs'}`}>
      {sent && <div>{sent}</div>}
      {r.sentNote && <div className="max-w-72 truncate" title={r.sentNote}>{r.sentNote}</div>}
      {paid && <div>{paid}</div>}
    </div>
  );
}
