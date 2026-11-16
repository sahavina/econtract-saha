'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarClock, Gauge, Hash, Info, Layers, Loader2, type LucideIcon, Mail, MapPin, Package, Pencil, Phone, Plus, Power, PowerOff, Receipt, Repeat, UserCog } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DetailHeader } from '@/components/detail-header';
import { InitialsAvatar, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { ErrorState } from '@/components/page-header';
import { CreateInvoiceDialog, InvoiceTable } from '@/components/platform-invoices';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatMoney, toDateInput } from '@/lib/format';
import {
  errorList,
  FormErrors,
  formatQuotaMb,
  formatStorage,
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
import { cn } from '@/lib/utils';

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

/** Thẻ có tiêu đề kèm biểu tượng (cùng kiểu thẻ trong form hợp đồng). */
function Section({
  icon: Icon,
  title,
  action,
  bodyClassName,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 sm:px-5">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </header>
      <div className={bodyClassName ?? 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

/** Dòng nhãn – giá trị trong thẻ Thông tin. */
function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium break-words">{children}</dd>
      </div>
    </div>
  );
}

const TENANT_TONE: Record<TenantStatus, Tone> = { ACTIVE: 'green', SUSPENDED: 'amber', CLOSED: 'gray' };
const SUB_TONE: Record<SubscriptionStatus, Tone> = { TRIAL: 'sky', ACTIVE: 'green', PAST_DUE: 'amber', CANCELLED: 'gray', EXPIRED: 'gray' };

/** Nhãn thuê bao trong lịch sử (theo subscriptionPill: đã qua ngày kết thúc ⇒ "Đã kết thúc", màu xám). */
function SubPill({ sub }: { sub: Subscription }) {
  const p = subscriptionPill(sub);
  return <StatusPill tone={p.label === SUBSCRIPTION_STATUS[sub.status].label ? SUB_TONE[sub.status] : 'gray'}>{p.label}</StatusPill>;
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
  if (!t)
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  const isOwn = t.id === user?.tenant.id;
  const current = t.subscriptions.find((s) => s.id === t.currentSubscriptionId);

  return (
    <>
      <DetailHeader
        crumbs={[{ label: 'Super Admin' }, { label: 'Doanh nghiệp', href: '/platform/tenants' }, { label: t.code }]}
        icon={Building2}
        title={t.name}
        status={<StatusPill tone={TENANT_TONE[t.status]}>{TENANT_STATUS[t.status].label}</StatusPill>}
        meta={
          <span>
            Mã đăng nhập: <span className="font-medium text-foreground">{t.code}</span> · tạo ngày {formatDate(t.createdAt)}
          </span>
        }
        actions={
          <>
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
          </>
        }
        facts={[
          { label: 'Gói hiện hành', value: t.limits?.planName ?? <span className="text-destructive">Không có gói</span> },
          { label: 'Thuê bao', value: current ? <SubPill sub={current} /> : '—' },
          { label: 'Hết hạn', value: current ? (current.endsAt ? formatDate(current.endsAt) : 'Không thời hạn') : '—' },
          { label: 'Đơn giá / tháng', value: current ? formatMoney(current.plan.priceMonthly) : '—' },
        ]}
      >
        {isOwn ? 'Đây là doanh nghiệp chứa tài khoản Super Admin của bạn.' : undefined}
      </DetailHeader>

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Section icon={Info} title="Thông tin">
            <dl className="space-y-3">
              <InfoRow icon={Hash} label="Mã số thuế">
                {t.taxCode ?? '—'}
              </InfoRow>
              <InfoRow icon={Mail} label="Email">
                {t.email ?? '—'}
              </InfoRow>
              <InfoRow icon={Phone} label="Điện thoại">
                {t.phone ?? '—'}
              </InfoRow>
              <InfoRow icon={MapPin} label="Địa chỉ">
                {t.address ?? '—'}
              </InfoRow>
            </dl>
          </Section>
          <Section icon={Gauge} title="Mức sử dụng" action={<span className="text-sm text-muted-foreground">{t.limits?.planName ?? 'Không có gói'}</span>}>
            <div className="space-y-4">
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
              {!t.limits && (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
                  Không có gói hiệu lực: doanh nghiệp không tạo được hợp đồng, người dùng hay tài liệu mới.
                </p>
              )}
            </div>
          </Section>
          <Section icon={UserCog} title="Quản trị viên" bodyClassName="p-0">
            {t.admins.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground sm:px-5">Không có quản trị viên.</p>
            ) : (
              <ul className="divide-y">
                {t.admins.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <InitialsAvatar name={a.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                        <span className="min-w-0 break-words">{a.fullName}</span>
                        {a.status !== 'ACTIVE' && <StatusPill tone="gray">{a.status}</StatusPill>}
                      </p>
                      <p className="text-xs break-all text-muted-foreground">{a.email}</p>
                      <p className="text-xs text-muted-foreground">Đăng nhập {formatDateTime(a.lastLoginAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section
          icon={Layers}
          title="Gói dịch vụ"
          bodyClassName="p-0"
          action={
            <Button size="sm" onClick={() => setDialog('plan')}>
              <Repeat /> Đổi gói / gia hạn
            </Button>
          }
        >
          <ul className="divide-y md:hidden">
            {t.subscriptions.map((s) => (
              <li key={s.id} className={cn('flex items-start gap-2 px-4 py-3', s.id === t.currentSubscriptionId && 'bg-primary/5')}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">
                      {s.plan.name}
                      {s.id === t.currentSubscriptionId && <span className="ml-1.5 text-xs font-normal text-primary">(hiện hành)</span>}
                    </p>
                    <SubPill sub={s} />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(s.startsAt)} → {s.endsAt ? formatDate(s.endsAt) : 'Không thời hạn'}
                  </p>
                  {s.note && <p className="text-sm text-muted-foreground">{s.note}</p>}
                </div>
                <Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0" aria-label={`Sửa thuê bao ${s.plan.name}`} onClick={() => setEditingSub(s)}>
                  <CalendarClock />
                </Button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <Th className="pl-5">Gói</Th>
                  <Th>Trạng thái</Th>
                  <Th>Bắt đầu</Th>
                  <Th>Kết thúc</Th>
                  <Th>Ghi chú</Th>
                  <Th className="pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.subscriptions.map((s) => (
                  <TableRow key={s.id} className={s.id === t.currentSubscriptionId ? 'bg-primary/5' : undefined}>
                    <TableCell className="pl-5">
                      <TitleCell icon={Package} title={s.plan.name} sub={s.id === t.currentSubscriptionId ? <span className="text-primary">Hiện hành</span> : s.plan.code} />
                    </TableCell>
                    <TableCell>
                      <SubPill sub={s} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDate(s.startsAt)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{s.endsAt ? formatDate(s.endsAt) : 'Không thời hạn'}</TableCell>
                    <TableCell className="max-w-72 text-sm whitespace-normal text-muted-foreground">{s.note}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={`Sửa thuê bao ${s.plan.name}`} onClick={() => setEditingSub(s)}>
                        <CalendarClock />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section
          icon={Receipt}
          title="Hóa đơn"
          bodyClassName="px-2 py-1 sm:px-3"
          action={
            <Button size="sm" onClick={() => setDialog('invoice')}>
              <Plus /> Phát hành hóa đơn
            </Button>
          }
        >
          <InvoiceTable invoices={t.invoices} />
        </Section>
      </div>

      {dialog === 'edit' && <EditTenantDialog tenant={t} onClose={() => setDialog(null)} />}
      {dialog === 'plan' && <ChangePlanDialog tenant={t} onClose={() => setDialog(null)} />}
      {dialog === 'invoice' && <CreateInvoiceDialog fixedTenant={t} monthlyPrice={current?.plan.priceMonthly} onClose={() => setDialog(null)} />}
      {(dialog === 'ACTIVE' || dialog === 'SUSPENDED' || dialog === 'CLOSED') && <StatusDialog tenant={t} to={dialog} onClose={() => setDialog(null)} />}
      {editingSub && <EditSubscriptionDialog sub={editingSub} onClose={() => setEditingSub(null)} />}
    </>
  );
}
