'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type Kind = 'appendices' | 'obligations' | 'payments' | 'acceptances';

const KINDS: { value: Kind; label: string; views: { value: string; label: string }[] }[] = [
  {
    value: 'payments',
    label: 'Thanh toán',
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
    views: [
      { value: 'open', label: 'Nháp' },
      { value: 'done', label: 'Có hiệu lực' },
      { value: 'due_soon', label: 'Phụ lục gia hạn' },
      { value: 'mine', label: 'Tôi lập' },
    ],
  },
  { value: 'acceptances', label: 'Nghiệm thu', views: [] },
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
  const late = (d?: string | null, status?: string) => !!d && new Date(d).getTime() < now && !['PAID', 'DONE', 'CANCELLED'].includes(status ?? '');

  return (
    <>
      <PageHeader title={meta.label} description="Tổng hợp trên tất cả hợp đồng bạn được xem." crumbs={[{ label: 'Vòng đời hợp đồng' }, { label: meta.label }]} />
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect allLabel="Thanh toán" className="w-52" value={kind === 'payments' ? undefined : kind} onChange={(v) => setParam({ kind: v ?? 'payments', view: undefined })} options={KINDS.filter((k) => k.value !== 'payments').map((k) => ({ value: k.value, label: k.label }))} ariaLabel="Nhóm" />
        {meta.views.length > 0 && <FilterSelect allLabel="Tất cả" className="w-52" value={view === 'all' ? undefined : view} onChange={(v) => setParam({ view: v })} options={meta.views} ariaLabel="Bộ lọc" />}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-48" />
      ) : q.data.length === 0 ? (
        <EmptyState title="Không có dữ liệu" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hợp đồng</TableHead>
                <TableHead>{kind === 'appendices' ? 'Phụ lục' : 'Nội dung'}</TableHead>
                {kind === 'payments' && (
                  <>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead className="text-right">Đã thu</TableHead>
                  </>
                )}
                {kind === 'obligations' && (
                  <>
                    <TableHead>Phụ trách</TableHead>
                    <TableHead>Tiến độ</TableHead>
                  </>
                )}
                {kind === 'appendices' && <TableHead>Hết hạn mới</TableHead>}
                <TableHead>{kind === 'acceptances' ? 'Ngày nghiệm thu' : kind === 'appendices' ? 'Loại' : 'Hạn'}</TableHead>
                <TableHead>{kind === 'acceptances' ? 'Kết quả' : 'Trạng thái'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/contracts/${r.contract.id}?tab=lifecycle`} className="font-medium text-primary hover:underline">
                      {r.contract.code}
                    </Link>
                    <p className="max-w-64 truncate text-xs text-muted-foreground">{r.contract.title}</p>
                  </TableCell>
                  <TableCell>{kind === 'appendices' ? `${r.code} · ${r.title}` : r.title}</TableCell>
                  {kind === 'payments' && (
                    <>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.amount, r.contract.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.paidAmount, r.contract.currency)}</TableCell>
                    </>
                  )}
                  {kind === 'obligations' && (
                    <>
                      <TableCell>{r.assignee?.fullName ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{r.progress}%</TableCell>
                    </>
                  )}
                  {kind === 'appendices' && <TableCell>{formatDate(r.newExpiryDate)}</TableCell>}
                  <TableCell className={cn('whitespace-nowrap', late(r.dueDate, r.status) && 'font-medium text-destructive')}>
                    {kind === 'acceptances' ? formatDate(r.acceptedDate) : kind === 'appendices' ? LABELS[r.kind ?? ''] : `${formatDate(r.dueDate)}${late(r.dueDate, r.status) ? ' (quá hạn)' : ''}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{LABELS[(kind === 'acceptances' ? r.result : r.status) ?? ''] ?? '—'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
