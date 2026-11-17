'use client';

import { INSPECTION_BOARD, INSPECTION_STATUS_LABELS, type InspectionStatus } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, ClipboardCheck, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { InitialsAvatar, SearchBox, StatusPill } from '@/components/list-ui';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { type InspectionListItem, isOverdue, targetOf } from '@/lib/inspection';
import { cn } from '@/lib/utils';

type Scope = 'mine' | 'sent' | 'all';

const COLUMN_STYLE: Record<InspectionStatus, string> = {
  PENDING: 'border-t-amber-400',
  IN_PROGRESS: 'border-t-sky-500',
  DONE: 'border-t-emerald-500',
  ISSUE: 'border-t-red-500',
  CANCELLED: 'border-t-gray-400',
};

/** Hàng chờ kiểm tra: các yêu cầu xếp theo cột trạng thái; người phụ trách thấy việc của mình, quản lý thấy tất cả. */
export default function InspectionsPage() {
  const { can } = useAuth();
  const manager = can('inspection.manage');
  const [scope, setScope] = useState<Scope>('mine');
  const [search, setSearch] = useState('');
  const list = useQuery({
    queryKey: ['inspections', scope, search],
    queryFn: () => api<Paginated<InspectionListItem>>('/inspections', { query: { scope, q: search || undefined, pageSize: 100 } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const items = list.data?.items ?? [];
  const tabs: { id: Scope; label: string }[] = [
    { id: 'mine', label: 'Việc của tôi' },
    { id: 'sent', label: 'Tôi đã gửi' },
    ...(manager ? [{ id: 'all' as const, label: 'Tất cả' }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Yêu cầu kiểm tra"
        description="Hàng chờ kiểm tra hợp đồng, đơn hàng: nhận xử lý, ghi kết quả, in phiếu kèm mã QR."
        crumbs={[{ label: 'Tổng quan' }, { label: 'Yêu cầu kiểm tra' }]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Phạm vi" className="inline-flex rounded-lg border bg-card p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={scope === t.id}
              onClick={() => setScope(t.id)}
              className={cn('rounded-md px-3 py-1.5 text-sm transition-colors', scope === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm theo số yêu cầu, số hợp đồng/đơn, nội dung…" ariaLabel="Tìm yêu cầu kiểm tra" />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {INSPECTION_BOARD.map((status) => {
            const col = items.filter((r) => r.status === status);
            return (
              <section key={status} aria-label={INSPECTION_STATUS_LABELS[status]} className={cn('rounded-xl border border-t-4 bg-muted/30', COLUMN_STYLE[status])}>
                <header className="flex items-center justify-between px-3 py-2.5">
                  <h2 className="text-sm font-semibold">{INSPECTION_STATUS_LABELS[status]}</h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums">{list.isPending ? '…' : col.length}</span>
                </header>
                <div className="space-y-2 px-2 pb-2">
                  {list.isPending ? (
                    <Skeleton className="h-24" />
                  ) : col.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">Không có yêu cầu</p>
                  ) : (
                    col.map((r) => <InspectionCard key={r.id} r={r} scope={scope} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {!list.isPending && items.length === 0 && !list.isError && (
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="size-4" /> Gửi yêu cầu từ trang hợp đồng/đơn hàng: Thao tác → Yêu cầu kiểm tra.
        </p>
      )}
    </>
  );
}

function InspectionCard({ r, scope }: { r: InspectionListItem; scope: Scope }) {
  const overdue = isOverdue(r);
  const target = targetOf(r);
  const person = scope === 'mine' ? r.requestedBy : r.assignee;
  return (
    <Link
      href={`/inspections/${r.id}`}
      className="block rounded-lg border bg-card p-3 shadow-[0_1px_2px_0_rgb(15_23_42/0.05)] transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-primary">{r.code}</span>
        <span className="flex flex-wrap justify-end gap-1">
          {overdue && <StatusPill tone="red">Quá hạn</StatusPill>}
          {r.printedAt ? (
            <StatusPill tone="teal" className="gap-1">
              <Printer className="size-3" aria-hidden /> Đã in{r.printCount > 1 ? ` ×${r.printCount}` : ''}
            </StatusPill>
          ) : (
            <StatusPill tone="gray">Chưa in</StatusPill>
          )}
        </span>
      </span>
      <span className="mt-1 block text-sm font-medium break-words">
        {target.code} · {target.title}
      </span>
      {target.party && <span className="block truncate text-xs text-muted-foreground">{target.party}</span>}
      <span className="mt-1.5 line-clamp-2 block text-xs text-muted-foreground">{r.content}</span>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <InitialsAvatar name={person.fullName} className="size-6 text-[10px]" />
          <span className="truncate">
            <span className="text-muted-foreground">{scope === 'mine' ? 'Gửi bởi ' : 'Phụ trách: '}</span>
            {person.fullName}
          </span>
        </span>
        {r.dueDate && (
          <span className={cn('flex shrink-0 items-center gap-1 tabular-nums', overdue ? 'font-medium text-red-600' : 'text-muted-foreground')}>
            <CalendarClock className="size-3.5" aria-hidden /> {formatDate(r.dueDate)}
          </span>
        )}
      </span>
      {r.status === 'ISSUE' && r.result && <span className="mt-2 line-clamp-2 block rounded bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">{r.result}</span>}
    </Link>
  );
}
