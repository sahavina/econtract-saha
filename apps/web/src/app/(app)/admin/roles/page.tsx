'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FileText, KeyRound, LayoutDashboard, Loader2, Lock, type LucideIcon, Plus, Save, Settings2, ShieldCheck, ShoppingCart, Trash2, UserCog, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { StatusPill } from '@/components/list-ui';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { AdminRole } from '@/lib/types';

/** Nhóm quyền theo phân hệ để hiển thị ma trận; quyền không thuộc nhóm nào hiện ở nhóm "Khác". */
const GROUPS: { label: string; icon: LucideIcon; prefixes: string[] }[] = [
  { label: 'Tổng quan & báo cáo', icon: LayoutDashboard, prefixes: ['dashboard.', 'report.'] },
  { label: 'Hợp đồng', icon: FileText, prefixes: ['contract.'] },
  { label: 'Đối tác', icon: Users, prefixes: ['partner.'] },
  { label: 'Bán hàng & giao nhận', icon: ShoppingCart, prefixes: ['quote.', 'product.', 'delivery.', 'payment_request.', 'inspection.'] },
  { label: 'Mẫu & điều khoản', icon: BookOpen, prefixes: ['template.', 'clause.'] },
  { label: 'Quản trị', icon: Settings2, prefixes: ['user.', 'role.', 'org.', 'settings.', 'workflow.', 'audit.'] },
];

function groupCatalog(catalog: { key: string; label: string }[]) {
  const groups = GROUPS.map((g) => ({ ...g, items: catalog.filter((p) => g.prefixes.some((x) => p.key.startsWith(x))) }));
  const rest = catalog.filter((p) => !GROUPS.some((g) => g.prefixes.some((x) => p.key.startsWith(x))));
  if (rest.length) groups.push({ label: 'Khác', icon: KeyRound, prefixes: [], items: rest });
  return groups.filter((g) => g.items.length);
}

/** Thẻ số liệu tĩnh: biểu tượng trong ô màu, số lớn, nhãn nhỏ. */
function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] sm:gap-4 sm:p-4">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-5 sm:size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className="block text-2xl leading-tight font-bold tabular-nums sm:text-[1.75rem]">{value}</span>
      </span>
    </div>
  );
}

