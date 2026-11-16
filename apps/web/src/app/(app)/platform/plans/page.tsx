'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Loader2, Package, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusPill } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { errorList, FormErrors, formatQuotaMb, type Plan, usePlatformGate } from '@/lib/platform';
import { cn } from '@/lib/utils';

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !plan;
  const [d, setD] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    maxUsers: String(plan?.maxUsers ?? 10),
    maxContractsYear: String(plan?.maxContractsYear ?? 500),
    storageQuotaMb: String(plan?.storageQuotaMb ?? 5120),
    priceMonthly: plan ? String(Number(plan.priceMonthly)) : '0',
    isActive: plan?.isActive ?? true,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      if (isNew) return api('/platform/plans', { method: 'POST', body: d });
      // Mã gói không đổi được sau khi tạo.
      return api(`/platform/plans/${plan.id}`, { method: 'PATCH', body: { ...d, code: undefined } });
    },
    onSuccess: () => {
      toast.success(isNew ? 'Đã tạo gói dịch vụ' : 'Đã cập nhật gói dịch vụ');
      qc.invalidateQueries({ queryKey: ['platform'] });
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  const num = (key: 'maxUsers' | 'maxContractsYear' | 'storageQuotaMb' | 'priceMonthly', label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`p-${key}`}>{label}</Label>
      <Input id={`p-${key}`} type="number" min={key === 'priceMonthly' ? 0 : 1} value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Thêm gói dịch vụ' : `Sửa gói ${plan.name}`}</DialogTitle>
          {!isNew && plan.tenantCount > 0 && (
            <DialogDescription>{plan.tenantCount} doanh nghiệp đang dùng gói này; hạn mức mới áp dụng ngay cho họ.</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="p-code">Mã *</Label>
              <Input id="p-code" disabled={!isNew} value={d.code} onChange={(e) => set({ code: e.target.value.toLowerCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Tên gói *</Label>
              <Input id="p-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Mô tả</Label>
            <Input id="p-desc" value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {num('maxUsers', 'Số người dùng tối đa *', 'Không tính tài khoản đã vô hiệu')}
            {num('maxContractsYear', 'Hợp đồng / năm *', 'Tính cả hợp đồng đã xóa')}
            {num('storageQuotaMb', 'Dung lượng (MB) *', formatQuotaMb(Number(d.storageQuotaMb) || 0))}
            {num('priceMonthly', 'Đơn giá / tháng (₫) *', formatMoney(d.priceMonthly || 0))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={d.isActive} onCheckedChange={(v) => set({ isActive: !!v })} /> Đang cung cấp (cho phép chọn khi tạo doanh nghiệp/đổi gói)
          </label>
          <FormErrors errors={errors} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Thẻ một gói: tên, đơn giá, hạn mức dạng danh sách đánh dấu, số doanh nghiệp đang dùng. */
function PlanCard({ plan: p, onEdit }: { plan: Plan; onEdit: () => void }) {
  const limits = [
    `${p.maxUsers.toLocaleString('vi-VN')} người dùng`,
    `${p.maxContractsYear.toLocaleString('vi-VN')} hợp đồng / năm`,
    `${formatQuotaMb(p.storageQuotaMb)} lưu trữ`,
  ];
  return (
    <section className={cn('flex flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]', !p.isActive && 'bg-muted/30')}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', p.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <Package className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="leading-snug font-semibold break-words">{p.name}</h2>
          <p className="text-xs text-muted-foreground">Mã: {p.code}</p>
        </div>
        <StatusPill tone={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Đang cung cấp' : 'Ngừng cung cấp'}</StatusPill>
      </div>
      <div className="flex-1 space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
        <p>
          <span className="text-2xl font-bold tabular-nums">{formatMoney(p.priceMonthly)}</span>
          <span className="text-sm text-muted-foreground"> / tháng</span>
        </p>
        {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
        <ul className="space-y-2 text-sm">
          {limits.map((l) => (
            <li key={l} className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300">
                <Check className="size-3.5" />
              </span>
              <span className="tabular-nums">{l}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 sm:px-5">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="size-4" aria-hidden />
          <span className="tabular-nums">{p.tenantCount}</span> doanh nghiệp đang dùng
        </span>
        <Button variant="outline" size="sm" aria-label={`Sửa gói ${p.name}`} onClick={onEdit}>
          <Pencil /> Sửa
        </Button>
      </div>
    </section>
  );
}

export default function PlatformPlansPage() {
  const { allowed, denied } = usePlatformGate();
  const q = useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api<Plan[]>('/platform/plans'), enabled: allowed });
  const [editing, setEditing] = useState<Plan | null | 'new'>(null);
  if (!allowed) return denied;

  return (
    <>
      <PageHeader
        title="Gói dịch vụ"
        description="Hạn mức áp dụng khi doanh nghiệp thêm người dùng, tạo hợp đồng và tải tài liệu."
        crumbs={[{ label: 'Super Admin' }, { label: 'Gói dịch vụ' }]}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Thêm gói
          </Button>
        }
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <EmptyState title="Chưa có gói dịch vụ" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((p) => (
            <PlanCard key={p.id} plan={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
