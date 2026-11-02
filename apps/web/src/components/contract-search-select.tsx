'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useState } from 'react';
import { api, type Paginated } from '@/lib/api';
import type { ContractKind, ContractListItem } from '@/lib/types';

/** Ưu tiên bên gắn đối tác (khách hàng); bên nội bộ không có đối tác. */
const partyName = (c: ContractListItem) => c.parties.find((p) => p.partnerId && p.name)?.name ?? c.parties.find((p) => p.name)?.name;

/** Chọn hợp đồng / đơn đặt hàng: tìm trên máy chủ theo số, tên hồ sơ, tên các bên, nên không bị giới hạn ở các dòng đầu. */
export function ContractSearchSelect({
  kind,
  placeholder,
  selected,
  onPick,
}: {
  kind: ContractKind;
  placeholder: string;
  /** Số hồ sơ đang chọn. */
  selected?: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const list = useQuery({
    queryKey: ['contracts', 'search-select', kind, q],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind, q, pageSize: 30 } }),
    enabled: open,
  });
  const items = list.data?.items ?? [];
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setText('');
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={placeholder}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <span className="line-clamp-1 text-left">{selected ?? placeholder}</span>
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[min(92vw,26rem)] rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && items[0]) {
                  e.preventDefault();
                  pick(items[0].id);
                }
              }}
              placeholder="Tìm số, tên hồ sơ, khách hàng…"
              aria-label={`Tìm: ${placeholder}`}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              >
                <span className="block truncate font-medium">{c.code}</span>
                <span className="block truncate text-xs text-muted-foreground">{partyName(c) ?? c.title}</span>
              </button>
            ))}
            {list.isError && <p className="px-2 py-3 text-center text-sm text-destructive">Không tải được danh sách, thử lại sau.</p>}
            {!list.isError && !items.length && <p className="px-2 py-3 text-center text-sm text-muted-foreground">{list.isFetching ? 'Đang tìm…' : 'Không tìm thấy hồ sơ phù hợp'}</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
