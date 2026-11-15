'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ListCard, ListState } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { api, type Paginated } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS = [
  { value: false, label: 'Tất cả' },
  { value: true, label: 'Chưa đọc' },
] as const;

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
        description="Yêu cầu phê duyệt, ký, góp ý của khách hàng và các nhắc hạn"
        crumbs={[{ label: 'Tổng quan', href: '/' }, { label: 'Thông báo' }]}
        actions={
          <Button variant="outline" className="h-9" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            <CheckCheck /> Đánh dấu đã đọc tất cả
          </Button>
        }
      />
      <ListCard className="mx-auto max-w-4xl">
        <div className="flex items-end gap-1 border-b px-3">
          {TABS.map((t) => {
            const active = unreadOnly === t.value;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setUnreadOnly(t.value);
                  setPage(1);
                }}
                className={cn(
                  'relative shrink-0 px-3 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <ListState query={q} empty={{ title: unreadOnly ? 'Không có thông báo chưa đọc' : 'Không có thông báo' }} />
        {!!q.data?.items.length && (
          <>
            <ul className="divide-y">
              {q.data.items.map((n) => (
                <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3.5', !n.readAt && 'bg-primary/[0.04]')}>
                  <span className={cn('relative flex size-9 shrink-0 items-center justify-center rounded-full', n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                    <Bell className="size-4" />
                    {!n.readAt && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-primary" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link href={n.link} onClick={() => !n.readAt && read.mutate(n.id)} className={cn('hover:text-primary hover:underline', !n.readAt ? 'font-semibold' : 'font-medium')}>
                        {n.title}
                      </Link>
                    ) : (
                      <p className={!n.readAt ? 'font-semibold' : 'font-medium'}>{n.title}</p>
                    )}
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <Button variant="ghost" size="sm" onClick={() => read.mutate(n.id)}>
                      Đã đọc
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Pager className="mt-0 border-t px-4 py-3" page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} pageSize={30} unit="thông báo" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
