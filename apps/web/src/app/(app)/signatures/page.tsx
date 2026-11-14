'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { SignatureListItem } from '@/lib/types';

const VIEWS = [
  { value: 'all', label: 'Tất cả yêu cầu ký' },
  { value: 'mine', label: 'Chờ tôi ký' },
  { value: 'waiting_partner', label: 'Đang chờ đối tác' },
  { value: 'completed', label: 'Đã hoàn tất' },
  { value: 'rejected', label: 'Bị từ chối' },
  { value: 'expired', label: 'Hết hạn yêu cầu ký' },
] as const;

const STATUS: Record<SignatureListItem['status'], { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  IN_PROGRESS: { label: 'Đang ký', variant: 'secondary' },
  COMPLETED: { label: 'Đã hoàn tất', variant: 'default' },
  REJECTED: { label: 'Bị từ chối', variant: 'destructive' },
  EXPIRED: { label: 'Hết hạn', variant: 'outline' },
  CANCELLED: { label: 'Đã hủy', variant: 'outline' },
};

export default function SignaturesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get('view') ?? 'all';
  const label = VIEWS.find((v) => v.value === view)?.label ?? 'Yêu cầu ký';
  const q = useQuery({ queryKey: ['signatures', view], queryFn: () => api<SignatureListItem[]>('/signatures', { query: { view } }) });

  return (
    <>
      <PageHeader title={label} crumbs={[{ label: 'Ký điện tử', href: '/signatures' }, { label }]} />
      <div className="mb-3">
        <FilterSelect
          allLabel="Tất cả yêu cầu ký"
          className="w-56"
          value={view === 'all' ? undefined : view}
          onChange={(v) => router.replace(v ? `${pathname}?view=${v}` : pathname)}
          options={VIEWS.filter((v) => v.value !== 'all').map((v) => ({ value: v.value, label: v.label }))}
          ariaLabel="Nhóm yêu cầu ký"
        />
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hợp đồng</TableHead>
                <TableHead>Người ký</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Người gửi</TableHead>
                <TableHead>Ngày gửi</TableHead>
                <TableHead>Hạn ký</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isPending ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-24" />
                  </TableCell>
                </TableRow>
              ) : q.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-4">
                    <EmptyState title="Không có yêu cầu ký" />
                  </TableCell>
                </TableRow>
              ) : (
                q.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/contracts/${r.contract.id}?tab=signature`} className="font-medium text-primary hover:underline">
                        {r.contract.code}
                      </Link>
                      <p className="max-w-80 truncate text-xs text-muted-foreground">{r.contract.title}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.signers.map((s) => (
                        <span key={s.id} className="mr-2 inline-block">
                          {s.name}
                          <span className="text-xs text-muted-foreground"> ({s.status === 'SIGNED' ? 'đã ký' : s.status === 'PENDING' ? 'chờ ký' : s.status === 'REJECTED' ? 'từ chối' : '—'})</span>
                        </span>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    </TableCell>
                    <TableCell>{r.createdBy.fullName}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.expiresAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
