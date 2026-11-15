'use client';

import { useQuery } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ListCard, ListState, MobileCard, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { SignatureListItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const VIEWS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'mine', label: 'Chờ tôi ký' },
  { value: 'waiting_partner', label: 'Chờ đối tác' },
  { value: 'completed', label: 'Đã hoàn tất' },
  { value: 'rejected', label: 'Bị từ chối' },
  { value: 'expired', label: 'Hết hạn' },
] as const;

const STATUS: Record<SignatureListItem['status'], { label: string; tone: Tone }> = {
  IN_PROGRESS: { label: 'Đang ký', tone: 'violet' },
  COMPLETED: { label: 'Đã hoàn tất', tone: 'green' },
  REJECTED: { label: 'Bị từ chối', tone: 'red' },
  EXPIRED: { label: 'Hết hạn', tone: 'orange' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray' },
};

/** Tình trạng từng người ký: màu chữ theo đã ký / chờ / từ chối. */
function Signers({ r }: { r: SignatureListItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      {r.signers.map((s) => (
        <span
          key={s.id}
          className={cn(
            'rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap',
            s.status === 'SIGNED' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : s.status === 'REJECTED' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-muted text-muted-foreground',
          )}
          title={s.status === 'SIGNED' ? 'Đã ký' : s.status === 'PENDING' ? 'Chờ ký' : s.status === 'REJECTED' ? 'Từ chối' : undefined}
        >
          {s.status === 'SIGNED' ? '✓ ' : ''}
          {s.name}
        </span>
      ))}
    </span>
  );
}

export default function SignaturesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get('view') ?? 'all';
  const label = view === 'all' ? 'Yêu cầu ký' : (VIEWS.find((v) => v.value === view)?.label ?? 'Yêu cầu ký');
  const q = useQuery({ queryKey: ['signatures', view], queryFn: () => api<SignatureListItem[]>('/signatures', { query: { view } }) });
  const items = q.data;

  return (
    <>
      <PageHeader title={label} description="Theo dõi các yêu cầu ký điện tử: ai đã ký, ai đang chờ, hạn ký" crumbs={[{ label: 'Ký điện tử', href: '/signatures' }, { label }]} />
      <ListCard>
        <div className="flex items-end gap-1 overflow-x-auto border-b px-3 [scrollbar-width:thin]">
          {VIEWS.map((v) => {
            const active = view === v.value;
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => router.replace(v.value === 'all' ? pathname : `${pathname}?view=${v.value}`)}
                className={cn(
                  'relative shrink-0 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <ListState query={{ ...q, data: items ? { items } : undefined }} empty={{ title: 'Không có yêu cầu ký' }} />
        {!!items?.length && (
          <>
            <ul className="divide-y md:hidden">
              {items.map((r) => (
                <MobileCard
                  key={r.id}
                  href={`/contracts/${r.contract.id}?tab=signature`}
                  title={r.contract.title}
                  sub={r.contract.code}
                  status={<StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>}
                >
                  <Signers r={r} />
                  <span className="mt-1 block text-xs text-muted-foreground">Hạn ký {formatDateTime(r.expiresAt)}</span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Hợp đồng</Th>
                    <Th>Người ký</Th>
                    <Th>Trạng thái</Th>
                    <Th>Người gửi</Th>
                    <Th>Ngày gửi</Th>
                    <Th>Hạn ký</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={PenLine} href={`/contracts/${r.contract.id}?tab=signature`} title={r.contract.title} sub={r.contract.code} />
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        <Signers r={r} />
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>
                      </TableCell>
                      <TableCell>{r.createdBy.fullName}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(r.expiresAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </ListCard>
    </>
  );
}
