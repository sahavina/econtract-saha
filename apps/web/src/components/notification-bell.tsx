'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, type Paginated } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

/** Chuông thông báo: số chưa đọc cập nhật mỗi phút, danh sách 8 thông báo mới nhất. */
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const count = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const latest = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: () => api<Paginated<AppNotification>>('/notifications', { query: { pageSize: 8 } }),
    enabled: false,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: (id: string) => api<undefined>(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => api<undefined>('/notifications/read-all', { method: 'POST' }), onSuccess: invalidate });
  const unread = count.data?.count ?? 0;

  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate(n.id);
    setMenuOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(o) => {
        setMenuOpen(o);
        if (o) void latest.refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}>
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Thông báo</DropdownMenuLabel>
          <Button variant="ghost" size="sm" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck /> Đọc tất cả
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto">
          {!latest.data ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Đang tải…</p>
          ) : latest.data.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chưa có thông báo.</p>
          ) : (
            latest.data.items.map((n) => (
              <button key={n.id} onClick={() => open(n)} className={cn('flex w-full gap-2 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted', !n.readAt && 'bg-primary/5')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-[11px] text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <Link href="/notifications" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-center text-sm text-primary hover:underline">
          Xem tất cả thông báo
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
