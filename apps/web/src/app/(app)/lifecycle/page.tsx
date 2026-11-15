'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FilePlus2, ListTodo, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ListCard, ListState, MobileCard, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type Kind = 'appendices' | 'obligations' | 'payments' | 'acceptances';

const KINDS: { value: Kind; label: string; icon: typeof Wallet; views: { value: string; label: string }[] }[] = [
  {
    value: 'payments',
    label: 'Thanh toán',
    icon: Wallet,
    views: [
      { value: 'open', label: 'Chưa thu đủ' },
      { value: 'overdue', label: 'Quá hạn' },
      { value: 'due_soon', label: 'Đến hạn trong 7 ngày' },
      { value: 'mine', label: 'HĐ tôi phụ trách' },
      { value: 'done', label: 'Đã thu đủ' },
    ],
  },
  {
    value: 'obligations',
    label: 'Nghĩa vụ & tiến độ',
    icon: ListTodo,
    views: [
      { value: 'open', label: 'Đang mở' },
      { value: 'overdue', label: 'Quá hạn' },
      { value: 'due_soon', label: 'Đến hạn trong 7 ngày' },
      { value: 'mine', label: 'Tôi phụ trách' },
      { value: 'done', label: 'Hoàn thành' },
    ],
  },
  {
    value: 'appendices',
    label: 'Phụ lục & gia hạn',
    icon: FilePlus2,
    views: [
      { value: 'open', label: 'Nháp' },
      { value: 'done', label: 'Có hiệu lực' },
      { value: 'due_soon', label: 'Phụ lục gia hạn' },
      { value: 'mine', label: 'Tôi lập' },
    ],
  },
  { value: 'acceptances', label: 'Nghiệm thu', icon: ClipboardCheck, views: [] },
];

interface Row {
  id: string;
  title: string;
  status?: string;
  dueDate?: string | null;
  amount?: string;
  paidAmount?: string;
  progress?: number;
  code?: string;
  kind?: string;
  newExpiryDate?: string | null;
  acceptedDate?: string;
  result?: string;
  assignee?: { fullName: string } | null;
  contract: { id: string; code: string; title: string; currency?: string };
}

const LABELS: Record<string, string> = {
  PLANNED: 'Chưa thanh toán', PARTIAL: 'Một phần', PAID: 'Đã thanh toán', CANCELLED: 'Đã hủy',
  OPEN: 'Chưa thực hiện', IN_PROGRESS: 'Đang thực hiện', DONE: 'Hoàn thành',
  DRAFT: 'Nháp', EFFECTIVE: 'Có hiệu lực',
  PASSED: 'Đạt', CONDITIONAL: 'Đạt có điều kiện', FAILED: 'Không đạt',
  AMENDMENT: 'Sửa đổi, bổ sung', EXTENSION: 'Gia hạn', OTHER: 'Khác',
};
const TONES: Record<string, Tone> = {
  PLANNED: 'gray', PARTIAL: 'amber', PAID: 'green', CANCELLED: 'red',
  OPEN: 'gray', IN_PROGRESS: 'sky', DONE: 'green',
  DRAFT: 'gray', EFFECTIVE: 'green',
  PASSED: 'green', CONDITIONAL: 'amber', FAILED: 'red',
};

