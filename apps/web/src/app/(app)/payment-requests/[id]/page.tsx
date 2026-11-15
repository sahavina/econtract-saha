'use client';

import { PAYMENT_REQUEST_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DetailHeader } from '@/components/detail-header';
import { StatusPill } from '@/components/list-ui';
import { ErrorState } from '@/components/page-header';
import { PaymentRequestActions } from '@/components/payment-request-actions';
import { PaymentRequestForm } from '@/components/payment-request-form';
import { PaymentRequestProgress } from '@/components/payment-request-progress';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { PAYMENT_REQUEST_TONE } from '@/lib/status-tones';
import type { PaymentRequestDetail } from '@/lib/types';

export default function PaymentRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const request = useQuery({ queryKey: ['payment-request', id], queryFn: () => api<PaymentRequestDetail>(`/payment-requests/${id}`) });
  if (request.isError) return <ErrorState error={request.error} onRetry={() => request.refetch()} />;
  if (!request.data) return <Skeleton className="h-96" />;
  const r = request.data;
  return (
    <>
      <DetailHeader
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Đề nghị thanh toán', href: '/payment-requests' }, { label: r.number }]}
        icon={Receipt}
        title={`Đề nghị thanh toán ${r.number}`}
        status={<StatusPill tone={PAYMENT_REQUEST_TONE[r.status]}>{PAYMENT_REQUEST_STATUS_LABELS[r.status]}</StatusPill>}
        meta={<span>Ngày {formatDate(r.date)} · Người lập: {r.createdBy.fullName}</span>}
        actions={<PaymentRequestActions request={r} />}
        facts={[
          { label: 'Kính gửi', value: r.recipient },
          { label: 'Số tiền', value: <span className="tabular-nums">{formatMoney(r.amount)}</span> },
          {
            label: 'Đơn / hợp đồng',
            value: r.contract ? (
              <Link href={`/contracts/${r.contract.id}`} className="text-primary hover:underline">
                {r.contract.code}
              </Link>
            ) : (
              '—'
            ),
          },
          { label: 'Căn cứ', value: r.basis ?? '—' },
        ]}
      >
        <PaymentRequestProgress request={r} />
      </DetailHeader>
      <PaymentRequestForm key={r.id} saved={r} />
    </>
  );
}
