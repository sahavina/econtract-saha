'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Danh sách số trang có dấu "…" (1 … 4 5 6 … 42). */
export function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const sorted = [...new Set([1, total, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= total))].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** Phân trang: tổng số bản ghi + các nút số trang, trang trước/sau. */
export function Pager({
  page,
  totalPages,
  total,
  unit,
  onPage,
  pageSize,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  unit: string;
  onPage: (p: number) => void;
  /** Có pageSize ⇒ ghi "Hiển thị a–b trong N …". */
  pageSize?: number;
  className?: string;
}) {
  return (
    <div className={cn('mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground', className)}>
      <span>
        {pageSize && total > 0
          ? `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} trong ${total} ${unit}`
          : `${total} ${unit}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">
            <ChevronLeft />
          </Button>
          {pageList(page, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="icon-sm"
                className="min-w-8 px-2 tabular-nums"
                aria-label={`Trang ${p}`}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </Button>
            ),
          )}
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
