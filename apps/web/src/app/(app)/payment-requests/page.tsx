'use client';

import { PAYMENT_REQUEST_STATUS_LABELS, PAYMENT_REQUEST_STATUSES, type PaymentRequestStatus } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { DateRange, ListCard, ListState, SearchBox, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { PaymentRequestActions } from '@/components/payment-request-actions';
import { PaymentRequestProgress } from '@/components/payment-request-progress';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { PaymentRequestListItem } from '@/lib/types';

const STATUS_TONE: Record<PaymentRequestStatus, Tone> = {
  DRAFT: 'gray',
  SENT: 'sky',
  PAID: 'green',
  CANCELLED: 'red',
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
        description="Giấy đề nghị thanh toán đã lưu: in lại, theo dõi đã gửi khách hay đã thanh toán"
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Đề nghị thanh toán' }]}
        actions={
          <Button asChild className="h-9">
            <Link href="/payment-requests/new">
              <Receipt /> Lập đề nghị thanh toán
            </Link>
          </Button>
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={q} onChange={reset(setQ)} placeholder="Tìm số đề nghị, kính gửi, căn cứ, số hồ sơ…" ariaLabel="Tìm đề nghị thanh toán" />
            <FilterSelect className="h-9 w-40" allLabel="Mọi trạng thái" value={status} onChange={reset(setStatus)} options={PAYMENT_REQUEST_STATUSES.map((s) => ({ value: s, label: PAYMENT_REQUEST_STATUS_LABELS[s] }))} ariaLabel="Trạng thái" />
            <DateRange from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)} title="Lọc theo ngày đề nghị" />
          </>
        }
      >
        <ListState
          query={requests}
          empty={{ title: 'Chưa có đề nghị thanh toán đã lưu', description: canManage ? 'Bấm “Lập đề nghị thanh toán”, hoặc lập từ một đơn đặt hàng / hợp đồng rồi bấm “Lưu đề nghị”.' : undefined }}
        />
        {!!requests.data?.items.length && (
          <>
            {/* Điện thoại: thẻ; nút thao tác nằm dưới thông tin. */}
            <ul className="divide-y md:hidden">
              {requests.data.items.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <Link href={`/payment-requests/${r.id}`} className="block space-y-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="line-clamp-2 leading-snug font-semibold">{r.recipient}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.number} · {formatDate(r.date)}
                        </span>
                      </span>
                      <StatusPill tone={STATUS_TONE[r.status]} className="shrink-0">
                        {PAYMENT_REQUEST_STATUS_LABELS[r.status]}
                      </StatusPill>
                    </span>
                    <span className="block font-semibold tabular-nums">{formatMoney(r.amount)}</span>
                  </Link>
                  <PaymentRequestProgress request={r} className="text-xs" />
                  <PaymentRequestActions request={r} size="sm" />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Đề nghị</Th>
                    <Th>Ngày</Th>
                    <Th className="text-right">Số tiền</Th>
                    <Th>Đơn / hợp đồng</Th>
                    <Th>Người lập</Th>
                    <Th>Trạng thái</Th>
                    <Th>Thao tác</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={Receipt} href={`/payment-requests/${r.id}`} title={r.recipient} sub={r.basis ? `${r.number} · ${r.basis}` : r.number} />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(r.date)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.amount)}</TableCell>
                      <TableCell>
                        {r.contract ? (
                          <Link href={`/contracts/${r.contract.id}`} className="hover:text-primary hover:underline">
                            {r.contract.code}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{r.createdBy.fullName}</TableCell>
                      <TableCell>
                        <StatusPill tone={STATUS_TONE[r.status]}>{PAYMENT_REQUEST_STATUS_LABELS[r.status]}</StatusPill>
                        <PaymentRequestProgress request={r} className="mt-1 max-w-52 text-xs whitespace-normal" />
                      </TableCell>
                      <TableCell>
                        <PaymentRequestActions request={r} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={requests.data.page} totalPages={requests.data.totalPages} total={requests.data.total} pageSize={20} unit="đề nghị" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
