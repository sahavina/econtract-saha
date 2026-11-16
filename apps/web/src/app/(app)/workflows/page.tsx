'use client';

import {
  APPROVAL_MODE_LABELS,
  type ApprovalModeValue,
  type ApprovalStepConfig,
  APPROVER_TYPE_LABELS,
  APPROVER_TYPES,
  type ApproverType,
} from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpNarrowWide, ChevronRight, Clock, Coins, FileText, GitBranch, Loader2, type LucideIcon, Pencil, Plus, Send, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { StatusPill } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import type { Workflow, WorkflowLookups } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StepDraft {
  key: number;
  name: string;
  approverType: ApproverType;
  roleId: string;
  userIds: string[];
  mode: ApprovalModeValue;
  dueHours: string;
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: string;
  contractTypeIds: string[];
  minValue: string;
  maxValue: string;
  steps: StepDraft[];
}

let keySeq = 0;
const newStep = (): StepDraft => ({ key: ++keySeq, name: '', approverType: 'ROLE', roleId: '', userIds: [], mode: 'ANY', dueHours: '48' });

const toDraft = (w?: Workflow): Draft =>
  w
    ? {
        id: w.id,
        name: w.name,
        description: w.description ?? '',
        isActive: w.isActive,
        priority: String(w.priority),
        contractTypeIds: w.contractTypeIds,
        minValue: w.minValue ? String(Number(w.minValue)) : '',
        maxValue: w.maxValue ? String(Number(w.maxValue)) : '',
        steps: w.steps.map((s) => ({
          key: ++keySeq,
          name: s.name,
          approverType: s.approverType,
          roleId: s.roleId ?? '',
          userIds: s.userIds ?? [],
          mode: s.mode,
          dueHours: s.dueHours ? String(s.dueHours) : '',
        })),
      }
    : { name: '', description: '', isActive: true, priority: '100', contractTypeIds: [], minValue: '', maxValue: '', steps: [newStep()] };

function toPayload(d: Draft) {
  return {
    name: d.name,
    description: d.description || null,
    isActive: d.isActive,
    priority: d.priority === '' ? 100 : Number(d.priority),
    contractTypeIds: d.contractTypeIds,
    minValue: d.minValue || null,
    maxValue: d.maxValue || null,
    steps: d.steps.map(
      (s): ApprovalStepConfig => ({
        name: s.name,
        approverType: s.approverType,
        roleId: s.approverType === 'ROLE' ? s.roleId || null : null,
        userIds: s.approverType === 'USERS' ? s.userIds : [],
        mode: s.mode,
        dueHours: s.dueHours ? Number(s.dueHours) : null,
      }),
    ),
  };
}

function valueRange(w: Workflow) {
  if (!w.minValue && !w.maxValue) return 'Mọi giá trị';
  if (!w.minValue) return `Dưới ${formatMoney(w.maxValue)}`;
  if (!w.maxValue) return `Từ ${formatMoney(w.minValue)}`;
  return `${formatMoney(w.minValue)} – dưới ${formatMoney(w.maxValue)}`;
}

