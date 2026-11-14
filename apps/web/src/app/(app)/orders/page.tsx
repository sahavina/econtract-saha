'use client';

import { CONTRACT_STATUS_LABELS, CONTRACT_STATUSES, ORDER_FULFILLMENT_LABELS } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Package, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { ContractStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { FULFILLMENT_BADGE, orderProgress } from '@/lib/orders';
import type { ContractListItem, OrderSummary, Partner } from '@/lib/types';

const PAGE_SIZE = 20;

/** Đơn đặt hàng: lọc theo khách hàng / hợp đồng nguyên tắc, tổng hợp giá trị và tình trạng giao hàng. */
export default function OrdersPage() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = {
    partnerId: params.get('partnerId') ?? '',
    parentContractId: params.get('parentContractId') ?? '',
    status: params.get('status') ?? '',
    q: params.get('q') ?? '',
  };
  const page = Number(params.get('page') ?? '1') || 1;
  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    // Đổi khách hàng ⇒ bỏ chọn hợp đồng nguyên tắc của khách cũ.
    if (key === 'partnerId') next.delete('parentContractId');
    router.replace(`${pathname}?${next.toString()}`);
  };

  const customers = useQuery({
    queryKey: ['partners', 'customers-for-orders'],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { type: 'CUSTOMER', pageSize: 100 } }),
  });
  const parents = useQuery({
    queryKey: ['contracts', 'parents', filters.partnerId],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'CONTRACT', partnerId: filters.partnerId, pageSize: 100 } }),
  });
  const orders = useQuery({
    queryKey: ['orders', filters, page],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { ...filters, kind: 'ORDER', page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['orders', 'summary', filters],
    queryFn: () => api<OrderSummary>('/contracts/order-summary', { query: filters }),
  });
  const customer = customers.data?.items.find((c) => c.id === filters.partnerId);
  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Đơn đặt hàng"
        description="Theo dõi đơn đặt hàng theo khách hàng và hợp đồng nguyên tắc: giá trị, tình trạng phê duyệt/ký và giao hàng."
        crumbs={[{ label: 'Đơn đặt hàng' }]}
        actions={
          can('contract.create') && (
            <Button asChild>
              <Link href={`/orders/new${filters.parentContractId ? `?parent=${filters.parentContractId}` : ''}`}>
                <Plus /> Tạo đơn đặt hàng
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect
          className="w-72"
          allLabel="Tất cả khách hàng"
          value={filters.partnerId}
          onChange={(v) => setParam('partnerId', v)}
          options={(customers.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
          ariaLabel="Khách hàng"
        />
        <FilterSelect
          className="w-72"
          allLabel="Tất cả hợp đồng nguyên tắc"
          value={filters.parentContractId}
          onChange={(v) => setParam('parentContractId', v)}
          options={(parents.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.parties[0]?.name ?? c.title}` }))}
          ariaLabel="Hợp đồng nguyên tắc"
        />
        <FilterSelect
          allLabel="Mọi trạng thái"
          value={filters.status}
          onChange={(v) => setParam('status', v)}
          options={CONTRACT_STATUSES.map((s) => ({ value: s, label: CONTRACT_STATUS_LABELS[s] }))}
          ariaLabel="Trạng thái"
        />
        <Input
          className="w-60"
          placeholder="Tìm số đơn, tên, khách hàng…"
          defaultValue={filters.q}
          onKeyDown={(e) => e.key === 'Enter' && setParam('q', e.currentTarget.value.trim() || undefined)}
          aria-label="Tìm đơn hàng"
        />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">{customer ? `Tổng hợp đơn hàng – ${customer.name}` : 'Tổng hợp đơn hàng'}</CardTitle>
          <CardDescription>Theo bộ lọc hiện tại · giá trị chưa gồm VAT · tình trạng giao tính trên các đơn đã ký.</CardDescription>
        </CardHeader>
        <CardContent>
          {!summary.data ? (
            <Skeleton className="h-16" />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Số đơn" value={`${summary.data.count}`} hint={`${summary.data.signed} đơn đã ký`} />
              <Stat label="Tổng giá trị" value={formatMoney(summary.data.value)} />
              <Stat label="Đã giao" value={formatMoney(summary.data.deliveredValue)} />
              <Stat label="Còn phải giao" value={formatMoney(summary.data.remainingValue)} />
              <Stat
                label="Tình trạng giao (đơn đã ký)"
                value={`${summary.data.byFulfillment.DONE} đủ · ${summary.data.byFulfillment.PARTIAL} một phần`}
                hint={`${summary.data.byFulfillment.NONE} đơn chưa giao`}
              />
            </dl>
          )}
        </CardContent>
      </Card>

      {orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : !orders.data ? (
        <Skeleton className="h-64" />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có đơn đặt hàng"
          description="Tạo đơn mới hoặc mở một hợp đồng nguyên tắc và chọn “Tạo đơn đặt hàng”."
          action={
            can('contract.create') && (
              <Button asChild>
                <Link href="/orders/new">
                  <Package /> Tạo đơn đặt hàng
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số đơn</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Hợp đồng nguyên tắc</TableHead>
                  <TableHead>Ngày giao</TableHead>
                  <TableHead className="text-right">Giá trị</TableHead>
                  <TableHead>Giao hàng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data.items.map((o) => {
                  const p = orderProgress(o);
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/contracts/${o.id}`} className="font-medium text-primary hover:underline">
                          {o.code}
                        </Link>
                        <p className="max-w-64 truncate text-xs text-muted-foreground" title={o.title}>
                          {o.title}
                        </p>
                      </TableCell>
                      <TableCell>
                        {o.parties[0]?.partnerId ? (
                          <button type="button" className="text-left hover:underline" onClick={() => setParam('partnerId', o.parties[0].partnerId ?? undefined)}>
                            {o.parties[0].name}
                          </button>
                        ) : (
                          (o.parties[0]?.name ?? '—')
                        )}
                      </TableCell>
                      <TableCell>
                        {o.parentContract ? (
                          <Link href={`/contracts/${o.parentContract.id}?tab=orders`} className="hover:underline">
                            {o.parentContract.code}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(o.deliveryDate)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(o.value, o.currency)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${FULFILLMENT_BADGE[p.fulfillment]}`}>
                          {ORDER_FULFILLMENT_LABELS[p.fulfillment]}
                          {p.fulfillment === 'PARTIAL' && ` · ${p.percent}%`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={o.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>
              Trang {page}/{totalPages} · {orders.data.total} đơn
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))}>
              <ChevronRight />
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
