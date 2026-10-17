'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Paginated } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useQuery({
    queryKey: ['notifications', 'page', { page, unreadOnly }],
    queryFn: () => api<Paginated<AppNotification>>('/notifications', { query: { page, pageSize: 30, unreadOnly } }),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: (id: string) => api<undefined>(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => api<undefined>('/notifications/read-all', { method: 'POST' }), onSuccess: invalidate });

  return (
    <>
      <PageHeader
        title="Thông báo"
        crumbs={[{ label: 'Tổng quan' }, { label: 'Thông báo' }]}
        actions={
          <Button variant="outline" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            <CheckCheck /> Đánh dấu đã đọc tất cả
          </Button>
        }
      />
      <div className="mb-3">
        <FilterSelect
          allLabel="Tất cả"
          value={unreadOnly ? 'unread' : undefined}
          onChange={(v) => {
            setUnreadOnly(v === 'unread');
            setPage(1);
          }}
          options={[{ value: 'unread', label: 'Chưa đọc' }]}
          ariaLabel="Lọc thông báo"
        />
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="Không có thông báo" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {q.data.items.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.readAt && 'bg-primary/5')}>
              <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-muted' : 'bg-primary')} />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link href={n.link} onClick={() => !n.readAt && read.mutate(n.id)} className="font-medium hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  <p className="font-medium">{n.title}</p>
                )}
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              </div>
              {!n.readAt && (
                <Button variant="ghost" size="sm" onClick={() => read.mutate(n.id)}>
                  Đã đọc
                </Button>
              )}
            </li>
          ))}
        </ul>
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
