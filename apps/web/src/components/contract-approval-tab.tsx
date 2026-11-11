'use client';

import {
  APPROVAL_MODE_LABELS,
  APPROVAL_REQUEST_STATUS_LABELS,
  APPROVAL_TASK_STATUS_LABELS,
  type ApprovalDecision,
} from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Check, CircleDashed, Clock, Loader2, MessageSquareWarning, Pencil, Send, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useNow } from '@/hooks/use-now';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ApprovalPreview, ApprovalRequest, ApprovalTaskStatus, ContractDetail } from '@/lib/types';

const TASK_TONE: Record<ApprovalTaskStatus, string> = {
  WAITING: 'text-muted-foreground',
  PENDING: 'text-amber-600 dark:text-amber-400',
  APPROVED: 'text-emerald-600 dark:text-emerald-400',
  REJECTED: 'text-destructive',
  CHANGES_REQUESTED: 'text-orange-600 dark:text-orange-400',
  SKIPPED: 'text-muted-foreground line-through',
};

function TaskIcon({ status }: { status: ApprovalTaskStatus }) {
  if (status === 'APPROVED') return <Check className="size-4" />;
  if (status === 'REJECTED') return <X className="size-4" />;
  if (status === 'CHANGES_REQUESTED') return <MessageSquareWarning className="size-4" />;
  if (status === 'PENDING') return <Clock className="size-4" />;
  return <CircleDashed className="size-4" />;
}

