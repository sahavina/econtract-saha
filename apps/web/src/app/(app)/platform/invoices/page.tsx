'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { ListCard, ListState } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { CreateInvoiceDialog, InvoiceTable } from '@/components/platform-invoices';
import { Button } from '@/components/ui/button';
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
        description="Hóa đơn thu phí thuê bao của các doanh nghiệp."
        crumbs={[{ label: 'Super Admin' }, { label: 'Hóa đơn' }]}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!tenants.data}>
            <Plus /> Phát hành hóa đơn
          </Button>
        }
      />
      <ListCard
        toolbar={
          <>
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-44 sm:flex-none" allLabel="Mọi trạng thái" ariaLabel="Trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-64 sm:flex-none" allLabel="Mọi doanh nghiệp" ariaLabel="Doanh nghiệp" value={tenantId} onChange={(v) => { setTenantId(v); setPage(1); }} options={(tenants.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </>
        }
      >
        <ListState query={list} empty={{ title: 'Chưa có hóa đơn' }} />
        {!!list.data?.items.length && (
          <>
            <InvoiceTable invoices={list.data.items} showTenant />
            <Pager className="mt-0 border-t px-4 py-3" page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={30} unit="hóa đơn" onPage={setPage} />
          </>
        )}
      </ListCard>
      {creating && tenants.data && <CreateInvoiceDialog tenants={tenants.data.items} onClose={() => setCreating(false)} />}
    </>
  );
}
