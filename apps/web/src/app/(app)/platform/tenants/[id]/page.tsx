'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2, Pencil, Plus, Power, PowerOff, Repeat } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, PageHeader } from '@/components/page-header';
import { CreateInvoiceDialog, InvoiceTable } from '@/components/platform-invoices';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatMoney, toDateInput } from '@/lib/format';
import {
  errorList,
  FormErrors,
  formatQuotaMb,
  formatStorage,
  Pill,
  type Plan,
  type Subscription,
  SUBSCRIPTION_STATUS,
  subscriptionPill,
  type SubscriptionStatus,
  type TenantDetail,
  TENANT_STATUS,
  type TenantStatus,
  todayInput,
  UsageBar,
  usePlatformGate,
} from '@/lib/platform';

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['platform'] });
};

function EditTenantDialog({ tenant, onClose }: { tenant: TenantDetail; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [d, setD] = useState({ name: tenant.name, taxCode: tenant.taxCode ?? '', email: tenant.email ?? '', phone: tenant.phone ?? '', address: tenant.address ?? '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/platform/tenants/${tenant.id}`, { method: 'PATCH', body: d }),
    onSuccess: () => {
      toast.success('Đã cập nhật thông tin doanh nghiệp');
      invalidate();
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa thông tin doanh nghiệp</DialogTitle>
          <DialogDescription>Mã đăng nhập “{tenant.code}” không thay đổi được.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Tên doanh nghiệp *</Label>
            <Input id="e-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-tax">Mã số thuế</Label>
              <Input id="e-tax" value={d.taxCode} onChange={(e) => set({ taxCode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-phone">Điện thoại</Label>
              <Input id="e-phone" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-email">Email liên hệ</Label>
            <Input id="e-email" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-addr">Địa chỉ</Label>
            <Input id="e-addr" value={d.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
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

function StatusDialog({ tenant, to, onClose }: { tenant: TenantDetail; to: TenantStatus; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const run = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/platform/tenants/${tenant.id}/status`, { method: 'POST', body: { status: to, reason } }),
    onSuccess: () => {
      toast.success(`Đã chuyển sang "${TENANT_STATUS[to].label}"`);
      invalidate();
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  const title = to === 'ACTIVE' ? 'Kích hoạt lại doanh nghiệp' : to === 'SUSPENDED' ? 'Tạm ngưng doanh nghiệp' : 'Đóng doanh nghiệp';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title}: {tenant.name}
          </DialogTitle>
          <DialogDescription>
            {to === 'ACTIVE'
              ? 'Người dùng của doanh nghiệp đăng nhập lại được ngay.'
              : 'Toàn bộ người dùng của doanh nghiệp bị đăng xuất và không đăng nhập được; đối tác vẫn có thể mở liên kết ký đã gửi. Dữ liệu được giữ nguyên.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="st-reason">Lý do</Label>
          <Textarea id="st-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <FormErrors errors={errors} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button variant={to === 'ACTIVE' ? 'default' : 'destructive'} disabled={run.isPending} onClick={() => run.mutate()}>
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePlanDialog({ tenant, onClose }: { tenant: TenantDetail; onClose: () => void }) {
  const invalidate = useInvalidate();
  const plans = useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api<Plan[]>('/platform/plans') });
  const [d, setD] = useState({ planId: '', status: 'ACTIVE' as 'ACTIVE' | 'TRIAL', startsAt: todayInput(), endsAt: '', note: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/platform/tenants/${tenant.id}/subscriptions`, { method: 'POST', body: d }),
    onSuccess: () => {
      toast.success('Đã cập nhật gói dịch vụ');
      invalidate();
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi gói / gia hạn</DialogTitle>
          <DialogDescription>Gói đang hiệu lực sẽ kết thúc vào ngày gói mới bắt đầu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Gói *</Label>
            <Select value={d.planId} onValueChange={(v) => set({ planId: v })}>
              <SelectTrigger className="w-full" aria-label="Gói dịch vụ">
                <SelectValue placeholder="Chọn gói" />
              </SelectTrigger>
              <SelectContent>
                {(plans.data ?? [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.maxUsers} người dùng · {formatMoney(p.priceMonthly)}/tháng
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Hình thức</Label>
              <Select value={d.status} onValueChange={(v) => set({ status: v as 'ACTIVE' | 'TRIAL' })}>
                <SelectTrigger className="w-full" aria-label="Hình thức">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Chính thức</SelectItem>
                  <SelectItem value="TRIAL">Dùng thử</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-start">Bắt đầu</Label>
              <Input id="cp-start" type="date" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-end">Kết thúc</Label>
              <Input id="cp-end" type="date" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Bỏ trống ngày kết thúc ⇒ không thời hạn (gia hạn tự động theo hóa đơn).</p>
          <div className="space-y-1.5">
            <Label htmlFor="cp-note">Ghi chú</Label>
            <Input id="cp-note" value={d.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <FormErrors errors={errors} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={save.isPending || !d.planId} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Áp dụng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSubscriptionDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [d, setD] = useState({ status: sub.status, endsAt: toDateInput(sub.endsAt), note: sub.note ?? '' });
  const [errors, setErrors] = useState<string[]>([]);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/platform/subscriptions/${sub.id}`, { method: 'PATCH', body: d }),
    onSuccess: () => {
      toast.success('Đã cập nhật thuê bao');
      invalidate();
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thuê bao gói {sub.plan.name}</DialogTitle>
          <DialogDescription>Bắt đầu {formatDate(sub.startsAt)}. “Quá hạn thanh toán” vẫn cho dùng dịch vụ; “Đã hủy”/“Hết hạn” sẽ chặn tạo dữ liệu mới.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v as SubscriptionStatus })}>
                <SelectTrigger className="w-full" aria-label="Trạng thái thuê bao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SUBSCRIPTION_STATUS) as SubscriptionStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SUBSCRIPTION_STATUS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-end">Kết thúc</Label>
              <Input id="es-end" type="date" value={d.endsAt} onChange={(e) => setD({ ...d, endsAt: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-note">Ghi chú</Label>
            <Input id="es-note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
          </div>
          <FormErrors errors={errors} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { allowed, denied } = usePlatformGate();
  const q = useQuery({ queryKey: ['platform', 'tenant', id], queryFn: () => api<TenantDetail>(`/platform/tenants/${id}`), enabled: allowed });
  const [dialog, setDialog] = useState<null | 'edit' | 'plan' | 'invoice' | TenantStatus>(null);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  if (!allowed) return denied;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data;
  if (!t) return <Skeleton className="h-96" />;
  const isOwn = t.id === user?.tenant.id;
  const current = t.subscriptions.find((s) => s.id === t.currentSubscriptionId);

  return (
    <>
      <PageHeader
        title={t.name}
        description={`Mã đăng nhập: ${t.code} · tạo ngày ${formatDate(t.createdAt)}`}
        crumbs={[{ label: 'Super Admin' }, { label: 'Doanh nghiệp', href: '/platform/tenants' }, { label: t.code }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil /> Sửa thông tin
            </Button>
            {t.status === 'ACTIVE' ? (
              !isOwn && (
                <>
                  <Button variant="outline" onClick={() => setDialog('SUSPENDED')}>
                    <PowerOff /> Tạm ngưng
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => setDialog('CLOSED')}>
                    Đóng
                  </Button>
                </>
              )
            ) : (
              <Button onClick={() => setDialog('ACTIVE')}>
                <Power /> Kích hoạt lại
              </Button>
            )}
          </div>
        }
      />
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>
                Trạng thái: <Pill {...TENANT_STATUS[t.status]} />
              </p>
              <p>Mã số thuế: {t.taxCode ?? '—'}</p>
              <p>Email: {t.email ?? '—'}</p>
              <p>Điện thoại: {t.phone ?? '—'}</p>
              <p>Địa chỉ: {t.address ?? '—'}</p>
              {isOwn && <p className="text-xs text-muted-foreground">Đây là doanh nghiệp chứa tài khoản Super Admin của bạn.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Mức sử dụng</CardTitle>
              <span className="text-sm text-muted-foreground">{t.limits?.planName ?? 'Không có gói'}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <UsageBar label="Người dùng" used={t.usage.users} limit={t.limits?.maxUsers ?? null} display={`${t.usage.users} / ${t.limits?.maxUsers ?? '—'}`} />
              <UsageBar
                label="Hợp đồng trong năm"
                used={t.usage.contractsThisYear}
                limit={t.limits?.maxContractsYear ?? null}
                display={`${t.usage.contractsThisYear.toLocaleString('vi-VN')} / ${t.limits?.maxContractsYear.toLocaleString('vi-VN') ?? '—'}`}
              />
              <UsageBar
                label="Lưu trữ"
                used={t.usage.storageBytes}
                limit={t.limits ? t.limits.storageQuotaMb * 1024 * 1024 : null}
                display={`${formatStorage(t.usage.storageBytes)} / ${t.limits ? formatQuotaMb(t.limits.storageQuotaMb) : '—'}`}
              />
              {!t.limits && <p className="text-sm text-destructive">Không có gói hiệu lực: doanh nghiệp không tạo được hợp đồng, người dùng hay tài liệu mới.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quản trị viên</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {t.admins.length === 0 ? (
                <p className="text-muted-foreground">Không có quản trị viên.</p>
              ) : (
                t.admins.map((a) => (
                  <div key={a.id}>
                    <p className="font-medium">
                      {a.fullName} {a.status !== 'ACTIVE' && <span className="text-xs text-muted-foreground">({a.status})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.email} · đăng nhập {formatDateTime(a.lastLoginAt)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Gói dịch vụ</CardTitle>
            <Button size="sm" onClick={() => setDialog('plan')}>
              <Repeat /> Đổi gói / gia hạn
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gói</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead>Kết thúc</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.subscriptions.map((s) => (
                  <TableRow key={s.id} className={s.id === t.currentSubscriptionId ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-medium">
                      {s.plan.name}
                      {s.id === t.currentSubscriptionId && <span className="ml-1.5 text-xs text-primary">(hiện hành)</span>}
                    </TableCell>
                    <TableCell>
                      <Pill {...subscriptionPill(s)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(s.startsAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.endsAt ? formatDate(s.endsAt) : 'Không thời hạn'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.note}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={`Sửa thuê bao ${s.plan.name}`} onClick={() => setEditingSub(s)}>
                        <CalendarClock />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Hóa đơn</CardTitle>
            <Button size="sm" onClick={() => setDialog('invoice')}>
              <Plus /> Phát hành hóa đơn
            </Button>
          </CardHeader>
          <CardContent>
            <InvoiceTable invoices={t.invoices} />
          </CardContent>
        </Card>
      </div>

      {dialog === 'edit' && <EditTenantDialog tenant={t} onClose={() => setDialog(null)} />}
      {dialog === 'plan' && <ChangePlanDialog tenant={t} onClose={() => setDialog(null)} />}
      {dialog === 'invoice' && <CreateInvoiceDialog fixedTenant={t} monthlyPrice={current?.plan.priceMonthly} onClose={() => setDialog(null)} />}
      {(dialog === 'ACTIVE' || dialog === 'SUSPENDED' || dialog === 'CLOSED') && <StatusDialog tenant={t} to={dialog} onClose={() => setDialog(null)} />}
      {editingSub && <EditSubscriptionDialog sub={editingSub} onClose={() => setEditingSub(null)} />}
    </>
  );
}
