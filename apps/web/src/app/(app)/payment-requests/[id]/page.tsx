'use client';

import { PAYMENT_REQUEST_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ErrorState, PageHeader } from '@/components/page-header';
import { PaymentRequestForm } from '@/components/payment-request-form';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { PaymentRequestDetail } from '@/lib/types';

export default function PaymentRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const request = useQuery({ queryKey: ['payment-request', id], queryFn: () => api<PaymentRequestDetail>(`/payment-requests/${id}`) });
  if (request.isError) return <ErrorState error={request.error} onRetry={() => request.refetch()} />;
  if (!request.data) return <Skeleton className="h-96" />;
  const r = request.data;
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Đề nghị thanh toán {r.number} <Badge variant="secondary">{PAYMENT_REQUEST_STATUS_LABELS[r.status]}</Badge>
          </span>
        }
        description={`Ngày ${formatDate(r.date)} · Người lập: ${r.createdBy.fullName}`}
        crumbs={[{ label: 'Đề nghị thanh toán', href: '/payment-requests' }, { label: r.number }]}
      />
      <PaymentRequestForm key={r.id} saved={r} />
    </>
  );
}
