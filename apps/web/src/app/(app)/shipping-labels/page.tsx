'use client';

import { formatQtyVi, SHIPPING_NOTE_STATUS_LABELS, SHIPPING_NOTE_STATUSES, type ShippingNoteStatus } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
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
import { formatDate } from '@/lib/format';
import type { ShippingNoteListItem } from '@/lib/types';

const STATUS_VARIANT: Record<ShippingNoteStatus, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  DRAFT: 'outline',
  SENT: 'secondary',
  DELIVERED: 'default',
  CANCELLED: 'destructive',
};

/** Danh sách phiếu gửi hàng đã lưu: tìm theo người nhận, chành xe, mã vận đơn; lọc trạng thái và ngày gửi. */
export default function ShippingLabelsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const notes = useQuery({
    queryKey: ['shipping-notes', q, status, from, to, page],
    queryFn: () => api<Paginated<ShippingNoteListItem>>('/shipping-notes', { query: { q, status, from, to, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Phiếu gửi hàng"
        description="Phiếu dán thùng gửi chành xe đã lưu: in lại, theo dõi chành xe, mã vận đơn, cước và trạng thái giao."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Phiếu gửi hàng' }]}
        actions={
          <Button asChild>
            <Link href="/shipping-labels/new">
              <Truck /> Tạo phiếu gửi hàng
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-72" placeholder="Tìm số phiếu, người nhận, chành xe, mã vận đơn…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Tìm phiếu gửi hàng" />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={reset(setStatus)} options={SHIPPING_NOTE_STATUSES.map((s) => ({ value: s, label: SHIPPING_NOTE_STATUS_LABELS[s] }))} />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Từ <Input type="date" className="w-40" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="Từ ngày" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          đến <Input type="date" className="w-40" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="Đến ngày" />
        </label>
      </div>
      {notes.isError ? (
        <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
      ) : !notes.data ? (
        <Skeleton className="h-64" />
      ) : notes.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có phiếu gửi hàng đã lưu"
          description={can('delivery.manage') ? 'Bấm “Tạo phiếu gửi hàng”, hoặc tạo từ đơn đặt hàng / phiếu xuất kho rồi bấm “Lưu phiếu”.' : undefined}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số phiếu</TableHead>
                  <TableHead>Ngày gửi</TableHead>
                  <TableHead>Người nhận</TableHead>
                  <TableHead className="text-right">Số thùng</TableHead>
                  <TableHead>Chành xe</TableHead>
                  <TableHead>Mã vận đơn</TableHead>
                  <TableHead className="text-right">Cước</TableHead>
                  <TableHead>Đơn / phiếu xuất</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.data.items.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Link href={`/shipping-labels/${n.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">
                        {n.code}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(n.sendDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{n.toCompany}</div>
                      <div className="line-clamp-1 max-w-72 text-xs text-muted-foreground">{[n.toAddress, n.toPhones].filter(Boolean).join(' · ')}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{n.boxes}</TableCell>
                    <TableCell>
                      {n.carrier ?? '—'}
                      {n.vehicle && <div className="text-xs text-muted-foreground">{n.vehicle}</div>}
                    </TableCell>
                    <TableCell>{n.trackingNo ?? '—'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{n.freight ? formatQtyVi(String(Math.round(Number(n.freight)))) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {n.order && (
                        <Link href={`/contracts/${n.order.id}`} className="block hover:underline">
                          {n.order.code}
                        </Link>
                      )}
                      {n.stockIssue && (
                        <Link href={`/stock-issues/${n.stockIssue.id}`} className="block text-muted-foreground hover:underline">
                          {n.stockIssue.code}
                        </Link>
                      )}
                      {!n.order && !n.stockIssue && '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[n.status]}>{SHIPPING_NOTE_STATUS_LABELS[n.status]}</Badge>
                      {n.deliveredAt ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">giao {formatDate(n.deliveredAt)}</div>
                      ) : n.sentAt ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">gửi {formatDate(n.sentAt)}</div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={notes.data.page} totalPages={notes.data.totalPages} total={notes.data.total} unit="phiếu" onPage={setPage} />
        </>
      )}
    </>
  );
}
