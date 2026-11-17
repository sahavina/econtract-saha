'use client';

import { INSPECTION_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Printer } from 'lucide-react';
import Link from 'next/link';
import { MobileCard, StatusPill, Th, TitleCell } from '@/components/list-ui';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { INSPECTION_TONE, type InspectionListItem, isOverdue } from '@/lib/inspection';

export const contractInspectionsKey = (contractId: string) => ['inspections', 'contract', contractId] as const;

export function useContractInspections(contractId: string) {
  return useQuery({
    queryKey: contractInspectionsKey(contractId),
    queryFn: () => api<Paginated<InspectionListItem>>('/inspections', { query: { contractId, pageSize: 100 } }),
  });
}

/** Tab "Kiểm tra" của hợp đồng/đơn: các lần yêu cầu kiểm tra, trạng thái, người phụ trách, đã in phiếu. */
export function ContractInspectionsTab({ contractId, onRequest }: { contractId: string; onRequest?: () => void }) {
  const list = useContractInspections(contractId);
  const items = list.data?.items ?? [];
  const status = (r: InspectionListItem) => (
    <span className="flex flex-wrap gap-1">
      <StatusPill tone={INSPECTION_TONE[r.status]}>{INSPECTION_STATUS_LABELS[r.status]}</StatusPill>
      {isOverdue(r) && <StatusPill tone="red">Quá hạn</StatusPill>}
    </span>
  );
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b py-4">
        <div>
          <CardTitle className="text-base">Yêu cầu kiểm tra</CardTitle>
          <CardDescription>Các lần gửi kiểm tra hồ sơ này và kết quả; bấm vào yêu cầu để xem chi tiết, in phiếu.</CardDescription>
        </div>
        {onRequest && (
          <Button size="sm" onClick={onRequest}>
            <Plus /> Yêu cầu kiểm tra
          </Button>
        )}
      </CardHeader>
      {list.isError ? (
        <div className="p-5">
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </div>
      ) : list.isPending ? (
        <div className="p-5">
          <Skeleton className="h-24" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Chưa có yêu cầu kiểm tra" description="Gửi yêu cầu để người phụ trách kiểm tra hồ sơ/hàng hóa và ghi kết quả." />
        </div>
      ) : (
        <>
          <ul className="divide-y md:hidden">
            {items.map((r) => (
              <MobileCard key={r.id} href={`/inspections/${r.id}`} title={r.code} sub={`Phụ trách: ${r.assignee.fullName}`} status={status(r)}>
                <span className="line-clamp-2 block text-muted-foreground">{r.content}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.dueDate ? `Hạn ${formatDate(r.dueDate)} · ` : ''}
                  {r.printedAt ? `Đã in ${r.printCount} lần` : 'Chưa in phiếu'}
                </span>
              </MobileCard>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <Th className="pl-5">Yêu cầu</Th>
                  <Th>Nội dung</Th>
                  <Th>Người phụ trách</Th>
                  <Th>Hạn xử lý</Th>
                  <Th>Trạng thái</Th>
                  <Th className="pr-5">Phiếu</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-5">
                      <Link href={`/inspections/${r.id}`} className="hover:text-primary">
                        <TitleCell icon={ClipboardCheck} title={r.code} sub={`Gửi ${formatDateTime(r.createdAt)} · ${r.requestedBy.fullName}`} />
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80 min-w-48 text-sm whitespace-normal">
                      <span className="line-clamp-2">{r.content}</span>
                      {r.result && <span className="line-clamp-1 text-xs text-muted-foreground">Kết quả: {r.result}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{r.assignee.fullName}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap tabular-nums">{r.dueDate ? formatDate(r.dueDate) : '—'}</TableCell>
                    <TableCell>{status(r)}</TableCell>
                    <TableCell className="pr-5 text-xs whitespace-nowrap text-muted-foreground">
                      {r.printedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Printer className="size-3.5" aria-hidden /> {r.printCount} lần
                        </span>
                      ) : (
                        'Chưa in'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Cảnh báo khi lập phiếu xuất kho / giao hàng cho đơn: còn yêu cầu kiểm tra "Có vấn đề" hoặc chưa kiểm tra xong.
 * Chỉ cảnh báo (không chặn) – người lập quyết định sau khi xem kết quả kiểm tra.
 */
export function InspectionWarning({ contractId }: { contractId: string }) {
  const list = useContractInspections(contractId);
  const items = list.data?.items ?? [];
  const issues = items.filter((r) => r.status === 'ISSUE');
  const open = items.filter((r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS');
  if (!issues.length && !open.length) return null;
  const links = (rows: InspectionListItem[]) =>
    rows.map((r, i) => (
      <span key={r.id}>
        {i > 0 && ', '}
        <Link href={`/inspections/${r.id}`} className="font-medium underline underline-offset-2">
          {r.code}
        </Link>
      </span>
    ));
  return (
    <div role="alert" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${issues.length ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        <ClipboardCheck className="size-4" aria-hidden /> {issues.length ? 'Đơn có kết quả kiểm tra "Có vấn đề"' : 'Đơn đang chờ kiểm tra'}
      </p>
      {issues.length > 0 && <p>Có vấn đề: {links(issues)} – xem kết quả trước khi xuất kho.</p>}
      {open.length > 0 && <p>Chưa kiểm tra xong: {links(open)}.</p>}
    </div>
  );
}
