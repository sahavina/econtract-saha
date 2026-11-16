'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { StatusPill, type Tone } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/lib/types';

const TYPE_STYLE: Record<CalendarEvent['type'], { label: string; tone: Tone }> = {
  EXPIRY: { label: 'Hết hạn', tone: 'red' },
  EFFECTIVE: { label: 'Hiệu lực', tone: 'green' },
  PAYMENT: { label: 'Thanh toán', tone: 'sky' },
  OBLIGATION: { label: 'Nghĩa vụ', tone: 'amber' },
};
/** Màu thẻ sự kiện trong ô lịch, cùng tông với StatusPill. */
const CHIP: Partial<Record<Tone, string>> = {
  red: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300',
  green: 'border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300',
  sky: 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  amber: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAY_FULL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** Số sự kiện hiển thị tối đa trong một ô trước khi gộp "+N". */
const MAX_IN_CELL = 3;

const pad = (n: number) => String(n).padStart(2, '0');
const eventHref = (e: CalendarEvent) => `/contracts/${e.contractId}?tab=${e.type === 'PAYMENT' || e.type === 'OBLIGATION' ? 'lifecycle' : 'overview'}`;

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [expanded, setExpanded] = useState<string[]>([]);
  const month = `${cursor.y}-${pad(cursor.m + 1)}`;
  const q = useQuery({ queryKey: ['calendar', month], queryFn: () => api<CalendarEvent[]>('/lifecycle/calendar', { query: { month } }) });

  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Thứ Hai là cột đầu
  const trail = (7 - ((lead + days) % 7)) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1), ...Array(trail).fill(null)];
  const now = useNow();
  const todayKey = now ? new Date(now).toISOString().slice(0, 10) : '';
  const shift = (delta: number) => setCursor(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }));
  const toggle = (key: string) => setExpanded((x) => (x.includes(key) ? x.filter((k) => k !== key) : [...x, key]));

  // Lịch dạng danh sách cho điện thoại: chỉ những ngày có sự kiện.
  const agenda = q.data
    ? Array.from({ length: days }, (_, i) => i + 1)
        .map((d) => {
          const key = `${month}-${pad(d)}`;
          return { d, key, events: q.data.filter((e) => e.date === key) };
        })
        .filter((g) => g.events.length > 0)
    : [];

  return (
    <>
      <PageHeader
        title="Lịch hợp đồng"
        description="Ngày hiệu lực, hết hạn, hạn thanh toán và hạn nghĩa vụ của các hợp đồng bạn được xem."
        crumbs={[{ label: 'Tổng quan' }, { label: 'Lịch hợp đồng' }]}
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 max-sm:w-full">
            <Button variant="outline" size="icon-sm" aria-label="Tháng trước" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <h2 className="flex flex-1 items-center justify-center gap-2 text-base font-semibold whitespace-nowrap sm:w-40 sm:flex-none">
              <CalendarDays className="size-4 text-primary" />
              Tháng {cursor.m + 1}/{cursor.y}
            </h2>
            <Button variant="outline" size="icon-sm" aria-label="Tháng sau" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:ml-auto">
            {Object.values(TYPE_STYLE).map((t) => (
              <StatusPill key={t.label} tone={t.tone}>
                {t.label}
              </StatusPill>
            ))}
          </div>
        </div>

        {q.isError ? (
          <div className="p-4">
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : !q.data ? (
          <div className="p-4">
            <Skeleton className="h-96" />
          </div>
        ) : (
          <>
            {/* Lưới tháng (máy tính, máy tính bảng) */}
            <div className="hidden md:block">
              <div className="grid grid-cols-7 border-b bg-muted/40">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={cn('px-2 py-2 text-center text-xs font-semibold text-muted-foreground', i >= 5 && 'text-foreground/60')}>
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  const key = d ? `${month}-${pad(d)}` : `empty-${i}`;
                  const events = d ? q.data.filter((e) => e.date === key) : [];
                  const isToday = key === todayKey;
                  const open = expanded.includes(key);
                  const shown = open ? events : events.slice(0, MAX_IN_CELL);
                  const hidden = events.length - shown.length;
                  return (
                    <div
                      key={key}
                      className={cn(
                        'min-h-28 min-w-0 border-b p-1.5 text-xs [&:not(:nth-child(7n))]:border-r',
                        !d && 'bg-muted/30',
                        d && i % 7 >= 5 && 'bg-muted/15',
                        isToday && 'bg-primary/5 ring-1 ring-primary/30 ring-inset',
                      )}
                    >
                      {d && (
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={cn(
                              'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                              isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground/80',
                            )}
                          >
                            {d}
                          </span>
                          {isToday && <span className="text-[10px] font-medium text-primary">Hôm nay</span>}
                        </div>
                      )}
                      <ul className="space-y-1">
                        {shown.map((e, j) => (
                          <li key={j}>
                            <Link
                              href={eventHref(e)}
                              className={cn('block truncate rounded border-l-2 px-1.5 py-0.5 hover:opacity-80', CHIP[TYPE_STYLE[e.type].tone], e.done && 'line-through opacity-60')}
                              title={`${TYPE_STYLE[e.type].label} · ${e.contractCode} – ${e.title}`}
                            >
                              <span className="font-medium">{e.contractCode}</span>: {e.title}
                            </Link>
                          </li>
                        ))}
                        {(hidden > 0 || (open && events.length > MAX_IN_CELL)) && (
                          <li>
                            <button type="button" className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10" onClick={() => toggle(key)}>
                              {open ? 'Thu gọn' : `+${hidden} khác`}
                            </button>
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Danh sách theo ngày (điện thoại) */}
            <div className="md:hidden">
              {agenda.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Không có sự kiện trong tháng" description="Chọn tháng khác để xem các mốc của hợp đồng." />
                </div>
              ) : (
                <ul className="divide-y">
                  {agenda.map((g) => {
                    const isToday = g.key === todayKey;
                    return (
                      <li key={g.key} className="flex gap-3 px-4 py-3">
                        <div className={cn('flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5', isToday ? 'border-primary bg-primary text-primary-foreground' : 'bg-muted/40')}>
                          <span className="text-[10px] leading-none uppercase opacity-80">{WEEKDAYS[(new Date(cursor.y, cursor.m, g.d).getDay() + 6) % 7]}</span>
                          <span className="mt-0.5 text-lg leading-tight font-bold tabular-nums">{g.d}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="mb-1.5 text-xs text-muted-foreground">
                            {WEEKDAY_FULL[new Date(cursor.y, cursor.m, g.d).getDay()]}, {pad(g.d)}/{pad(cursor.m + 1)}/{cursor.y}
                            {isToday && <span className="ml-1.5 font-medium text-primary">· Hôm nay</span>}
                          </p>
                          <ul className="space-y-1.5">
                            {g.events.map((e, j) => (
                              <li key={j}>
                                <Link href={eventHref(e)} className={cn('block rounded-lg border px-3 py-2 hover:bg-muted/50', e.done && 'opacity-60')}>
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs font-semibold">{e.contractCode}</span>
                                    <StatusPill tone={TYPE_STYLE[e.type].tone}>{TYPE_STYLE[e.type].label}</StatusPill>
                                  </span>
                                  <span className={cn('mt-0.5 line-clamp-2 block text-sm', e.done && 'line-through')}>{e.title}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
