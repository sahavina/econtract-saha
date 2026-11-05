'use client';

import { PAYMENT_SEND_METHOD_LABELS, QUOTE_FILTER_STATUSES, QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { displayStatus, QuoteActions } from '@/components/quote-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { QuoteListItem } from '@/lib/types';

const QUOTE_VARIANT: Record<QuoteDisplayStatus, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  DRAFT: 'outline',
  SENT: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'destructive',
  EXPIRED: 'destructive',
};

/** Danh sách báo giá: tìm theo số, khách hàng, hàng hóa; lọc trạng thái và ngày. */
export default function QuotesPage() {
  const { can } = useAuth();
  const canManage = can('quote.manage');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const quotes = useQuery({
    queryKey: ['quotes', q, status, from, to, page],
    queryFn: () => api<Paginated<QuoteListItem>>('/quotes', { query: { q, status, from, to, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Báo giá"
        description="Lập báo giá gửi khách, theo dõi đã gửi, khách đồng ý hay từ chối, rồi chuyển thành đơn đặt hàng."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Báo giá' }]}
        actions={
          canManage && (
            <Button asChild>
              <Link href="/quotes/new">
                <FileText /> Lập báo giá
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-72" placeholder="Tìm số báo giá, khách hàng, hàng hóa…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Tìm báo giá" />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={reset(setStatus)} options={QUOTE_FILTER_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s] }))} />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Từ <Input type="date" className="w-40" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="Từ ngày" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          đến <Input type="date" className="w-40" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="Đến ngày" />
        </label>
      </div>
      {quotes.isError ? (
        <ErrorState error={quotes.error} onRetry={() => quotes.refetch()} />
      ) : !quotes.data ? (
        <Skeleton className="h-64" />
      ) : quotes.data.items.length === 0 ? (
        <EmptyState title="Chưa có báo giá" description={canManage ? 'Bấm “Lập báo giá” để tạo báo giá đầu tiên.' : undefined} />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số báo giá</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Hiệu lực đến</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead>Đơn hàng</TableHead>
                  <TableHead>Người lập</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.data.items.map((r) => {
                  const shown = displayStatus(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/quotes/${r.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">{r.code}</Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium">{r.customerName}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(r.validUntil)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(r.total)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {r.order ? <Link href={`/contracts/${r.order.id}`} className="hover:underline">{r.order.code}</Link> : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.createdBy.fullName}</TableCell>
                      <TableCell>
                        <Badge variant={QUOTE_VARIANT[shown]}>{QUOTE_STATUS_LABELS[shown]}</Badge>
                        {r.sentAt && (
                          <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                            {[`Gửi ${formatDate(r.sentAt)}`, r.sentMethod && PAYMENT_SEND_METHOD_LABELS[r.sentMethod], r.sentBy?.fullName].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <QuoteActions quote={r} variant="menu" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={quotes.data.page} totalPages={quotes.data.totalPages} total={quotes.data.total} unit="báo giá" onPage={setPage} />
        </>
      )}
    </>
  );
}