/** Nhãn nhỏ cho điều kiện áp dụng (loại hợp đồng, khoảng giá trị). */
function Chip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function WorkflowSheet({ draft: initial, lookups, onClose }: { draft: Draft; lookups: WorkflowLookups; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setStep = (key: number, patch: Partial<StepDraft>) =>
    setD((x) => ({ ...x, steps: x.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((x) => {
      const steps = [...x.steps];
      [steps[i], steps[i + dir]] = [steps[i + dir], steps[i]];
      return { ...x, steps };
    });

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      d.id ? api(`/workflows/${d.id}`, { method: 'PATCH', body: toPayload(d) }) : api('/workflows', { method: 'POST', body: toPayload(d) }),
    onSuccess: () => {
      toast.success('Đã lưu quy trình');
      qc.invalidateQueries({ queryKey: ['workflows'] });
      onClose();
    },
    onError: (err) => {
      setErrors(err instanceof ApiError && err.errors.length ? err.errors.map((e) => `${e.field}: ${e.message}`) : [err instanceof Error ? err.message : 'Lưu thất bại']);
    },
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{d.id ? 'Sửa quy trình phê duyệt' : 'Thêm quy trình phê duyệt'}</SheetTitle>
          <SheetDescription>Các bước chạy tuần tự; trong một bước có thể duyệt song song. Yêu cầu đang chạy không bị ảnh hưởng khi sửa.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5">
              <Label htmlFor="wf-name">Tên quy trình *</Label>
              <Input id="wf-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-priority">Độ ưu tiên</Label>
              <Input id="wf-priority" inputMode="numeric" value={d.priority} onChange={(e) => set({ priority: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wf-desc">Mô tả</Label>
            <Textarea id="wf-desc" rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={d.isActive} onCheckedChange={(v) => set({ isActive: !!v })} /> Đang áp dụng
          </label>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Điều kiện áp dụng</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wf-min">Giá trị từ (≥)</Label>
                <Input id="wf-min" inputMode="numeric" placeholder="Không giới hạn" value={d.minValue} onChange={(e) => set({ minValue: e.target.value.replace(/[^\d]/g, '') })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-max">Giá trị dưới (&lt;)</Label>
                <Input id="wf-max" inputMode="numeric" placeholder="Không giới hạn" value={d.maxValue} onChange={(e) => set({ maxValue: e.target.value.replace(/[^\d]/g, '') })} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm">Loại hợp đồng (không chọn = mọi loại)</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {lookups.contractTypes.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={d.contractTypeIds.includes(t.id)}
                      onCheckedChange={(v) => set({ contractTypeIds: v ? [...d.contractTypeIds, t.id] : d.contractTypeIds.filter((x) => x !== t.id) })}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Các bước phê duyệt</p>
              <Button size="sm" variant="outline" onClick={() => set({ steps: [...d.steps, newStep()] })} disabled={d.steps.length >= 10}>
                <Plus /> Thêm bước
              </Button>
            </div>
            {d.steps.map((s, i) => (
              <div key={s.key} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                  <Input aria-label={`Tên bước ${i + 1}`} placeholder="Tên bước, VD: Kế toán" value={s.name} onChange={(e) => setStep(s.key, { name: e.target.value })} />
                  <Button variant="ghost" size="icon-sm" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Xuống" disabled={i === d.steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Xóa bước" disabled={d.steps.length === 1} onClick={() => set({ steps: d.steps.filter((x) => x.key !== s.key) })}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 [&>*]:min-w-44 [&>*]:flex-1">
                  <Select value={s.approverType} onValueChange={(v) => setStep(s.key, { approverType: v as ApproverType })}>
                    <SelectTrigger className="w-full" aria-label="Người duyệt">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPROVER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {APPROVER_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={s.mode} onValueChange={(v) => setStep(s.key, { mode: v as ApprovalModeValue })}>
                    <SelectTrigger className="w-full" aria-label="Cách duyệt">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['ANY', 'ALL'] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {APPROVAL_MODE_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input aria-label="Hạn xử lý (giờ)" placeholder="Hạn (giờ)" inputMode="numeric" value={s.dueHours} onChange={(e) => setStep(s.key, { dueHours: e.target.value.replace(/[^\d]/g, '') })} />
                </div>
                {s.approverType === 'ROLE' && (
                  <Select value={s.roleId || undefined} onValueChange={(v) => setStep(s.key, { roleId: v })}>
                    <SelectTrigger className="w-full" aria-label="Vai trò duyệt">
                      <SelectValue placeholder="Chọn vai trò…" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {s.approverType === 'USERS' && (
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                    {lookups.users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={s.userIds.includes(u.id)}
                          onCheckedChange={(v) => setStep(s.key, { userIds: v ? [...s.userIds, u.id] : s.userIds.filter((x) => x !== u.id) })}
                        />
                        {u.fullName}
                      </label>
                    ))}
                  </div>
                )}
                {s.approverType === 'DEPARTMENT_MANAGER' && (
                  <p className="text-xs text-muted-foreground">
                    Trưởng phòng hiện tại:{' '}
                    {lookups.departments.map((dep) => `${dep.name}: ${dep.manager?.fullName ?? 'chưa có'}`).join(' · ')}. Bước được bỏ qua nếu người gửi chính là trưởng phòng.
                  </p>
                )}
              </div>
            ))}
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <SheetFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu quy trình
          </Button>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function WorkflowsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const allowed = can('workflow.manage');
  const list = useQuery({ queryKey: ['workflows'], queryFn: () => api<Workflow[]>('/workflows'), enabled: allowed });
  const lookups = useQuery({ queryKey: ['workflows', 'lookups'], queryFn: () => api<WorkflowLookups>('/workflows/lookups'), enabled: allowed });
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/workflows/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xóa quy trình');
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">Bạn không có quyền cấu hình quy trình phê duyệt.</p>;

  const roleName = (id?: string | null) => lookups.data?.roles.find((r) => r.id === id)?.name ?? '…';
  const typeName = (id: string) => lookups.data?.contractTypes.find((t) => t.id === id)?.name ?? '…';
  const stepLabel = (s: ApprovalStepConfig) =>
    s.approverType === 'ROLE' ? roleName(s.roleId) : s.approverType === 'USERS' ? `${s.userIds?.length ?? 0} người chỉ định` : 'Trưởng phòng ban';

  return (
    <>
      <PageHeader
        title="Quy trình phê duyệt"
        description="Hệ thống chọn quy trình đang áp dụng đầu tiên (theo độ ưu tiên) khớp loại và giá trị hợp đồng khi gửi duyệt."
        crumbs={[{ label: 'Quản trị' }, { label: 'Quy trình phê duyệt' }]}
        actions={
          <Button onClick={() => setEditing(toDraft())} disabled={!lookups.data}>
            <Plus /> Thêm quy trình
          </Button>
        }
      />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState title="Chưa có quy trình phê duyệt" description="Hợp đồng sẽ không gửi duyệt được cho tới khi có quy trình phù hợp." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.data.map((w) => (
            <section
              key={w.id}
              className={cn('flex flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]', !w.isActive && 'bg-muted/30')}
            >
              <header className="flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', w.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  <GitBranch className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base leading-snug font-semibold break-words">{w.name}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={w.isActive ? 'green' : 'gray'}>{w.isActive ? 'Đang áp dụng' : 'Tạm dừng'}</StatusPill>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground" title="Số nhỏ được xét trước">
                      <ArrowUpNarrowWide className="size-3" /> Ưu tiên {w.priority}
                    </span>
                  </div>
                </div>
                <div className="-mr-1 flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${w.name}`} onClick={() => setEditing(toDraft(w))} disabled={!lookups.data}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Xóa ${w.name}`}
                    onClick={() =>
                      setConfirm({
                        title: `Xóa quy trình "${w.name}"?`,
                        description: 'Các yêu cầu đã gửi vẫn giữ nguyên lịch sử.',
                        destructive: true,
                        confirmLabel: 'Xóa',
                        onConfirm: () => remove.mutateAsync(w.id).then(() => undefined),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </header>
              <div className="flex-1 space-y-4 p-4 sm:p-5">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Điều kiện áp dụng</p>
                  <div className="flex flex-wrap gap-1.5">
                    {w.contractTypeIds.length ? (
                      w.contractTypeIds.map((id) => (
                        <Chip key={id} icon={FileText}>
                          {typeName(id)}
                        </Chip>
                      ))
                    ) : (
                      <Chip icon={FileText}>Mọi loại hợp đồng</Chip>
                    )}
                    <Chip icon={Coins}>{valueRange(w)}</Chip>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Các bước phê duyệt ({w.steps.length})</p>
                  <ol className="flex flex-wrap items-start gap-x-1.5 gap-y-3">
                    {w.steps.map((s, i) => (
                      <li key={i} className="flex min-w-0 items-start gap-1.5">
                        {i > 0 && <ChevronRight aria-hidden className="mt-2 size-4 shrink-0 text-muted-foreground" />}
                        <div className="flex min-w-0 items-start gap-2 rounded-lg border bg-background px-2.5 py-2" title={`${APPROVAL_MODE_LABELS[s.mode]}${s.dueHours ? ` · hạn ${s.dueHours} giờ` : ''}`}>
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                          <span className="min-w-0 max-w-44">
                            <span className="block text-sm leading-tight font-medium break-words">{s.name}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <UserCheck className="size-3 shrink-0" />
                              <span className="truncate">{stepLabel(s)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              {APPROVAL_MODE_LABELS[s.mode]}
                              {s.dueHours ? (
                                <>
                                  <Clock className="ml-1 size-3 shrink-0" /> {s.dueHours} giờ
                                </>
                              ) : null}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                {w.description && <p className="text-sm text-muted-foreground">{w.description}</p>}
              </div>
              <footer className="flex items-center gap-1.5 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
                <Send className="size-3.5" /> Đã dùng cho <span className="font-semibold text-foreground tabular-nums">{w._count?.requests ?? 0}</span> lượt gửi duyệt
              </footer>
            </section>
          ))}
        </div>
      )}
      {editing && lookups.data && <WorkflowSheet draft={editing} lookups={lookups.data} onClose={() => setEditing(null)} />}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
