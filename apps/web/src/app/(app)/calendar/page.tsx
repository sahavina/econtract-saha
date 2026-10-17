'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/lib/types';

const TYPE_STYLE: Record<CalendarEvent['type'], { label: string; cls: string }> = {
  EXPIRY: { label: 'Hết hạn', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  EFFECTIVE: { label: 'Hiệu lực', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  PAYMENT: { label: 'Thanh toán', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  OBLIGATION: { label: 'Nghĩa vụ', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
};
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const pad = (n: number) => String(n).padStart(2, '0');

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const month = `${cursor.y}-${pad(cursor.m + 1)}`;
  const q = useQuery({ queryKey: ['calendar', month], queryFn: () => api<CalendarEvent[]>('/lifecycle/calendar', { query: { month } }) });

  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Thứ Hai là cột đầu
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const now = useNow();
  const todayKey = now ? new Date(now).toISOString().slice(0, 10) : '';
  const shift = (delta: number) => setCursor(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }));

  return (
    <>
      <PageHeader
        title="Lịch hợp đồng"
        description="Ngày hiệu lực, hết hạn, hạn thanh toán và hạn nghĩa vụ của các hợp đồng bạn được xem."
        crumbs={[{ label: 'Tổng quan' }, { label: 'Lịch hợp đồng' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" aria-label="Tháng trước" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <span className="w-32 text-center font-medium whitespace-nowrap">
              Tháng {cursor.m + 1}/{cursor.y}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Tháng sau" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {Object.values(TYPE_STYLE).map((t) => (
          <span key={t.label} className={cn('rounded px-2 py-0.5', t.cls)}>
            {t.label}
          </span>
        ))}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-lg border">
            {WEEKDAYS.map((w) => (
              <div key={w} className="border-b bg-muted/50 px-2 py-1.5 text-center text-xs font-medium">
                {w}
              </div>
            ))}
            {cells.map((d, i) => {
              const key = d ? `${month}-${pad(d)}` : `empty-${i}`;
              const events = d ? q.data.filter((e) => e.date === key) : [];
              return (
                <div key={key} className={cn('min-h-28 border-r border-b p-1.5 text-xs', !d && 'bg-muted/20', key === todayKey && 'bg-primary/5')}>
                  {d && <div className={cn('mb-1 font-medium', key === todayKey && 'text-primary')}>{d}</div>}
                  <ul className="space-y-1">
                    {events.map((e, j) => (
                      <li key={j}>
                        <Link
                          href={`/contracts/${e.contractId}?tab=${e.type === 'PAYMENT' || e.type === 'OBLIGATION' ? 'lifecycle' : 'overview'}`}
                          className={cn('block truncate rounded px-1.5 py-0.5 hover:opacity-80', TYPE_STYLE[e.type].cls, e.done && 'line-through opacity-60')}
                          title={`${e.contractCode} – ${e.title}`}
                        >
                          {e.contractCode}: {e.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
