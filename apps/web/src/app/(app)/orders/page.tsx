'use client';

import { CONTRACT_STATUS_LABELS, type ContractStatus, ORDER_FULFILLMENT_LABELS } from '@saha/shared';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleDollarSign, Eye, Package, PackageCheck, Plus, Search, SlidersHorizontal, Trash2, Truck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { ContractStatusBadge, contractAccentColor } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { FULFILLMENT_BADGE, orderProgress } from '@/lib/orders';
import type { ContractListItem, OrderSummary, Partner } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

/** Tab trạng thái chính (kèm số lượng); trạng thái còn lại trong menu "Khác". */
const TABS: { value: ContractStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'PENDING_APPROVAL', label: 'Chờ phê duyệt' },
  { value: 'PENDING_SIGNATURE', label: 'Chờ ký' },
  { value: 'SIGNED', label: 'Đã ký' },
  { value: 'ACTIVE', label: 'Đang hiệu lực' },
];
const MORE: ContractStatus[] = ['APPROVED', 'EXPIRED', 'LIQUIDATED', 'CANCELLED'];

/** Tiền dạng ngắn kiểu Việt Nam: 18,6 tỷ đ · 180 triệu đ. */
function shortMoney(v: number) {
  const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1e9) return `${fmt(v / 1e9)} tỷ đ`;
  if (Math.abs(v) >= 1e6) return `${fmt(v / 1e6)} triệu đ`;
  return `${v.toLocaleString('vi-VN')} đ`;
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Package; label: string; value: React.ReactNode; hint?: React.ReactNode; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] sm:gap-4 sm:p-4">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-5 sm:size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className="mt-0.5 block text-xl leading-tight font-bold tracking-tight break-words tabular-nums sm:text-2xl">{value}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

