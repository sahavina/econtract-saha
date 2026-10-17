'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

/** Nhóm quyền theo phân hệ để hiển thị ma trận. */
const GROUPS: { label: string; prefixes: string[] }[] = [
  { label: 'Tổng quan', prefixes: ['dashboard.'] },
  { label: 'Hợp đồng', prefixes: ['contract.'] },
  { label: 'Đối tác', prefixes: ['partner.'] },
  { label: 'Mẫu & điều khoản', prefixes: ['template.', 'clause.'] },
  { label: 'Quản trị', prefixes: ['user.', 'role.', 'org.', 'settings.', 'workflow.', 'audit.'] },
];

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

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {role.name} {role.locked && <Lock className="size-4 text-muted-foreground" />}
          </CardTitle>
          <CardDescription>
            Mã {role.code} · {role._count.users} người dùng {role.isSystem && '· vai trò hệ thống'}
          </CardDescription>
        </div>
        <div className="flex gap-2">
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
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Lưu
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
        {role.locked && <p className="rounded-md bg-muted px-3 py-2 text-sm">Vai trò Quản trị doanh nghiệp luôn có toàn bộ quyền (kể cả quyền bổ sung sau này) để tránh khóa hệ thống.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {GROUPS.map((g) => {
            const items = catalog.filter((p) => g.prefixes.some((x) => p.key.startsWith(x)));
            return (
              <fieldset key={g.label} className="rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">{g.label}</legend>
                <div className="space-y-1.5">
                  {items.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        disabled={role.locked}
                        checked={role.locked || perms.includes(p.key)}
                        onCheckedChange={(v) => setPerms((l) => (v ? [...l, p.key] : l.filter((x) => x !== p.key)))}
                      />
                      {p.label}
                      <code className="ml-auto text-xs text-muted-foreground">{p.key}</code>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </CardContent>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Card>
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
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Danh sách vai trò" className="space-y-1">
            {roles.data.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted', current?.id === r.id && 'bg-muted font-medium')}
              >
                <span>{r.name}</span>
                <Badge variant="outline">{r.locked ? 'Toàn quyền' : `${r.permissions.length} quyền`}</Badge>
              </button>
            ))}
          </nav>
          {current && <RoleEditor key={`${current.id}-${current.permissions.join()}`} role={current} catalog={catalog.data} />}
        </div>
      )}
      <CreateRoleDialog open={creating} onClose={() => setCreating(false)} onCreated={setSelected} />
    </>
  );
}
