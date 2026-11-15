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
import { useAuth } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, formatDateTime } from '@/lib/format';
import type { TimelineEntry } from '@/lib/types';

interface AuditRow extends TimelineEntry {
  entityType: string;
  ip: string | null;
}

const ENTITY_LABELS: Record<string, string> = { contract: 'Hợp đồng', partner: 'Đối tác', user: 'Người dùng' };

export default function AuditLogsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState<string | undefined>();
  const q = useQuery({
    queryKey: ['audit-logs', { page, entityType }],
    queryFn: () => api<Paginated<AuditRow>>('/audit-logs', { query: { page, pageSize: 50, entityType } }),
    placeholderData: keepPreviousData,
    enabled: can('audit.view'),
  });

  if (!can('audit.view')) return <p className="text-sm text-muted-foreground">Bạn không có quyền xem nhật ký hoạt động.</p>;

  /** Đối tượng: hợp đồng có liên kết, còn lại ghi loại. */
  const target = (r: AuditRow) =>
    r.entityType === 'contract' && r.entityId ? (
      <Link className="font-medium text-primary hover:underline" href={`/contracts/${r.entityId}`}>
        {String((r.data as { code?: string } | null)?.code ?? 'Hợp đồng')}
      </Link>
    ) : (
      (ENTITY_LABELS[r.entityType] ?? r.entityType)
    );

  return (
    <>
      <PageHeader title="Nhật ký hoạt động" description="Ghi nhận từ máy chủ, không thể chỉnh sửa hay xóa" crumbs={[{ label: 'Quản trị' }, { label: 'Nhật ký hoạt động' }]} />
      <ListCard
        toolbar={
          <FilterSelect className="h-9 w-44" allLabel="Mọi đối tượng" value={entityType} onChange={(v) => { setEntityType(v); setPage(1); }} options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))} ariaLabel="Đối tượng" />
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
                      <span className="font-semibold">{r.actorName ?? 'Hệ thống'}</span> <span className="text-muted-foreground">{(AUDIT_ACTION_LABELS[r.action] ?? r.action).toLowerCase()}</span> {target(r)}
                    </p>
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
                    <Th>Đối tượng</Th>
                    <Th>Thời gian</Th>
                    <Th>IP</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">
                        <PersonCell name={r.actorName ?? 'Hệ thống'} />
                      </TableCell>
                      <TableCell className="max-w-80 whitespace-normal">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</TableCell>
                      <TableCell>{target(r)}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.ip ?? '—'}</TableCell>
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
