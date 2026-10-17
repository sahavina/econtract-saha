'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { MyApprovalTask } from '@/lib/types';

export default function MyTasksPage() {
  const q = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<MyApprovalTask[]>('/approvals/my-tasks') });
  const now = useNow();

  return (
    <>
      <PageHeader
        title="Công việc của tôi"
        description="Hợp đồng đang chờ bạn phê duyệt, sắp theo hạn xử lý."
        crumbs={[{ label: 'Tổng quan' }, { label: 'Công việc của tôi' }]}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hợp đồng</TableHead>
                <TableHead>Giá trị</TableHead>
                <TableHead>Bước</TableHead>
                <TableHead>Quy trình</TableHead>
                <TableHead>Người gửi</TableHead>
                <TableHead>Ngày gửi</TableHead>
                <TableHead>Hạn xử lý</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isPending ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-24" />
                  </TableCell>
                </TableRow>
              ) : q.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-4">
                    <EmptyState title="Không có việc cần xử lý" description="Bạn đã xử lý hết các yêu cầu phê duyệt." />
                  </TableCell>
                </TableRow>
              ) : (
                q.data.map((t) => {
                  const c = t.request.contract;
                  const overdue = t.dueAt && new Date(t.dueAt).getTime() < now;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link href={`/contracts/${c.id}?tab=approval`} className="font-medium text-primary hover:underline">
                          {c.code}
                        </Link>
                        <p className="max-w-80 truncate text-xs text-muted-foreground">{c.title}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatMoney(c.value, c.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t.stepName} ({t.stepOrder}/{t.request.totalSteps})
                      </TableCell>
                      <TableCell>{t.request.workflowName}</TableCell>
                      <TableCell>{t.request.submittedBy.fullName}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(t.request.submittedAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t.dueAt ? (
                          overdue ? (
                            <Badge variant="destructive">Quá hạn · {formatDateTime(t.dueAt)}</Badge>
                          ) : (
                            formatDateTime(t.dueAt)
                          )
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
