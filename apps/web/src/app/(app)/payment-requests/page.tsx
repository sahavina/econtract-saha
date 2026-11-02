'use client';

import { PAYMENT_REQUEST_STATUS_LABELS, PAYMENT_REQUEST_STATUSES, type PaymentRequestStatus } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { PaymentRequestListItem } from '@/lib/types';

const STATUS_VARIANT: Record<PaymentRequestStatus, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  DRAFT: 'outline',
  SENT: 'secondary',
  PAID: 'default',
  CANCELLED: 'destructive',
};

/** Danh sách đề nghị thanh toán đã lưu: tìm theo số, khách hàng, hồ sơ; lọc trạng thái và ngày. */
export default function PaymentRequestsPage() {
  const { can } = useAuth();
  const canManage = can('payment_request.manage');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const requests = useQuery({
    queryKey: ['payment-requests', q, status, from, to, page],
    queryFn: () => api<Paginated<PaymentRequestListItem>>('/payment-requests', { query: { q, status, from, to, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Đề nghị thanh toán"
        description="Giấy đề nghị thanh toán đã lưu: in lại, theo dõi đã gửi khách hay đã thanh toán."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Đề nghị thanh toán' }]}
        actions={
          <Button asChild>
            <Link href="/payment-requests/new">
              <Receipt /> Lập đề nghị thanh toán
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-72" placeholder="Tìm số đề nghị, kính gửi, căn cứ, số hồ sơ…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Tìm đề nghị thanh toán" />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={reset(setStatus)} options={PAYMENT_REQUEST_STATUSES.map((s) => ({ value: s, label: PAYMENT_REQUEST_STATUS_LABELS[s] }))} />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Từ <Input type="date" className="w-40" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="Từ ngày" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          đến <Input type="date" className="w-40" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="Đến ngày" />
        </label>
      </div>
      {requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
      ) : !requests.data ? (
        <Skeleton className="h-64" />
      ) : requests.data.items.length === 0 ? (
        <EmptyState title="Chưa có đề nghị thanh toán đã lưu" description={canManage ? 'Bấm “Lập đề nghị thanh toán”, hoặc lập từ một đơn đặt hàng / hợp đồng rồi bấm “Lưu đề nghị”.' : undefined} />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số đề nghị</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Kính gửi</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Đơn / hợp đồng</TableHead>
                  <TableHead>Người lập</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/payment-requests/${r.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">
                        {r.number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.recipient}</div>
                      {r.basis && <div className="line-clamp-1 max-w-96 text-xs text-muted-foreground">{r.basis}</div>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(r.amount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.contract ? (
                        <Link href={`/contracts/${r.contract.id}`} className="hover:underline">
                          {r.contract.code}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.createdBy.fullName}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{PAYMENT_REQUEST_STATUS_LABELS[r.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={requests.data.page} totalPages={requests.data.totalPages} total={requests.data.total} unit="đề nghị" onPage={setPage} />
        </>
      )}
    </>
  );
}
