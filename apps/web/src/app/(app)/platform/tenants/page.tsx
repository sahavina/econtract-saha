'use client';

import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import {
  errorList,
  FormErrors,
  formatStorage,
  type Plan,
  SUBSCRIPTION_STATUS,
  type SubscriptionStatus,
  TENANT_STATUS,
  type TenantRow,
  type TenantStatus,
  usePlatformGate,
} from '@/lib/platform';

const TENANT_TONE: Record<TenantStatus, Tone> = { ACTIVE: 'green', SUSPENDED: 'amber', CLOSED: 'gray' };
const SUB_TONE: Record<SubscriptionStatus, Tone> = { TRIAL: 'sky', ACTIVE: 'green', PAST_DUE: 'amber', CANCELLED: 'gray', EXPIRED: 'gray' };

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

  const statusOptions = (Object.keys(TENANT_STATUS) as TenantStatus[]).map((s) => ({ value: s, label: TENANT_STATUS[s].label }));

  /** Gói hiện hành: tên gói + trạng thái thuê bao + ngày hết hạn. */
  const planCell = (t: TenantRow) =>
    t.subscription ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{t.subscription.plan.name}</span>
        <StatusPill tone={SUB_TONE[t.subscription.status]}>{SUBSCRIPTION_STATUS[t.subscription.status].label}</StatusPill>
        {t.subscription.endsAt && <span className="text-xs text-muted-foreground">đến {formatDate(t.subscription.endsAt)}</span>}
      </span>
    ) : (
      <StatusPill tone="red">Không có gói hiệu lực</StatusPill>
    );

  return (
    <>
      <PageHeader
        title="Doanh nghiệp"
        description="Các doanh nghiệp dùng hệ thống, gói hiện hành và mức sử dụng."
        crumbs={[{ label: 'Super Admin' }, { label: 'Doanh nghiệp' }]}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!plans.data}>
            <Plus /> Thêm doanh nghiệp
          </Button>
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên, mã, MST, email…" ariaLabel="Tìm doanh nghiệp" />
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-44 sm:flex-none" allLabel="Mọi trạng thái" ariaLabel="Trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={statusOptions} />
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-44 sm:flex-none" allLabel="Mọi gói" ariaLabel="Gói dịch vụ" value={planId} onChange={(v) => { setPlanId(v); setPage(1); }} options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          </>
        }
      >
        <ListState query={list} empty={{ title: 'Không có doanh nghiệp phù hợp' }} />
        {!!list.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {list.data.items.map((t) => (
                <MobileCard
                  key={t.id}
                  href={`/platform/tenants/${t.id}`}
                  title={t.name}
                  sub={
                    <>
                      {t.code}
                      {t.taxCode && ` · MST ${t.taxCode}`}
                    </>
                  }
                  status={<StatusPill tone={TENANT_TONE[t.status]}>{TENANT_STATUS[t.status].label}</StatusPill>}
                >
                  <span className="block">{planCell(t)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                    {t.usage.users} người dùng · {t.usage.contractsThisYear} HĐ trong năm · {formatStorage(t.usage.storageBytes)}
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Doanh nghiệp</Th>
                    <Th>Trạng thái</Th>
                    <Th>Gói hiện hành</Th>
                    <Th className="text-right">Người dùng</Th>
                    <Th className="text-right">HĐ trong năm</Th>
                    <Th className="text-right">Lưu trữ</Th>
                    <Th className="pr-4">Ngày tạo</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4">
                        <TitleCell
                          icon={Building2}
                          href={`/platform/tenants/${t.id}`}
                          title={t.name}
                          sub={
                            <>
                              {t.code}
                              {t.taxCode && ` · MST ${t.taxCode}`}
                            </>
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={TENANT_TONE[t.status]}>{TENANT_STATUS[t.status].label}</StatusPill>
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">{planCell(t)}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.usage.users}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.usage.contractsThisYear}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatStorage(t.usage.storageBytes)}</TableCell>
                      <TableCell className="pr-4 whitespace-nowrap tabular-nums">{formatDate(t.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={20} unit="doanh nghiệp" onPage={setPage} />
          </>
        )}
      </ListCard>
      {creating && plans.data && <CreateTenantSheet plans={plans.data.filter((p) => p.isActive)} onClose={() => setCreating(false)} />}
    </>
  );
}
