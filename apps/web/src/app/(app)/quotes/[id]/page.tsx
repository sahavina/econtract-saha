'use client';

import { PAYMENT_SEND_METHOD_LABELS, QUOTE_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DetailHeader } from '@/components/detail-header';
import { StatusPill } from '@/components/list-ui';
import { ErrorState } from '@/components/page-header';
import { displayStatus, QuoteActions } from '@/components/quote-actions';
import { QuoteForm } from '@/components/quote-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyProfile } from '@/lib/company';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadQuotePdf, downloadQuoteWord } from '@/lib/quote';
import { QUOTE_TONE } from '@/lib/status-tones';
import type { QuoteDetail } from '@/lib/types';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const quote = useQuery({ queryKey: ['quote', id], queryFn: () => api<QuoteDetail>(`/quotes/${id}`) });
  const company = useCompanyProfile();
  const [exporting, setExporting] = useState(false);
  if (quote.isError) return <ErrorState error={quote.error} onRetry={() => quote.refetch()} />;
  if (!quote.data) return <Skeleton className="h-96" />;
  const q = quote.data;
  const shown = displayStatus(q);
  // Đã có quyết định của khách thì không sửa; muốn sửa bấm Mở lại.
  const readOnly = !can('quote.manage') || q.status === 'ACCEPTED' || q.status === 'REJECTED';

  const pdf = async () => {
    setExporting(true);
    try {
      await downloadQuotePdf(q, company.data);
    } catch (e) {
      toast.error(`Không tạo được PDF: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <DetailHeader
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Báo giá', href: '/quotes' }, { label: q.code }]}
        icon={FileText}
        title={`Báo giá ${q.code}`}
        status={<StatusPill tone={QUOTE_TONE[shown]}>{QUOTE_STATUS_LABELS[shown]}</StatusPill>}
        meta={<span>Ngày {formatDate(q.date)} · Người lập: {q.createdBy.fullName}</span>}
        actions={
          <>
            <QuoteActions quote={q} variant="buttons" />
            <Button variant="outline" disabled={exporting} onClick={pdf}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
            </Button>
            <Button variant="outline" onClick={() => downloadQuoteWord(q, company.data)}>
              <FileText /> Tải Word
            </Button>
          </>
        }
        facts={[
          { label: 'Khách hàng', value: q.customerName },
          { label: 'Tổng tiền', value: <span className="tabular-nums">{formatMoney(q.total)}</span> },
          { label: 'Hiệu lực đến', value: formatDate(q.validUntil) },
          {
            label: 'Đơn đặt hàng',
            value: q.order ? (
              <Link href={`/contracts/${q.order.id}`} className="text-primary hover:underline">
                {q.order.code}
              </Link>
            ) : (
              'Chưa chuyển thành đơn'
            ),
          },
        ]}
      >
        {q.sentAt ? [`Đã gửi ${formatDate(q.sentAt)}`, q.sentMethod && PAYMENT_SEND_METHOD_LABELS[q.sentMethod], q.sentTo, q.sentBy?.fullName, q.sentNote].filter(Boolean).join(' · ') : null}
      </DetailHeader>
      {/* key: dữ liệu đổi trạng thái sửa/chỉ xem thì nạp lại form. */}
      <QuoteForm key={`${q.id}-${readOnly}`} quote={q} readOnly={readOnly} />
    </>
  );
}
