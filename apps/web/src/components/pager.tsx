'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Phân trang đơn giản: tổng số bản ghi + trang trước/sau. */
export function Pager({ page, totalPages, total, unit, onPage }: { page: number; totalPages: number; total: number; unit: string; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total} {unit}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">
          <ChevronLeft />
        </Button>
        Trang {page}/{totalPages}
        <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
