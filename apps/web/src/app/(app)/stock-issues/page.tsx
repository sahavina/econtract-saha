'use client';

import { STOCK_ISSUE_STATUS_LABELS } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageMinus } from 'lucide-react';
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

  return (
    <>
      <PageHeader
        title="Phiếu xuất kho"
        description="Phiếu xuất kho theo mẫu 02-VT. Phiếu lập từ đơn đặt hàng tự cộng số lượng đã giao của đơn; hủy phiếu thì trừ lại."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Phiếu xuất kho' }]}
        actions={
          can('delivery.manage') && (
            <Button asChild>
              <Link href="/stock-issues/new">
                <PackageMinus /> Lập phiếu xuất kho
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-72" placeholder="Tìm số phiếu, người nhận, số đơn…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Tìm phiếu xuất kho" />
        <FilterSelect
          allLabel="Mọi trạng thái"
          value={status}
          onChange={reset(setStatus)}
          options={Object.entries(STOCK_ISSUE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Từ <Input type="date" className="w-40" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="Từ ngày" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          đến <Input type="date" className="w-40" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="Đến ngày" />
        </label>
      </div>
      {issues.isError ? (
        <ErrorState error={issues.error} onRetry={() => issues.refetch()} />
      ) : !issues.data ? (
        <Skeleton className="h-64" />
      ) : issues.data.items.length === 0 ? (
        <EmptyState title="Chưa có phiếu xuất kho" description={can('delivery.manage') ? 'Lập phiếu từ một đơn đặt hàng hoặc bấm “Lập phiếu xuất kho”.' : undefined} />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số phiếu</TableHead>
                  <TableHead>Ngày xuất</TableHead>
                  <TableHead>Người nhận / đơn vị</TableHead>
                  <TableHead>Đơn đặt hàng</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Người lập</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.data.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/stock-issues/${i.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">
                        {i.code}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(i.issueDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{i.receiverName}</div>
                      {i.receiverUnit && <div className="text-xs text-muted-foreground">{i.receiverUnit}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {i.order ? (
                        <Link href={`/contracts/${i.order.id}`} className="hover:underline">
                          {i.order.code}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{i.reason ?? '—'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(i.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={i.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{STOCK_ISSUE_STATUS_LABELS[i.status]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{i.createdBy.fullName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={issues.data.page} totalPages={issues.data.totalPages} total={issues.data.total} unit="phiếu" onPage={setPage} />
        </>
      )}
    </>
  );
}
