'use client';

import { CLAUSE_CATEGORIES, CLAUSE_CATEGORY_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Paginated } from '@/lib/api';
import type { Clause } from '@/lib/types';

/** Hộp chọn điều khoản đã duyệt để chèn vào nội dung. */
export function ClausePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (clause: Clause, withTitle: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [selected, setSelected] = useState<Clause | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['clauses', 'picker', { q, category }],
    queryFn: () => api<Paginated<Clause>>('/clauses', { query: { q, category, status: 'APPROVED', pageSize: 50 } }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Chèn điều khoản</DialogTitle>
          <DialogDescription>Chỉ hiển thị điều khoản đã được phê duyệt.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input className="w-64" placeholder="Tìm theo tiêu đề, mã, nội dung…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm điều khoản" />
          <FilterSelect allLabel="Mọi nhóm" value={category} onChange={setCategory} options={CLAUSE_CATEGORIES.map((c) => ({ value: c, label: CLAUSE_CATEGORY_LABELS[c] }))} />
        </div>
        <div className="grid min-h-80 gap-3 md:grid-cols-[280px_1fr]">
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border p-1">
            {!list.data ? (
              <Skeleton className="h-40" />
            ) : list.data.items.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Không có điều khoản phù hợp.</p>
            ) : (
              list.data.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${selected?.id === c.id ? 'bg-muted' : ''}`}
                >
                  <span className="block font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.code} · {CLAUSE_CATEGORY_LABELS[c.category]} · v{c.version}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="flex flex-col rounded-lg border">
            {selected ? (
              <>
                <div className="flex items-center gap-2 border-b px-4 py-2">
                  <span className="font-medium">{selected.title}</span>
                  <Badge variant="secondary">v{selected.version}</Badge>
                </div>
                {/* Nội dung đã được backend làm sạch. */}
                <div className="contract-content max-h-72 flex-1 overflow-y-auto px-4 py-3" dangerouslySetInnerHTML={{ __html: selected.contentHtml }} />
                <div className="flex justify-end gap-2 border-t p-2">
                  <Button variant="outline" onClick={() => onPick(selected, false)}>
                    Chèn nội dung
                  </Button>
                  <Button onClick={() => onPick(selected, true)}>Chèn kèm tiêu đề</Button>
                </div>
              </>
            ) : (
              <EmptyState title="Chọn một điều khoản để xem trước" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
