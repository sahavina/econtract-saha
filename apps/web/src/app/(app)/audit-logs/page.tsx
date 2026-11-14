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

  return (
    <>
      <PageHeader title="Nhật ký hoạt động" description="Ghi nhận từ backend, không thể chỉnh sửa hay xóa." crumbs={[{ label: 'Quản trị' }, { label: 'Nhật ký hoạt động' }]} />
      <div className="mb-3">
        <FilterSelect allLabel="Mọi đối tượng" value={entityType} onChange={(v) => { setEntityType(v); setPage(1); }} options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))} />
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>Đối tượng</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isPending ? (
                <TableRow><TableCell colSpan={5}><Skeleton className="h-24" /></TableCell></TableRow>
              ) : !q.data?.items.length ? (
                <TableRow><TableCell colSpan={5} className="p-4"><EmptyState title="Chưa có nhật ký" /></TableCell></TableRow>
              ) : (
                q.data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>{r.actorName ?? '—'}</TableCell>
                    <TableCell>{AUDIT_ACTION_LABELS[r.action] ?? r.action}</TableCell>
                    <TableCell>
                      {r.entityType === 'contract' && r.entityId ? (
                        <Link className="text-primary hover:underline" href={`/contracts/${r.entityId}`}>
                          {String((r.data as { code?: string } | null)?.code ?? 'Hợp đồng')}
                        </Link>
                      ) : (
                        ENTITY_LABELS[r.entityType] ?? r.entityType
                      )}
                    </TableCell>
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
          <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
          Trang {q.data.page}/{q.data.totalPages}
          <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= q.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
        </div>
      )}
    </>
  );
}
