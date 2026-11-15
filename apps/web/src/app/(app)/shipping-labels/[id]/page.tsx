'use client';

import { SHIPPING_NOTE_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DetailHeader } from '@/components/detail-header';
import { StatusPill } from '@/components/list-ui';
import { ErrorState } from '@/components/page-header';
import { ShippingLabelForm } from '@/components/shipping-label-form';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SHIPPING_NOTE_TONE } from '@/lib/status-tones';
import type { ShippingNoteDetail } from '@/lib/types';

export default function ShippingLabelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const note = useQuery({ queryKey: ['shipping-note', id], queryFn: () => api<ShippingNoteDetail>(`/shipping-notes/${id}`) });
  if (note.isError) return <ErrorState error={note.error} onRetry={() => note.refetch()} />;
  if (!note.data) return <Skeleton className="h-96" />;
  const n = note.data;
  return (
    <>
      <DetailHeader
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Phiếu gửi hàng', href: '/shipping-labels' }, { label: n.code }]}
        icon={Truck}
        title={`Phiếu gửi hàng ${n.code}`}
        status={<StatusPill tone={SHIPPING_NOTE_TONE[n.status]}>{SHIPPING_NOTE_STATUS_LABELS[n.status]}</StatusPill>}
        meta={<span>Ngày gửi {formatDate(n.sendDate)} · Người lập: {n.createdBy.fullName}</span>}
        facts={[
          { label: 'Người nhận', value: n.toCompany },
          { label: 'Số thùng', value: n.boxes },
          { label: 'Chành xe', value: n.carrier ?? '—' },
          { label: 'Mã vận đơn', value: n.trackingNo ?? '—' },
        ]}
      />
      {/* key: dữ liệu mới sau khi lưu ⇒ nạp lại form. */}
      <ShippingLabelForm key={n.id} note={n} />
    </>
  );
}
