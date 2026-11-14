'use client';

import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, KeyRound, Loader2, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { AdminBranch, AdminDepartment, AdminRole, AdminUser, UserStatus } from '@/lib/types';

const STATUS: Record<UserStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  ACTIVE: { label: 'Hoạt động', variant: 'default' },
  INVITED: { label: 'Đã mời', variant: 'secondary' },
  LOCKED: { label: 'Tạm khóa', variant: 'destructive' },
  DISABLED: { label: 'Vô hiệu', variant: 'outline' },
};

interface Draft {
  id?: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  jobTitle: string;
  departmentId: string;
  branchId: string;
  roleIds: string[];
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
}

const toDraft = (u?: AdminUser): Draft => ({
  id: u?.id,
  email: u?.email ?? '',
  password: '',
  fullName: u?.fullName ?? '',
  phone: u?.phone ?? '',
  jobTitle: u?.jobTitle ?? '',
  departmentId: u?.departmentId ?? '',
  branchId: u?.branchId ?? '',
  roleIds: u?.roles.map((r) => r.id) ?? [],
  status: u?.status === 'LOCKED' || u?.status === 'DISABLED' ? u.status : 'ACTIVE',
});

function UserSheet({
  draft: initial,
  roles,
  departments,
  branches,
  isSelf,
  onClose,
}: {
  draft: Draft;
  roles: AdminRole[];
  departments: AdminDepartment[];
  branches: AdminBranch[];
  isSelf: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const isNew = !d.id;

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const common = { fullName: d.fullName, phone: d.phone, jobTitle: d.jobTitle, departmentId: d.departmentId, branchId: d.branchId };
      if (isNew) return api('/users', { method: 'POST', body: { ...common, email: d.email, password: d.password, roleIds: d.roleIds, status: d.status } });
      return api(`/users/${d.id}`, { method: 'PATCH', body: isSelf ? common : { ...common, roleIds: d.roleIds, status: d.status } });
    },
    onSuccess: () => {
      toast.success(isNew ? 'Đã tạo người dùng' : 'Đã cập nhật người dùng');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    },
    onError: (err) =>
      setErrors(err instanceof ApiError && err.errors.length ? err.errors.map((e) => e.message) : [err instanceof ApiError && err.status === 409 ? 'Email đã tồn tại' : err instanceof Error ? err.message : 'Lưu thất bại']),
  });

  const submit = () => {
    if (isNew && !isStrongPassword(d.password)) return setErrors([PASSWORD_RULE_MESSAGE]);
    if (!d.roleIds.length) return setErrors(['Chọn ít nhất một vai trò']);
    setErrors([]);
    save.mutate();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isNew ? 'Thêm người dùng' : `Sửa ${initial.fullName}`}</SheetTitle>
          {isSelf && <SheetDescription>Bạn không thể tự đổi vai trò hoặc trạng thái tài khoản của mình.</SheetDescription>}
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email đăng nhập *</Label>
            <Input id="u-email" type="email" disabled={!isNew} value={d.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          {isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="u-pw">Mật khẩu ban đầu *</Label>
              <Input id="u-pw" type="password" autoComplete="new-password" value={d.password} onChange={(e) => set({ password: e.target.value })} />
              <p className="text-xs text-muted-foreground">{PASSWORD_RULE_MESSAGE}. Gửi mật khẩu cho người dùng qua kênh riêng và đề nghị họ đổi sau khi đăng nhập.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Họ tên *</Label>
            <Input id="u-name" value={d.fullName} onChange={(e) => set({ fullName: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-title">Chức danh</Label>
              <Input id="u-title" value={d.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-phone">Điện thoại</Label>
              <Input id="u-phone" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Phòng ban</Label>
              <FilterSelect className="w-full" allLabel="— Không —" value={d.departmentId || undefined} onChange={(v) => set({ departmentId: v ?? '' })} options={departments.filter((x) => x.isActive).map((x) => ({ value: x.id, label: x.name }))} ariaLabel="Phòng ban" />
            </div>
            <div className="space-y-1.5">
              <Label>Chi nhánh</Label>
              <FilterSelect className="w-full" allLabel="— Không —" value={d.branchId || undefined} onChange={(v) => set({ branchId: v ?? '' })} options={branches.filter((x) => x.isActive).map((x) => ({ value: x.id, label: x.name }))} ariaLabel="Chi nhánh" />
            </div>
          </div>
          <fieldset className="space-y-1.5" disabled={isSelf}>
            <legend className="text-sm font-medium">Vai trò *</legend>
            <div className="grid gap-1 rounded-md border p-2 sm:grid-cols-2">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <Checkbox disabled={isSelf} checked={d.roleIds.includes(r.id)} onCheckedChange={(v) => set({ roleIds: v ? [...d.roleIds, r.id] : d.roleIds.filter((x) => x !== r.id) })} />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label>Trạng thái</Label>
            <Select value={d.status} onValueChange={(v) => set({ status: v as Draft['status'] })} disabled={isSelf}>
              <SelectTrigger className="w-full" aria-label="Trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Hoạt động</SelectItem>
                <SelectItem value="LOCKED">Tạm khóa</SelectItem>
                <SelectItem value="DISABLED">Vô hiệu (nghỉ việc)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Khóa hoặc vô hiệu sẽ đăng xuất người dùng khỏi mọi thiết bị.</p>
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
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation({
    meta: { silent: true },
    mutationFn: () => api<undefined>(`/users/${user!.id}/reset-password`, { method: 'POST', body: { password: pw } }),
    onSuccess: () => {
      toast.success('Đã đặt lại mật khẩu');
      setPw('');
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Thất bại'),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu cho {user?.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reset-pw">Mật khẩu mới</Label>
          <Input id="reset-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <p className="text-xs text-muted-foreground">{PASSWORD_RULE_MESSAGE}. Người dùng bị đăng xuất khỏi mọi thiết bị.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={reset.isPending}
            onClick={() => {
              if (!isStrongPassword(pw)) return setError(PASSWORD_RULE_MESSAGE);
              setError(null);
              reset.mutate();
            }}
          >
            Đặt lại
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersPage() {
  const { can, user: me } = useAuth();
  const manage = can('user.manage');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [roleId, setRoleId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['admin-users', { q, departmentId, roleId, status, page }],
    queryFn: () => api<Paginated<AdminUser>>('/users', { query: { q, departmentId, roleId, status, page, pageSize: 30 } }),
    placeholderData: keepPreviousData,
    enabled: can('user.view'),
  });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<AdminRole[]>('/roles'), enabled: can('user.view') });
  const departments = useQuery({ queryKey: ['admin-departments'], queryFn: () => api<AdminDepartment[]>('/departments'), enabled: can('user.view') });
  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: () => api<AdminBranch[]>('/branches'), enabled: can('user.view') });
  const ready = roles.data && departments.data && branches.data;

  if (!can('user.view')) return <p className="text-sm text-muted-foreground">Bạn không có quyền xem người dùng.</p>;

  return (
    <>
      <PageHeader
        title="Người dùng"
        crumbs={[{ label: 'Quản trị' }, { label: 'Người dùng' }]}
        actions={
          manage && (
            <Button onClick={() => setEditing(toDraft())} disabled={!ready}>
              <Plus /> Thêm người dùng
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Tìm tên, email, chức danh…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm người dùng" />
        <FilterSelect allLabel="Mọi phòng ban" value={departmentId} onChange={(v) => { setDepartmentId(v); setPage(1); }} options={(departments.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        <FilterSelect allLabel="Mọi vai trò" value={roleId} onChange={(v) => { setRoleId(v); setPage(1); }} options={(roles.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(Object.keys(STATUS) as UserStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))} />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phòng ban</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Đăng nhập gần nhất</TableHead>
                <TableHead />
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
                    <EmptyState title="Không có người dùng phù hợp" />
                  </TableCell>
                </TableRow>
              ) : (
                list.data.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">{u.fullName}</p>
                      {u.jobTitle && <p className="text-xs text-muted-foreground">{u.jobTitle}</p>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.department?.name ?? '—'}</TableCell>
                    <TableCell className="text-sm">{u.roles.map((r) => r.name).join(', ')}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS[u.status].variant}>{STATUS[u.status].label}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(u.lastLoginAt)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {manage && (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${u.fullName}`} disabled={!ready} onClick={() => setEditing(toDraft(u))}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Đặt lại mật khẩu ${u.fullName}`} onClick={() => setResetting(u)}>
                            <KeyRound />
                          </Button>
                        </>
                      )}
                    </TableCell>
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
      {editing && ready && (
        <UserSheet draft={editing} roles={roles.data} departments={departments.data} branches={branches.data} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />
      )}
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}
