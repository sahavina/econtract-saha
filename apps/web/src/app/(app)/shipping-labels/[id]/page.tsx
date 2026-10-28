'use client';

import { SHIPPING_NOTE_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ErrorState, PageHeader } from '@/components/page-header';
import { ShippingLabelForm } from '@/components/shipping-label-form';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ShippingNoteDetail } from '@/lib/types';

export default function ShippingLabelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const note = useQuery({ queryKey: ['shipping-note', id], queryFn: () => api<ShippingNoteDetail>(`/shipping-notes/${id}`) });
  if (note.isError) return <ErrorState error={note.error} onRetry={() => note.refetch()} />;
  if (!note.data) return <Skeleton className="h-96" />;
  const n = note.data;
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Phiếu gửi hàng {n.code} <Badge variant="secondary">{SHIPPING_NOTE_STATUS_LABELS[n.status]}</Badge>
          </span>
        }
        description={`Ngày gửi ${formatDate(n.sendDate)} · Người lập: ${n.createdBy.fullName}`}
        crumbs={[{ label: 'Phiếu gửi hàng', href: '/shipping-labels' }, { label: n.code }]}
      />
      {/* key: dữ liệu mới sau khi lưu ⇒ nạp lại form. */}
      <ShippingLabelForm key={n.id} note={n} />
    </>
  );
}