/** Tiến trình các bước của một yêu cầu phê duyệt. */
function RequestSteps({ request }: { request: ApprovalRequest }) {
  const now = useNow();
  const steps = [...new Set(request.tasks.map((t) => t.stepOrder))];
  return (
    <ol className="space-y-3">
      {steps.map((order) => {
        const tasks = request.tasks.filter((t) => t.stepOrder === order);
        const current = request.status === 'PENDING' && order === request.currentStep;
        return (
          <li key={order} className={cn('rounded-lg border p-3', current && 'border-amber-500/50 bg-amber-500/5')}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{order}</span>
              <span className="font-medium">{tasks[0].stepName}</span>
              <span className="text-xs text-muted-foreground">{APPROVAL_MODE_LABELS[tasks[0].mode]}</span>
              {current && <Badge variant="outline">Bước hiện tại</Badge>}
            </div>
            <ul className="space-y-1.5 pl-8">
              {tasks.map((t) => {
                const overdue = t.status === 'PENDING' && t.dueAt && new Date(t.dueAt).getTime() < now;
                return (
                  <li key={t.id} className="text-sm">
                    <span className={cn('inline-flex items-center gap-1.5', TASK_TONE[t.status])}>
                      <TaskIcon status={t.status} />
                      <span className="font-medium text-foreground">{t.approver.fullName}</span>
                      {t.approver.jobTitle && <span className="text-xs text-muted-foreground">({t.approver.jobTitle})</span>}
                      <span>· {APPROVAL_TASK_STATUS_LABELS[t.status]}</span>
                    </span>
                    {t.decidedAt && <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(t.decidedAt)}</span>}
                    {t.status === 'PENDING' && t.dueAt && (
                      <span className={cn('ml-2 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                        {overdue ? 'Quá hạn từ' : 'Hạn'} {formatDateTime(t.dueAt)}
                      </span>
                    )}
                    {t.comment && <p className="mt-0.5 rounded bg-muted/60 px-2 py-1 text-xs">“{t.comment}”</p>}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function SubmitPanel({ contract }: { contract: ContractDetail }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const preview = useQuery({
    queryKey: ['contract', contract.id, 'approval-preview', contract.updatedAt],
    queryFn: () => api<ApprovalPreview>(`/contracts/${contract.id}/approval/preview`),
  });
  const submit = useMutation({
    mutationFn: () => api(`/contracts/${contract.id}/approval/submit`, { method: 'POST', body: { note: note || undefined } }),
    onSuccess: () => {
      toast.success('Đã gửi phê duyệt');
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (preview.isError) return <ErrorState error={preview.error} onRetry={() => preview.refetch()} />;
  if (!preview.data) return <Skeleton className="h-40" />;
  const p = preview.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gửi phê duyệt</CardTitle>
        <CardDescription>
          {p.workflow ? (
            <>
              Quy trình áp dụng: <span className="font-medium text-foreground">{p.workflow.name}</span> (chọn tự động theo loại và giá trị hợp đồng)
            </>
          ) : (
            'Chưa xác định được quy trình phê duyệt.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {p.steps.length > 0 && (
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {p.steps.map((s, i) => (
              <li key={s.order} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <span
                  className={cn('rounded-md border px-2 py-1', s.skipped && 'text-muted-foreground line-through', s.error && 'border-destructive/50 text-destructive')}
                  title={s.skipped ?? s.error ?? APPROVAL_MODE_LABELS[s.mode]}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.approvers.length > 0 && <span className="text-muted-foreground">: {s.approvers.map((a) => a.fullName).join(', ')}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {p.steps.some((s) => s.skipped) && (
          <p className="text-xs text-muted-foreground">Bước gạch ngang được bỏ qua: {p.steps.filter((s) => s.skipped).map((s) => s.skipped).join('; ')}.</p>
        )}
        {p.issues.length > 0 && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> Cần hoàn thiện trước khi gửi:
            </p>
            <ul className="list-disc pl-6">
              {p.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="submit-note">Ghi chú cho người duyệt</Label>
          <Textarea id="submit-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!p.canSubmit} />
        </div>
        <Button onClick={() => submit.mutate()} disabled={!p.canSubmit || submit.isPending}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />} Gửi phê duyệt
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Vai trò có quyền "Tự phê duyệt hợp đồng": duyệt ngay hợp đồng Nháp (không qua quy trình, vẫn kiểm tra đủ điều kiện)
 * hoặc hợp đồng đang chờ phê duyệt (các bước còn lại được bỏ qua).
 */
function SelfApprovePanel({ contract, onConfirm }: { contract: ContractDetail; onConfirm: (state: ConfirmState) => void }) {
  const qc = useQueryClient();
  const inWorkflow = contract.status === 'PENDING_APPROVAL';
  const label = inWorkflow ? 'Phê duyệt ngay' : 'Tự phê duyệt';
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const approve = useMutation({
    mutationFn: () => api(`/contracts/${contract.id}/approval/self-approve`, { method: 'POST', body: { note: note || undefined } }),
    onSuccess: () => {
      toast.success('Hợp đồng đã được phê duyệt');
      setIssues([]);
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => {
      const list = e instanceof ApiError && Array.isArray(e.body.issues) ? (e.body.issues as string[]) : [];
      setIssues(list);
      if (!list.length) toast.error(e.message);
    },
  });
  return (
    <Card className="border-emerald-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="size-4 text-emerald-600" /> {label}
        </CardTitle>
        <CardDescription>
          {inWorkflow
            ? 'Bạn có quyền phê duyệt ngay mà không chờ hết các bước của quy trình; các bước còn lại được bỏ qua và người gửi, người duyệt được thông báo.'
            : 'Bạn có quyền duyệt ngay hợp đồng này mà không cần gửi qua quy trình phê duyệt.'}{' '}
          Việc phê duyệt được ghi vào lịch sử và nhật ký.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.length > 0 && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> Cần hoàn thiện trước khi phê duyệt:
            </p>
            <ul className="list-disc pl-6">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="self-approve-note">Ý kiến phê duyệt (tùy chọn)</Label>
          <Textarea id="self-approve-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={approve.isPending}
          onClick={() =>
            onConfirm({
              title: `${label} hợp đồng ${contract.code}?`,
              description: inWorkflow
                ? 'Hợp đồng chuyển ngay sang Đã phê duyệt; các bước phê duyệt còn lại được bỏ qua.'
                : 'Hợp đồng chuyển ngay sang Đã phê duyệt, không qua quy trình phê duyệt.',
              confirmLabel: 'Phê duyệt',
              onConfirm: () => approve.mutate(),
            })
          }
        >
          {approve.isPending ? <Loader2 className="animate-spin" /> : <BadgeCheck />} {label}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Hồ sơ Đã phê duyệt, chưa gửi ký: người có quyền mở lại về Nháp để sửa nội dung, sau đó phải gửi duyệt lại. */
function ReopenPanel({ contract, onConfirm }: { contract: ContractDetail; onConfirm: (state: ConfirmState) => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const reopen = useMutation({
    mutationFn: () => api<undefined>(`/contracts/${contract.id}/approval/reopen`, { method: 'POST', body: { reason: reason.trim() } }),
    onSuccess: () => {
      toast.success('Đã mở lại hồ sơ về Nháp, bạn có thể chỉnh sửa');
      setReason('');
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Pencil className="size-4" /> Cần thay đổi nội dung?
        </CardTitle>
        <CardDescription>
          Mở lại để chỉnh sửa: hồ sơ trở về Nháp và phải gửi phê duyệt lại trước khi ký. Lần phê duyệt cũ vẫn giữ trong lịch sử, lý do mở lại được ghi vào nhật ký.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="reopen-reason">Lý do mở lại *</Label>
          <Textarea id="reopen-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button
          variant="outline"
          disabled={!reason.trim() || reopen.isPending}
          onClick={() =>
            onConfirm({
              title: `Mở lại hồ sơ ${contract.code} để chỉnh sửa?`,
              description: 'Hồ sơ trở về Nháp; kết quả phê duyệt hiện tại không còn hiệu lực và phải gửi duyệt lại.',
              confirmLabel: 'Mở lại',
              onConfirm: () => reopen.mutateAsync().then(() => undefined),
            })
          }
        >
          {reopen.isPending ? <Loader2 className="animate-spin" /> : <Pencil />} Mở lại để chỉnh sửa
        </Button>
      </CardContent>
    </Card>
  );
}

function DecisionPanel({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const decide = useMutation({
    mutationFn: (decision: ApprovalDecision) =>
      api<{ outcome: string }>(`/contracts/${contractId}/approval/decide`, { method: 'POST', body: { decision, comment: comment || undefined } }),
    onSuccess: (r) => {
      const msg: Record<string, string> = {
        STEP_WAITING: 'Đã duyệt – chờ người duyệt khác trong bước',
        NEXT_STEP: 'Đã duyệt – chuyển sang bước tiếp theo',
        APPROVED: 'Hợp đồng đã được phê duyệt hoàn tất',
        REJECTED: 'Đã từ chối hợp đồng',
        CHANGES_REQUESTED: 'Đã yêu cầu chỉnh sửa',
      };
      toast.success(msg[r.outcome] ?? 'Đã ghi nhận');
      setComment('');
      qc.invalidateQueries({ queryKey: ['contract', contractId] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
  const needComment = !comment.trim();
  return (
    <Card className="border-amber-500/50">
      <CardHeader>
        <CardTitle className="text-base">Bạn cần xử lý phê duyệt</CardTitle>
        <CardDescription>Từ chối hoặc yêu cầu chỉnh sửa cần ghi rõ lý do.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="decide-comment">Ý kiến</Label>
          <Textarea id="decide-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide.mutate('APPROVE')} disabled={decide.isPending}>
            <Check /> Phê duyệt
          </Button>
          <Button variant="outline" onClick={() => decide.mutate('REQUEST_CHANGES')} disabled={decide.isPending || needComment} title={needComment ? 'Nhập nội dung cần chỉnh sửa' : undefined}>
            <MessageSquareWarning /> Yêu cầu chỉnh sửa
          </Button>
          <Button variant="destructive" onClick={() => decide.mutate('REJECT')} disabled={decide.isPending || needComment} title={needComment ? 'Nhập lý do từ chối' : undefined}>
            <X /> Từ chối
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ContractApprovalTab({ contract }: { contract: ContractDetail }) {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const history = useQuery({
    queryKey: ['contract', contract.id, 'approval', contract.updatedAt],
    queryFn: () => api<ApprovalRequest[]>(`/contracts/${contract.id}/approval`),
  });
  const cancel = useMutation({
    mutationFn: () => api<undefined>(`/contracts/${contract.id}/approval/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã rút lại yêu cầu phê duyệt');
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });

  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data) return <Skeleton className="h-48" />;

  const pending = history.data.find((r) => r.status === 'PENDING');
  const past = history.data.filter((r) => r !== pending);
  const myTask = pending?.tasks.find((t) => t.approver.id === user?.id && t.status === 'PENDING' && t.stepOrder === pending.currentStep);
  const canSubmit =
    contract.status === 'DRAFT' && !contract.archivedAt && !contract.deletedAt && can('contract.update');
  // Nháp chưa gửi, hoặc đang chờ phê duyệt (duyệt ngay, bỏ qua các bước còn lại).
  const canSelfApprove =
    can('contract.self_approve') &&
    !contract.archivedAt &&
    !contract.deletedAt &&
    ((contract.status === 'DRAFT' && !pending) || (contract.status === 'PENDING_APPROVAL' && !!pending));
  const canReopen = contract.status === 'APPROVED' && !contract.archivedAt && !contract.deletedAt && can('contract.reopen_approved');
  const canCancel = !!pending && can('contract.update') && (pending.submittedBy.id === user?.id || contract.owner?.id === user?.id);

  return (
    <div className="space-y-4">
      {myTask && <DecisionPanel contractId={contract.id} />}

      {pending && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {pending.workflowName} · Bước {pending.currentStep}/{pending.totalSteps}
              </CardTitle>
              <CardDescription>
                Gửi bởi {pending.submittedBy.fullName} lúc {formatDateTime(pending.submittedAt)}
                {pending.submitNote && ` – “${pending.submitNote}”`}
              </CardDescription>
            </div>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirm({
                    title: 'Rút lại yêu cầu phê duyệt?',
                    description: 'Hợp đồng trở về Nháp; các ý kiến đã duyệt của lần này sẽ không còn hiệu lực.',
                    confirmLabel: 'Rút lại',
                    onConfirm: () => cancel.mutateAsync().then(() => undefined),
                  })
                }
              >
                <Undo2 /> Rút lại
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <RequestSteps request={pending} />
          </CardContent>
        </Card>
      )}

      {canReopen && <ReopenPanel contract={contract} onConfirm={setConfirm} />}
      {canSelfApprove && <SelfApprovePanel contract={contract} onConfirm={setConfirm} />}
      {!pending && canSubmit && <SubmitPanel contract={contract} />}
      {!pending && !canSubmit && !canSelfApprove && history.data.length === 0 && <EmptyState title="Hợp đồng chưa được gửi phê duyệt" />}

      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Lịch sử phê duyệt</h3>
          {past.map((r) => (
            <details key={r.id} className="rounded-lg border p-3" open={r === past[0] && !pending && !canSubmit}>
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{APPROVAL_REQUEST_STATUS_LABELS[r.status]}</span> · {r.workflowName} · gửi {formatDateTime(r.submittedAt)} bởi{' '}
                {r.submittedBy.fullName}
                {r.completedAt && ` · kết thúc ${formatDateTime(r.completedAt)}`}
              </summary>
              <div className="mt-3">
                <RequestSteps request={r} />
              </div>
            </details>
          ))}
        </div>
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
