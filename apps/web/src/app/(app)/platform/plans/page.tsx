'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { errorList, FormErrors, formatQuotaMb, Pill, type Plan, usePlatformGate } from '@/lib/platform';

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
        <Skeleton className="h-64" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gói</TableHead>
                <TableHead className="text-right">Người dùng</TableHead>
                <TableHead className="text-right">Hợp đồng / năm</TableHead>
                <TableHead className="text-right">Lưu trữ</TableHead>
                <TableHead className="text-right">Đơn giá / tháng</TableHead>
                <TableHead className="text-right">Doanh nghiệp đang dùng</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((p) => (
                <TableRow key={p.id} className={p.isActive ? undefined : 'opacity-60'}>
                  <TableCell>
                    <p className="font-medium">
                      {p.name} <span className="text-xs text-muted-foreground">({p.code})</span>
                    </p>
                    {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    {!p.isActive && <Pill label="Ngừng cung cấp" tone="bg-muted text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.maxUsers.toLocaleString('vi-VN')}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.maxContractsYear.toLocaleString('vi-VN')}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuotaMb(p.storageQuotaMb)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.priceMonthly)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.tenantCount}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Sửa gói ${p.name}`} onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