function RoleEditor({ role, catalog }: { role: AdminRole; catalog: { key: string; label: string }[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [perms, setPerms] = useState<string[]>(role.permissions);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const dirty = name !== role.name || description !== (role.description ?? '') || [...perms].sort().join() !== [...role.permissions].sort().join();

  const save = useMutation({
    mutationFn: () => api(`/roles/${role.id}`, { method: 'PATCH', body: role.locked ? { name, description } : { name, description, permissions: perms } }),
    onSuccess: () => {
      toast.success('Đã lưu vai trò. Quyền mới có hiệu lực ngay ở lần thao tác tiếp theo của người dùng.');
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api<undefined>(`/roles/${role.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xóa vai trò');
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
    },
  });

  const groups = groupCatalog(catalog);
  const granted = role.locked ? catalog.length : catalog.filter((p) => perms.includes(p.key)).length;

  return (
    <section className="min-w-0 rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05),0_1px_2px_-1px_rgb(15_23_42/0.04)]">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {role.locked ? <Lock className="size-5" /> : <ShieldCheck className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
            <span className="min-w-0 break-words">{role.name}</span>
            {role.isSystem && <StatusPill tone="indigo">Hệ thống</StatusPill>}
            {role.locked && <StatusPill tone="violet">Toàn quyền</StatusPill>}
          </h2>
          <p className="text-xs text-muted-foreground">
            Mã <code>{role.code}</code> · {role._count.users} người dùng · {granted}/{catalog.length} quyền
          </p>
        </div>
        {!role.isSystem && (
          <Button
            variant="outline"
            size="sm"
            disabled={role._count.users > 0}
            title={role._count.users > 0 ? 'Gỡ vai trò khỏi người dùng trước khi xóa' : undefined}
            onClick={() => setConfirm({ title: `Xóa vai trò ${role.name}?`, destructive: true, confirmLabel: 'Xóa', onConfirm: () => remove.mutateAsync().then(() => undefined) })}
          >
            <Trash2 /> Xóa
          </Button>
        )}
      </header>
      <div className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Tên vai trò</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-desc">Mô tả</Label>
            <Input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        {role.locked && (
          <p className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
            <Lock className="mt-0.5 size-4 shrink-0" />
            Vai trò Quản trị doanh nghiệp luôn có toàn bộ quyền (kể cả quyền bổ sung sau này) để tránh khóa hệ thống.
          </p>
        )}
        <div>
          <h3 className="mb-3 text-sm font-semibold">Ma trận phân quyền</h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((g) => {
              const on = g.items.filter((p) => role.locked || perms.includes(p.key)).length;
              return (
                <fieldset key={g.label} className="min-w-0 overflow-hidden rounded-lg border">
                  <legend className="sr-only">{g.label}</legend>
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                    <g.icon className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="flex-1 text-sm font-medium">{g.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                      {on}/{g.items.length}
                    </span>
                  </div>
                  <div className="divide-y">
                    {g.items.map((p) => (
                      <label key={p.key} className={cn('flex items-start gap-2.5 px-3 py-2 text-sm', !role.locked && 'cursor-pointer hover:bg-muted/40')}>
                        <Checkbox
                          className="mt-0.5"
                          disabled={role.locked}
                          checked={role.locked || perms.includes(p.key)}
                          onCheckedChange={(v) => setPerms((l) => (v ? [...l, p.key] : l.filter((x) => x !== p.key)))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block leading-snug">{p.label}</span>
                          <code className="block truncate text-xs text-muted-foreground">{p.key}</code>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t bg-card/95 px-5 py-3 backdrop-blur">
        <span className={cn('mr-auto text-sm', dirty ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{dirty ? 'Có thay đổi chưa lưu' : 'Không có thay đổi'}</span>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Lưu
        </Button>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

function CreateRoleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    meta: { silent: true },
    mutationFn: () => api<{ id: string }>('/roles', { method: 'POST', body: { code, name, description, permissions: ['dashboard.view'] } }),
    onSuccess: (r) => {
      toast.success('Đã tạo vai trò – hãy chọn quyền cho vai trò');
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      onCreated(r.id);
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? (e.status === 409 ? 'Mã vai trò đã tồn tại' : e.errors.map((x) => x.message).join('; ') || e.message) : 'Tạo thất bại'),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm vai trò</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="nr-code">Mã vai trò *</Label>
          <Input id="nr-code" placeholder="vd: sales_lead" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nr-name">Tên vai trò *</Label>
          <Input id="nr-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nr-desc">Mô tả</Label>
          <Textarea id="nr-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={!code || !name || create.isPending} onClick={() => create.mutate()}>
            Tạo vai trò
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRolesPage() {
  const { can } = useAuth();
  const allowed = can('role.manage');
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<AdminRole[]>('/roles'), enabled: allowed });
  const catalog = useQuery({ queryKey: ['permission-catalog'], queryFn: () => api<{ key: string; label: string }[]>('/roles/permissions'), enabled: allowed, staleTime: Infinity });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!allowed) return <p className="text-sm text-muted-foreground">Bạn không có quyền quản lý vai trò.</p>;
  const current = roles.data?.find((r) => r.id === selected) ?? roles.data?.[0];

  return (
    <>
      <PageHeader
        title="Vai trò và phân quyền"
        description="Quyền thay đổi có hiệu lực ngay với người dùng đang đăng nhập."
        crumbs={[{ label: 'Quản trị' }, { label: 'Vai trò và phân quyền' }]}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Thêm vai trò
          </Button>
        }
      />
      {roles.isError ? (
        <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
      ) : !roles.data || !catalog.data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={ShieldCheck} label="Tổng vai trò" value={roles.data.length} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" />
            <Stat icon={Lock} label="Vai trò hệ thống" value={roles.data.filter((r) => r.isSystem).length} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
            <Stat icon={UserCog} label="Vai trò tự tạo" value={roles.data.filter((r) => !r.isSystem).length} tone="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300" />
            <Stat icon={KeyRound} label="Quyền trong hệ thống" value={catalog.data.length} tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <nav aria-label="Danh sách vai trò" className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] lg:sticky lg:top-4">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                <span className="flex-1 text-sm font-semibold">Vai trò</span>
                <span className="text-xs text-muted-foreground tabular-nums">{roles.data.length}</span>
              </div>
              <ul className="max-h-[60vh] divide-y overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
                {roles.data.map((r) => {
                  const active = current?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn('flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-muted/50', active ? 'border-l-primary bg-primary/5' : 'border-l-transparent')}
                      >
                        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
                          {r.locked ? <Lock className="size-4" /> : <ShieldCheck className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className={cn('block text-sm leading-snug break-words', active ? 'font-semibold text-primary' : 'font-medium')}>{r.name}</span>
                          {r.description && <span className="line-clamp-2 block text-xs text-muted-foreground">{r.description}</span>}
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1" title="Số người dùng">
                              <Users className="size-3.5" /> {r._count.users}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <KeyRound className="size-3.5" /> {r.locked ? 'Toàn quyền' : `${r.permissions.length} quyền`}
                            </span>
                            {r.isSystem && (
                              <StatusPill tone="indigo" className="px-2 py-0 text-[11px]">
                                Hệ thống
                              </StatusPill>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {current && <RoleEditor key={`${current.id}-${current.permissions.join()}`} role={current} catalog={catalog.data} />}
          </div>
        </div>
      )}
      <CreateRoleDialog open={creating} onClose={() => setCreating(false)} onCreated={setSelected} />
    </>
  );
}
