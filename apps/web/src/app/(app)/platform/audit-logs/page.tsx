'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { InitialsAvatar, ListCard, ListState, PersonCell, Th } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
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

  const tenantLink = (r: PlatformAuditRow) => (
    <Link href={`/platform/tenants/${r.tenant.id}`} className="font-medium text-primary hover:underline">
      {r.tenant.name}
    </Link>
  );

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" description="Nhật ký của mọi doanh nghiệp; chỉ đọc." crumbs={[{ label: 'Super Admin' }, { label: 'Nhật ký hệ thống' }]} />
      <ListCard
        toolbar={
          <>
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-56 sm:flex-none" allLabel="Mọi hoạt động" ariaLabel="Phạm vi" value={scope} onChange={(v) => { setScope(v); setPage(1); }} options={[{ value: 'platform', label: 'Thao tác của Super Admin' }]} />
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-64 sm:flex-none" allLabel="Mọi doanh nghiệp" ariaLabel="Doanh nghiệp" value={tenantId} onChange={(v) => { setTenantId(v); setPage(1); }} options={(tenants.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </>
        }
      >
        <ListState query={q} empty={{ title: 'Chưa có nhật ký' }} />
        {!!q.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {q.data.items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <InitialsAvatar name={r.actorName ?? 'Hệ thống'} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      <span className="font-semibold">{r.actorName ?? 'Hệ thống'}</span> <span className="text-muted-foreground">{(AUDIT_ACTION_LABELS[r.action] ?? r.action).toLowerCase()}</span>
                    </p>
                    <p className="line-clamp-1">{tenantLink(r)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)}
                      {r.ip && ` · ${r.ip}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Người thực hiện</Th>
                    <Th>Hành động</Th>
                    <Th>Doanh nghiệp</Th>
                    <Th>Thời gian</Th>
                    <Th className="pr-4">IP</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">
                        <PersonCell name={r.actorName ?? 'Hệ thống'} />
                      </TableCell>
                      <TableCell className="max-w-80 whitespace-normal">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal">{tenantLink(r)}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="pr-4 text-xs text-muted-foreground">{r.ip ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} pageSize={50} unit="bản ghi" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
