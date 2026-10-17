'use client';

import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import {
  errorList,
  FormErrors,
  formatStorage,
  Pill,
  type Plan,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  type TenantRow,
  type TenantStatus,
  usePlatformGate,
} from '@/lib/platform';

const emptyDraft = {
  code: '',
  name: '',
  taxCode: '',
  email: '',
  phone: '',
  address: '',
  planId: '',
  subscriptionStatus: 'TRIAL' as 'TRIAL' | 'ACTIVE',
  durationDays: '30',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

function CreateTenantSheet({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [d, setD] = useState({ ...emptyDraft, planId: plans.find((p) => p.code === 'trial')?.id ?? plans[0]?.id ?? '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      api<TenantRow>('/platform/tenants', {
        method: 'POST',
        body: {
          code: d.code,
          name: d.name,
          taxCode: d.taxCode,
          email: d.email,
          phone: d.phone,
          address: d.address,
          planId: d.planId,
          subscriptionStatus: d.subscriptionStatus,
          durationDays: d.durationDays,
          admin: { fullName: d.adminName, email: d.adminEmail, password: d.adminPassword },
        },
      }),
    onSuccess: (t) => {
      toast.success(`Đã tạo doanh nghiệp ${t.name}`);
      qc.invalidateQueries({ queryKey: ['platform'] });
      router.push(`/platform/tenants/${t.id}`);
    },
    onError: (err) => setErrors(errorList(err)),
  });

  const submit = () => {
    if (!isStrongPassword(d.adminPassword)) return setErrors([`Mật khẩu quản trị viên: ${PASSWORD_RULE_MESSAGE}`]);
    setErrors([]);
    save.mutate();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Thêm doanh nghiệp</SheetTitle>
          <SheetDescription>Hệ thống tạo sẵn vai trò, loại hợp đồng mặc định và tài khoản quản trị đầu tiên.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="t-code">Mã đăng nhập *</Label>
              <Input id="t-code" value={d.code} placeholder="vd: congty-abc" onChange={(e) => set({ code: e.target.value.toLowerCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Tên doanh nghiệp *</Label>
              <Input id="t-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Người dùng nhập mã này ở màn hình đăng nhập; không đổi được sau khi tạo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-tax">Mã số thuế</Label>
              <Input id="t-tax" value={d.taxCode} onChange={(e) => set({ taxCode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-phone">Điện thoại</Label>
              <Input id="t-phone" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-email">Email liên hệ</Label>
            <Input id="t-email" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-addr">Địa chỉ</Label>
            <Input id="t-addr" value={d.address} onChange={(e) => set({ address: e.target.value })} />
          </div>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Gói dịch vụ</legend>
            <div className="space-y-1.5">
              <Label>Gói *</Label>
              <Select value={d.planId} onValueChange={(v) => set({ planId: v })}>
                <SelectTrigger className="w-full" aria-label="Gói dịch vụ">
                  <SelectValue placeholder="Chọn gói" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatMoney(p.priceMonthly)}/tháng
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Hình thức</Label>
                <Select value={d.subscriptionStatus} onValueChange={(v) => set({ subscriptionStatus: v as 'TRIAL' | 'ACTIVE' })}>
                  <SelectTrigger className="w-full" aria-label="Hình thức">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Dùng thử</SelectItem>
                    <SelectItem value="ACTIVE">Chính thức</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-days">Thời hạn (ngày)</Label>
                <Input id="t-days" type="number" min={1} value={d.durationDays} placeholder="Không thời hạn" onChange={(e) => set({ durationDays: e.target.value })} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Tài khoản quản trị đầu tiên</legend>
            <div className="space-y-1.5">
              <Label htmlFor="t-admin-name">Họ tên *</Label>
              <Input id="t-admin-name" value={d.adminName} onChange={(e) => set({ adminName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-admin-email">Email đăng nhập *</Label>
              <Input id="t-admin-email" type="email" value={d.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-admin-pw">Mật khẩu ban đầu *</Label>
              <Input id="t-admin-pw" type="password" autoComplete="new-password" value={d.adminPassword} onChange={(e) => set({ adminPassword: e.target.value })} />
              <p className="text-xs text-muted-foreground">{PASSWORD_RULE_MESSAGE}. Gửi cho khách hàng qua kênh riêng.</p>
            </div>
          </fieldset>
          <FormErrors errors={errors} />
        </div>
        <SheetFooter>
          <Button onClick={submit} disabled={save.isPending || !d.planId}>
            {save.isPending && <Loader2 className="animate-spin" />} Tạo doanh nghiệp
          </Button>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function PlatformTenantsPage() {
  const { allowed, denied } = usePlatformGate();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [planId, setPlanId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['platform', 'tenants', { q, status, planId, page }],
    queryFn: () => api<Paginated<TenantRow>>('/platform/tenants', { query: { q, status, planId, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });
  const plans = useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api<Plan[]>('/platform/plans'), enabled: allowed });
  if (!allowed) return denied;

  return (
    <>
      <PageHeader
        title="Doanh nghiệp"
        crumbs={[{ label: 'Super Admin' }, { label: 'Doanh nghiệp' }]}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!plans.data}>
            <Plus /> Thêm doanh nghiệp
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Tìm tên, mã, MST, email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm doanh nghiệp" />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(Object.keys(TENANT_STATUS) as TenantStatus[]).map((s) => ({ value: s, label: TENANT_STATUS[s].label }))} />
        <FilterSelect allLabel="Mọi gói" value={planId} onChange={(v) => { setPlanId(v); setPage(1); }} options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doanh nghiệp</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Gói hiện hành</TableHead>
                <TableHead className="text-right">Người dùng</TableHead>
                <TableHead className="text-right">HĐ trong năm</TableHead>
                <TableHead className="text-right">Lưu trữ</TableHead>
                <TableHead>Ngày tạo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-24" />
                  </TableCell>
                </TableRow>
              ) : !list.data.items.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-4">
                    <EmptyState title="Không có doanh nghiệp phù hợp" />
                  </TableCell>
                </TableRow>
              ) : (
                list.data.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/platform/tenants/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t.code}
                        {t.taxCode && ` · MST ${t.taxCode}`}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Pill {...TENANT_STATUS[t.status]} />
                    </TableCell>
                    <TableCell>
                      {t.subscription ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {t.subscription.plan.name}
                          <Pill {...SUBSCRIPTION_STATUS[t.subscription.status]} />
                          {t.subscription.endsAt && <span className="text-xs text-muted-foreground">đến {formatDate(t.subscription.endsAt)}</span>}
                        </div>
                      ) : (
                        <span className="text-sm text-destructive">Không có gói hiệu lực</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.usage.users}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.usage.contractsThisYear}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatStorage(t.usage.storageBytes)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(t.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {list.data && list.data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </Button>
          Trang {list.data.page}/{list.data.totalPages}
          <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
      {creating && plans.data && <CreateTenantSheet plans={plans.data.filter((p) => p.isActive)} onClose={() => setCreating(false)} />}
    </>
  );
}
