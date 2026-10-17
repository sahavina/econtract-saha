'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { ErrorState, PageHeader } from '@/components/page-header';
import { CreateInvoiceDialog, InvoiceTable } from '@/components/platform-invoices';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Paginated } from '@/lib/api';
import { type Invoice, type TenantRow, usePlatformGate } from '@/lib/platform';

const STATUS_OPTIONS = [
  { value: 'ISSUED', label: 'Chờ thanh toán' },
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'VOID', label: 'Đã hủy' },
];

export default function PlatformInvoicesPage() {
  const { allowed, denied } = usePlatformGate();
  const search = useSearchParams();
  const [status, setStatus] = useState<string | undefined>(search.get('status') ?? undefined);
  const [tenantId, setTenantId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['platform', 'invoices', { status, tenantId, page }],
    queryFn: () => api<Paginated<Invoice>>('/platform/invoices', { query: { status, tenantId, page, pageSize: 30 } }),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', 'all'],
    queryFn: () => api<Paginated<TenantRow>>('/platform/tenants', { query: { pageSize: 100 } }),
    enabled: allowed,
  });
  if (!allowed) return denied;

  return (
    <>
      <PageHeader
        title="Hóa đơn thuê bao"
        crumbs={[{ label: 'Super Admin' }, { label: 'Hóa đơn' }]}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!tenants.data}>
            <Plus /> Phát hành hóa đơn
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
        <FilterSelect className="w-64" allLabel="Mọi doanh nghiệp" value={tenantId} onChange={(v) => { setTenantId(v); setPage(1); }} options={(tenants.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="rounded-lg border px-2">
          <InvoiceTable invoices={list.data.items} showTenant />
        </div>
      )}
      {list.data && list.data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </Button>
          Trang {list.data.page}/{list.data.totalPages}
          <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
      {creating && tenants.data && <CreateInvoiceDialog tenants={tenants.data.items} onClose={() => setCreating(false)} />}
    </>
  );
}
