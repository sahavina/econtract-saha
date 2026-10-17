'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { AUDIT_ACTION_LABELS, formatDateTime } from '@/lib/format';
import { type TenantRef, type TenantRow, usePlatformGate } from '@/lib/platform';

interface PlatformAuditRow {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  tenant: TenantRef;
}

export default function PlatformAuditLogsPage() {
  const { allowed, denied } = usePlatformGate();
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState<string | undefined>();
  const [scope, setScope] = useState<string | undefined>('platform');
  const q = useQuery({
    queryKey: ['platform', 'audit-logs', { page, tenantId, scope }],
    queryFn: () =>
      api<Paginated<PlatformAuditRow>>('/platform/audit-logs', { query: { page, pageSize: 50, tenantId, platformOnly: scope === 'platform' } }),
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
      <PageHeader title="Nhật ký hệ thống" description="Nhật ký của mọi doanh nghiệp; chỉ đọc." crumbs={[{ label: 'Super Admin' }, { label: 'Nhật ký hệ thống' }]} />
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect allLabel="Mọi hoạt động" value={scope} onChange={(v) => { setScope(v); setPage(1); }} options={[{ value: 'platform', label: 'Thao tác của Super Admin' }]} />
        <FilterSelect className="w-64" allLabel="Mọi doanh nghiệp" value={tenantId} onChange={(v) => { setTenantId(v); setPage(1); }} options={(tenants.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} />
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Doanh nghiệp</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isPending ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-24" />
                  </TableCell>
                </TableRow>
              ) : !q.data.items.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    <EmptyState title="Chưa có nhật ký" />
                  </TableCell>
                </TableRow>
              ) : (
                q.data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/platform/tenants/${r.tenant.id}`} className="hover:underline">
                        {r.tenant.name}
                      </Link>
                    </TableCell>
                    <TableCell>{r.actorName ?? '—'}</TableCell>
                    <TableCell>{AUDIT_ACTION_LABELS[r.action] ?? r.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.ip ?? '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {q.data && q.data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </Button>
          Trang {q.data.page}/{q.data.totalPages}
          <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= q.data.totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}
