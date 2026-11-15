'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { ListCard, ListState, MobileCard, StatusPill, Th, TitleCell } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { MyApprovalTask } from '@/lib/types';

export default function MyTasksPage() {
  const q = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<MyApprovalTask[]>('/approvals/my-tasks') });
  const now = useNow();
  const tasks = q.data;

  /** Hạn xử lý: quá hạn tô đỏ, còn hạn hiện ngày giờ. */
  const due = (t: MyApprovalTask) =>
    !t.dueAt ? (
      <span className="text-muted-foreground">Không đặt hạn</span>
    ) : now && new Date(t.dueAt).getTime() < now ? (
      <StatusPill tone="red">Quá hạn · {formatDateTime(t.dueAt)}</StatusPill>
    ) : (
      <StatusPill tone="amber">Hạn {formatDateTime(t.dueAt)}</StatusPill>
    );

  return (
    <>
      <PageHeader
        title="Công việc của tôi"
        description="Hợp đồng đang chờ bạn phê duyệt, sắp theo hạn xử lý"
        crumbs={[{ label: 'Tổng quan', href: '/' }, { label: 'Công việc của tôi' }]}
      />
      <ListCard>
        <ListState
          query={{ ...q, data: tasks ? { items: tasks } : undefined }}
          empty={{ title: 'Không có việc cần xử lý', description: 'Bạn đã xử lý hết các yêu cầu phê duyệt.' }}
        />
        {!!tasks?.length && (
          <>
            <ul className="divide-y md:hidden">
              {tasks.map((t) => {
                const c = t.request.contract;
                return (
                  <MobileCard key={t.id} href={`/contracts/${c.id}?tab=approval`} title={c.title} sub={`${c.code} · ${t.stepName} (${t.stepOrder}/${t.request.totalSteps})`}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold tabular-nums">{formatMoney(c.value, c.currency)}</span>
                      {due(t)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">Gửi bởi {t.request.submittedBy.fullName} · {formatDateTime(t.request.submittedAt)}</span>
                  </MobileCard>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Hợp đồng</Th>
                    <Th className="text-right">Giá trị</Th>
                    <Th>Bước</Th>
                    <Th>Quy trình</Th>
                    <Th>Người gửi</Th>
                    <Th>Ngày gửi</Th>
                    <Th>Hạn xử lý</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t) => {
                    const c = t.request.contract;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="pl-4">
                          <TitleCell icon={ClipboardCheck} href={`/contracts/${c.id}?tab=approval`} title={c.title} sub={c.code} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatMoney(c.value, c.currency)}</TableCell>
                        <TableCell>
                          {t.stepName} <span className="text-muted-foreground">({t.stepOrder}/{t.request.totalSteps})</span>
                        </TableCell>
                        <TableCell>{t.request.workflowName}</TableCell>
                        <TableCell>{t.request.submittedBy.fullName}</TableCell>
                        <TableCell className="tabular-nums">{formatDateTime(t.request.submittedAt)}</TableCell>
                        <TableCell>{due(t)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </ListCard>
    </>
  );
}
