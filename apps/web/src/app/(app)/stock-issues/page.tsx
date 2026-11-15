'use client';

import { STOCK_ISSUE_STATUS_LABELS } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageMinus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { DateRange, ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, TitleCell } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { StockIssueListItem } from '@/lib/types';

/** Danh sách phiếu xuất kho (mẫu 02-VT). */
export default function StockIssuesPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const issues = useQuery({
    queryKey: ['stock-issues', q, status, from, to, page],
    queryFn: () => api<Paginated<StockIssueListItem>>('/stock-issues', { query: { q, status, from, to, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const pill = (i: StockIssueListItem) => <StatusPill tone={i.status === 'CANCELLED' ? 'red' : 'green'}>{STOCK_ISSUE_STATUS_LABELS[i.status]}</StatusPill>;

  return (
    <>
      <PageHeader
        title="Phiếu xuất kho"
        description="Phiếu xuất kho theo mẫu 02-VT. Phiếu lập từ đơn đặt hàng tự cộng số lượng đã giao của đơn; hủy phiếu thì trừ lại"
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Phiếu xuất kho' }]}
        actions={
          can('delivery.manage') && (
            <Button asChild className="h-9">
              <Link href="/stock-issues/new">
                <PackageMinus /> Lập phiếu xuất kho
              </Link>
            </Button>
          )
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={q} onChange={reset(setQ)} placeholder="Tìm số phiếu, người nhận, số đơn…" ariaLabel="Tìm phiếu xuất kho" />
            <FilterSelect
              className="h-9 w-40"
              allLabel="Mọi trạng thái"
              value={status}
              onChange={reset(setStatus)}
              options={Object.entries(STOCK_ISSUE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              ariaLabel="Trạng thái"
            />
            <DateRange from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)} title="Lọc theo ngày xuất" />
          </>
        }
      >
        <ListState query={issues} empty={{ title: 'Chưa có phiếu xuất kho', description: can('delivery.manage') ? 'Lập phiếu từ một đơn đặt hàng hoặc bấm “Lập phiếu xuất kho”.' : undefined }} />
        {!!issues.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {issues.data.items.map((i) => (
                <MobileCard key={i.id} href={`/stock-issues/${i.id}`} title={i.receiverName} sub={`${i.code} · ${formatDate(i.issueDate)}`} status={pill(i)}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">{formatMoney(i.totalAmount)}</span>
                    {i.order && <span className="text-xs text-muted-foreground">Đơn {i.order.code}</span>}
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Phiếu xuất</Th>
                    <Th>Ngày xuất</Th>
                    <Th>Đơn đặt hàng</Th>
                    <Th>Lý do</Th>
                    <Th className="text-right">Thành tiền</Th>
                    <Th>Trạng thái</Th>
                    <Th>Người lập</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.data.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={PackageMinus} href={`/stock-issues/${i.id}`} title={i.receiverName} sub={i.receiverUnit ? `${i.code} · ${i.receiverUnit}` : i.code} />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(i.issueDate)}</TableCell>
                      <TableCell>
                        {i.order ? (
                          <Link href={`/contracts/${i.order.id}`} className="hover:text-primary hover:underline">
                            {i.order.code}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{i.reason ?? '—'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(i.totalAmount)}</TableCell>
                      <TableCell>{pill(i)}</TableCell>
                      <TableCell>{i.createdBy.fullName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={issues.data.page} totalPages={issues.data.totalPages} total={issues.data.total} pageSize={20} unit="phiếu" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