export default function LifecyclePage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow();
  const kind = (KINDS.find((k) => k.value === params.get('kind'))?.value ?? 'payments') as Kind;
  const meta = KINDS.find((k) => k.value === kind)!;
  const view = params.get('view') ?? 'all';
  const q = useQuery({ queryKey: ['lifecycle', kind, view], queryFn: () => api<Row[]>('/lifecycle', { query: { kind, view } }) });
  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };
  const late = (d?: string | null, status?: string) => !!now && !!d && new Date(d).getTime() < now && !['PAID', 'DONE', 'CANCELLED'].includes(status ?? '');
  const statusKey = (r: Row) => (kind === 'acceptances' ? r.result : r.status) ?? '';
  const pill = (r: Row) => <StatusPill tone={TONES[statusKey(r)] ?? 'gray'}>{LABELS[statusKey(r)] ?? '—'}</StatusPill>;
  const when = (r: Row) =>
    kind === 'acceptances' ? formatDate(r.acceptedDate) : kind === 'appendices' ? LABELS[r.kind ?? ''] : `${formatDate(r.dueDate)}${late(r.dueDate, r.status) ? ' (quá hạn)' : ''}`;
  const rows = q.data;

  return (
    <>
      <PageHeader title={meta.label} description="Tổng hợp trên tất cả hợp đồng bạn được xem" crumbs={[{ label: 'Vòng đời hợp đồng' }, { label: meta.label }]} />
      <ListCard>
        <div className="flex items-end gap-1 overflow-x-auto border-b px-3 [scrollbar-width:thin]">
          {KINDS.map((k) => {
            const active = kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => setParam({ kind: k.value === 'payments' ? undefined : k.value, view: undefined })}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
                )}
              >
                <k.icon className="size-4" /> {k.label}
              </button>
            );
          })}
        </div>
        {meta.views.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b px-3 py-2.5">
            {[{ value: 'all', label: 'Tất cả' }, ...meta.views].map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setParam({ view: v.value === 'all' ? undefined : v.value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  view === v.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <ListState query={{ ...q, data: rows ? { items: rows } : undefined }} empty={{ title: 'Không có dữ liệu' }} />
        {!!rows?.length && (
          <>
            <ul className="divide-y md:hidden">
              {rows.map((r) => (
                <MobileCard key={r.id} href={`/contracts/${r.contract.id}?tab=lifecycle`} title={kind === 'appendices' ? `${r.code} · ${r.title}` : r.title} sub={r.contract.code} status={pill(r)}>
                  <span className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {kind === 'payments' && (
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(r.paidAmount, r.contract.currency)} / {formatMoney(r.amount, r.contract.currency)}
                      </span>
                    )}
                    {kind === 'obligations' && <span>{r.assignee?.fullName ?? 'Chưa giao'} · {r.progress}%</span>}
                    <span className={cn('text-muted-foreground', late(r.dueDate, r.status) && 'font-medium text-destructive')}>{when(r)}</span>
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">{kind === 'appendices' ? 'Phụ lục' : 'Nội dung'}</Th>
                    <Th>Hợp đồng</Th>
                    {kind === 'payments' && (
                      <>
                        <Th className="text-right">Số tiền</Th>
                        <Th className="text-right">Đã thu</Th>
                      </>
                    )}
                    {kind === 'obligations' && (
                      <>
                        <Th>Phụ trách</Th>
                        <Th>Tiến độ</Th>
                      </>
                    )}
                    {kind === 'appendices' && <Th>Hết hạn mới</Th>}
                    <Th>{kind === 'acceptances' ? 'Ngày nghiệm thu' : kind === 'appendices' ? 'Loại' : 'Hạn'}</Th>
                    <Th>{kind === 'acceptances' ? 'Kết quả' : 'Trạng thái'}</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={meta.icon} href={`/contracts/${r.contract.id}?tab=lifecycle`} title={r.title} sub={kind === 'appendices' ? r.code : undefined} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/contracts/${r.contract.id}?tab=lifecycle`} className="font-medium hover:text-primary hover:underline">
                          {r.contract.code}
                        </Link>
                        <p className="line-clamp-1 max-w-56 text-xs whitespace-normal text-muted-foreground">{r.contract.title}</p>
                      </TableCell>
                      {kind === 'payments' && (
                        <>
                          <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.amount, r.contract.currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(r.paidAmount, r.contract.currency)}</TableCell>
                        </>
                      )}
                      {kind === 'obligations' && (
                        <>
                          <TableCell>{r.assignee?.fullName ?? '—'}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <span className="block h-full rounded-full bg-primary" style={{ width: `${r.progress ?? 0}%` }} />
                              </span>
                              <span className="text-xs tabular-nums">{r.progress}%</span>
                            </span>
                          </TableCell>
                        </>
                      )}
                      {kind === 'appendices' && <TableCell className="tabular-nums">{formatDate(r.newExpiryDate)}</TableCell>}
                      <TableCell className={cn('tabular-nums', late(r.dueDate, r.status) && 'font-medium text-destructive')}>{when(r)}</TableCell>
                      <TableCell>{pill(r)}</TableCell>
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
