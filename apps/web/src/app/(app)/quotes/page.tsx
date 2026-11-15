'use client';

import { PAYMENT_SEND_METHOD_LABELS, QUOTE_FILTER_STATUSES, QUOTE_STATUS_LABELS } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { DateRange, ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, TitleCell } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { displayStatus, QuoteActions } from '@/components/quote-actions';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { QUOTE_TONE } from '@/lib/status-tones';
import type { QuoteListItem } from '@/lib/types';

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
  const sentLine = (r: QuoteListItem) =>
    r.sentAt ? [`Gửi ${formatDate(r.sentAt)}`, r.sentMethod && PAYMENT_SEND_METHOD_LABELS[r.sentMethod], r.sentBy?.fullName].filter(Boolean).join(' · ') : null;

  return (
    <>
      <PageHeader
        title="Báo giá"
        description="Lập báo giá gửi khách, theo dõi đã gửi, khách đồng ý hay từ chối, rồi chuyển thành đơn đặt hàng"
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Báo giá' }]}
        actions={
          canManage && (
            <Button asChild className="h-9">
              <Link href="/quotes/new">
                <FileText /> Lập báo giá
              </Link>
            </Button>
          )
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={q} onChange={reset(setQ)} placeholder="Tìm số báo giá, khách hàng, hàng hóa…" ariaLabel="Tìm báo giá" />
            <FilterSelect className="h-9 w-40" allLabel="Mọi trạng thái" value={status} onChange={reset(setStatus)} options={QUOTE_FILTER_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s] }))} ariaLabel="Trạng thái" />
            <DateRange from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)} title="Lọc theo ngày báo giá" />
          </>
        }
      >
        <ListState query={quotes} empty={{ title: 'Chưa có báo giá', description: canManage ? 'Bấm “Lập báo giá” để tạo báo giá đầu tiên.' : undefined }} />
        {!!quotes.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {quotes.data.items.map((r) => {
                const shown = displayStatus(r);
                return (
                  <MobileCard
                    key={r.id}
                    href={`/quotes/${r.id}`}
                    title={r.customerName}
                    sub={`${r.code} · ${formatDate(r.date)}`}
                    status={<StatusPill tone={QUOTE_TONE[shown]}>{QUOTE_STATUS_LABELS[shown]}</StatusPill>}
                    actions={<QuoteActions quote={r} variant="menu" />}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold tabular-nums">{formatMoney(r.total)}</span>
                      <span className="text-xs text-muted-foreground">Hiệu lực đến {formatDate(r.validUntil)}</span>
                    </span>
                  </MobileCard>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Báo giá</Th>
                    <Th>Ngày</Th>
                    <Th>Hiệu lực đến</Th>
                    <Th className="text-right">Tổng tiền</Th>
                    <Th>Đơn hàng</Th>
                    <Th>Người lập</Th>
                    <Th>Trạng thái</Th>
                    <Th />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.data.items.map((r) => {
                    const shown = displayStatus(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="pl-4">
                          <TitleCell icon={FileText} href={`/quotes/${r.id}`} title={r.customerName} sub={r.code} />
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDate(r.date)}</TableCell>
                        <TableCell className="tabular-nums">{formatDate(r.validUntil)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.total)}</TableCell>
                        <TableCell>
                          {r.order ? (
                            <Link href={`/contracts/${r.order.id}`} className="block max-w-44 break-all whitespace-normal hover:text-primary hover:underline">
                              {r.order.code}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{r.createdBy.fullName}</TableCell>
                        <TableCell>
                          <StatusPill tone={QUOTE_TONE[shown]}>{QUOTE_STATUS_LABELS[shown]}</StatusPill>
                          {sentLine(r) && <div className="mt-1 max-w-48 text-xs whitespace-normal text-muted-foreground">{sentLine(r)}</div>}
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
            <Pager className="mt-0 border-t px-4 py-3" page={quotes.data.page} totalPages={quotes.data.totalPages} total={quotes.data.total} pageSize={20} unit="báo giá" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