/** Thanh tiến độ giao hàng nhỏ trong danh sách. */
function DeliveryProgress({ order }: { order: ContractListItem }) {
  const p = orderProgress(order);
  return (
    <span className="flex min-w-32 flex-col gap-1">
      <span className={cn('inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium', FULFILLMENT_BADGE[p.fulfillment])}>
        {ORDER_FULFILLMENT_LABELS[p.fulfillment]}
        {p.fulfillment === 'PARTIAL' && ` · ${p.percent}%`}
      </span>
      {order.items.length > 0 && (
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', p.fulfillment === 'DONE' ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${p.percent}%` }} />
        </span>
      )}
    </span>
  );
}

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
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };

  const [search, setSearch] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  // URL đổi từ nơi khác (quay lại, bấm khách hàng…) ⇒ ô tìm kiếm theo URL.
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    setSearch(filters.q);
  }
  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) setParam('q', search.trim() || undefined);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const customers = useQuery({
    queryKey: ['partners', 'customers-for-orders'],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { type: 'CUSTOMER', pageSize: 100 } }),
  });
  const parents = useQuery({
    queryKey: ['contracts', 'parents', filters.partnerId],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'CONTRACT', partnerId: filters.partnerId, pageSize: 100 } }),
  });
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  /** Chỉ xóa được đơn Nháp hoặc Đã hủy (giống trang chi tiết; máy chủ cũng kiểm tra). */
  const deletable = (o: ContractListItem) => can('contract.delete') && (o.status === 'DRAFT' || o.status === 'CANCELLED');
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/contracts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã chuyển đơn vào thùng rác');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
  const askDelete = (o: ContractListItem) =>
    setConfirm({
      title: `Chuyển đơn ${o.code} vào thùng rác?`,
      description: 'Có thể khôi phục từ Thùng rác.',
      destructive: true,
      confirmLabel: 'Xóa',
      onConfirm: () => remove.mutateAsync(o.id).then(() => undefined),
    });
  /** Nút Xem (mở bản xem/in của đơn ở tab mới) và Xóa trên từng đơn. */
  const rowActions = (o: ContractListItem) => (
    <span className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={`/print/contracts/${o.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Xem đơn ${o.code}`} title="Xem bản in của đơn">
          <Eye />
        </a>
      </Button>
      {can('contract.delete') && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Xóa đơn ${o.code}`}
          title={deletable(o) ? 'Chuyển vào thùng rác' : 'Chỉ xóa được đơn Nháp hoặc Đã hủy'}
          disabled={!deletable(o) || remove.isPending}
          onClick={() => askDelete(o)}
        >
          <Trash2 />
        </Button>
      )}
    </span>
  );
  const orders = useQuery({
    queryKey: ['orders', filters, page],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { ...filters, kind: 'ORDER', page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['orders', 'summary', filters],
    queryFn: () => api<OrderSummary>('/contracts/order-summary', { query: filters }),
  });
  // Số đơn theo từng tab trạng thái (theo khách hàng / hợp đồng nguyên tắc đang chọn).
  const countResults = useQueries({
    queries: TABS.map((t) => ({
      queryKey: ['orders', 'count', t.value, filters.partnerId, filters.parentContractId],
      queryFn: () =>
        api<Paginated<ContractListItem>>('/contracts', {
          query: { kind: 'ORDER', status: t.value, partnerId: filters.partnerId, parentContractId: filters.parentContractId, pageSize: 1 },
        }),
      staleTime: 30_000,
    })),
  });
  const counts = Object.fromEntries(TABS.map((t, i) => [t.value, countResults[i].data?.total]));

  const customer = customers.data?.items.find((c) => c.id === filters.partnerId);
  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.total / PAGE_SIZE)) : 1;
  const s = summary.data;
  const fulfil = s ? s.byFulfillment.DONE + s.byFulfillment.PARTIAL + s.byFulfillment.NONE : 0;
  const moreActive = MORE.includes(filters.status as ContractStatus);

  return (
    <>
      <PageHeader
        title={customer ? `Đơn đặt hàng – ${customer.name}` : 'Đơn đặt hàng'}
        description="Theo dõi đơn đặt hàng theo khách hàng và hợp đồng nguyên tắc: giá trị, phê duyệt, ký và giao hàng"
        crumbs={[{ label: 'Không gian làm việc', href: '/' }, { label: 'Đơn đặt hàng' }]}
        actions={
          can('contract.create') && (
            <Button asChild className="h-9">
              <Link href={`/orders/new${filters.parentContractId ? `?parent=${filters.parentContractId}` : ''}`}>
                <Plus /> Tạo đơn đặt hàng
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {!s ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Kpi icon={Package} label="Số đơn" value={s.count} hint={`${s.signed} đơn đã ký`} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" />
            <Kpi icon={CircleDollarSign} label="Tổng giá trị (chưa VAT)" value={shortMoney(Number(s.value))} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
            <Kpi icon={PackageCheck} label="Đã giao" value={shortMoney(Number(s.deliveredValue))} tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" />
            <Kpi icon={Truck} label="Còn phải giao" value={shortMoney(Number(s.remainingValue))} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
          </>
        )}
      </div>

      {s && fulfil > 0 && (
        <div className="mb-4 rounded-xl border bg-card p-4 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">Tình trạng giao hàng (đơn đã ký)</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> Giao đủ {s.byFulfillment.DONE}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" /> Một phần {s.byFulfillment.PARTIAL}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-slate-300" /> Chưa giao {s.byFulfillment.NONE}</span>
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            <span className="bg-emerald-500" style={{ width: `${(s.byFulfillment.DONE / fulfil) * 100}%` }} />
            <span className="bg-amber-500" style={{ width: `${(s.byFulfillment.PARTIAL / fulfil) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
        <div className="flex items-end gap-1 overflow-x-auto border-b px-3 [scrollbar-width:thin]">
          {TABS.map((t) => {
            const active = filters.status === t.value;
            return (
              <button
                key={t.value || 'all'}
                type="button"
                onClick={() => setParam('status', t.value || undefined)}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
                )}
              >
                {t.label}
                <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{counts[t.value] ?? '·'}</span>
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'relative flex shrink-0 items-center gap-1 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground',
                  moreActive && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
                )}
              >
                {moreActive ? CONTRACT_STATUS_LABELS[filters.status as ContractStatus] : 'Khác'} <ChevronDown className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {MORE.map((st) => (
                <DropdownMenuItem key={st} onSelect={() => setParam('status', st)}>
                  {CONTRACT_STATUS_LABELS[st]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">
          <div className="relative min-w-0 flex-1 basis-48 md:min-w-56 md:basis-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Tìm số đơn, tên, khách hàng…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm đơn hàng" />
          </div>
          <Button variant={showFilters || filters.partnerId || filters.parentContractId ? 'secondary' : 'outline'} className="h-9 md:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal /> Bộ lọc
          </Button>
          <div className={cn('w-full flex-col gap-2 md:contents', showFilters ? 'flex' : 'hidden')}>
            <FilterSelect
              className="h-9 w-full md:w-72"
              allLabel="Tất cả khách hàng"
              value={filters.partnerId}
              onChange={(v) => setParam('partnerId', v)}
              options={(customers.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              ariaLabel="Khách hàng"
            />
            <FilterSelect
              className="h-9 w-full md:w-72"
              allLabel="Tất cả hợp đồng nguyên tắc"
              value={filters.parentContractId}
              onChange={(v) => setParam('parentContractId', v)}
              options={(parents.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.parties[0]?.name ?? c.title}` }))}
              ariaLabel="Hợp đồng nguyên tắc"
            />
          </div>
        </div>

        {orders.isError ? (
          <div className="p-4">
            <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
          </div>
        ) : !orders.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : orders.data.items.length === 0 ? (
          <div className="p-4">
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
          </div>
        ) : (
          <>
            {/* Điện thoại: mỗi đơn một thẻ */}
            <ul className="divide-y md:hidden">
              {orders.data.items.map((o) => (
                <li key={o.id} style={{ boxShadow: `inset 4px 0 0 ${contractAccentColor(o.status)}` }}>
                  <Link href={`/contracts/${o.id}`} className="block space-y-1.5 px-4 py-3">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="line-clamp-2 leading-snug font-semibold">{o.title}</span>
                        <span className="block text-xs text-muted-foreground">{o.code}</span>
                      </span>
                      <ContractStatusBadge status={o.status} className="shrink-0" />
                    </span>
                    {o.parties[0]?.name && <span className="line-clamp-1 block text-sm text-muted-foreground">{o.parties[0].name}</span>}
                    <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold tabular-nums">{formatMoney(o.value, o.currency)}</span>
                      <DeliveryProgress order={o} />
                    </span>
                  </Link>
                  <div className="-mt-1 px-3 pb-2">{rowActions(o)}</div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {['Đơn hàng', 'Khách hàng', 'HĐ nguyên tắc', 'Ngày giao', 'Giá trị', 'Giao hàng', 'Trạng thái', 'Thao tác'].map((h) => (
                      <TableHead key={h} className={cn('h-11 text-[13px] tracking-normal text-foreground/80 normal-case', (h === 'Giá trị' || h === 'Thao tác') && 'text-right', h === 'Đơn hàng' && 'pl-4', h === 'Thao tác' && 'pr-4')}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.data.items.map((o) => (
                    <TableRow key={o.id} style={{ boxShadow: `inset 4px 0 0 ${contractAccentColor(o.status)}` }}>
                      <TableCell className="pl-4">
                        <Link href={`/contracts/${o.id}`} className="group flex max-w-[18rem] min-w-52 items-center gap-3 whitespace-normal">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Package className="size-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-2 leading-snug font-semibold group-hover:text-primary">{o.title}</span>
                            <span className="block text-xs whitespace-nowrap text-muted-foreground">{o.code}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="line-clamp-2 block max-w-52 min-w-36 whitespace-normal">
                          {o.parties[0]?.partnerId ? (
                            <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => setParam('partnerId', o.parties[0].partnerId ?? undefined)}>
                              {o.parties[0].name}
                            </button>
                          ) : (
                            (o.parties[0]?.name ?? '—')
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {o.parentContract ? (
                          <Link href={`/contracts/${o.parentContract.id}?tab=orders`} className="hover:text-primary hover:underline">
                            {o.parentContract.code}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(o.deliveryDate)}</TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(o.value, o.currency)}</TableCell>
                      <TableCell>
                        <DeliveryProgress order={o} />
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="pr-4">{rowActions(o)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
            <Pager className="mt-0 border-t px-4 py-3" page={page} totalPages={totalPages} total={orders.data.total} pageSize={PAGE_SIZE} unit="đơn" onPage={(p) => setParam('page', String(p))} />
          </>
        )}
      </div>
    </>
  );
}
