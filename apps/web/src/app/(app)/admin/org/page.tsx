'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLookups } from '@/lib/queries';
import type { AdminBranch, AdminDepartment } from '@/lib/types';

interface DeptDraft {
  id?: string;
  code: string;
  name: string;
  branchId: string;
  parentId: string;
  managerId: string;
  isActive: boolean;
}
interface BranchDraft {
  id?: string;
  code: string;
  name: string;
  address: string;
  isActive: boolean;
}

const errMsg = (err: unknown) =>
  err instanceof ApiError ? (err.status === 409 ? 'Mã đã tồn tại' : err.errors.map((e) => e.message).join('; ') || err.message) : 'Lưu thất bại';

function DeptDialog({ draft, departments, branches, onClose }: { draft: DeptDraft; departments: AdminDepartment[]; branches: AdminBranch[]; onClose: () => void }) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<DeptDraft>) => setD((x) => ({ ...x, ...p }));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const body = { name: d.name, branchId: d.branchId, parentId: d.parentId, managerId: d.managerId, isActive: d.isActive };
      return d.id ? api(`/departments/${d.id}`, { method: 'PATCH', body }) : api('/departments', { method: 'POST', body: { ...body, code: d.code } });
    },
    onSuccess: () => {
      toast.success('Đã lưu phòng ban');
      qc.invalidateQueries({ queryKey: ['admin-departments'] });
      qc.invalidateQueries({ queryKey: ['contract-lookups'] });
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.id ? `Sửa phòng ban ${draft.name}` : 'Thêm phòng ban'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="d-code">Mã *</Label>
            <Input id="d-code" disabled={!!d.id} value={d.code} onChange={(e) => set({ code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-name">Tên phòng ban *</Label>
            <Input id="d-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Trưởng phòng (người duyệt bước &ldquo;Trưởng phòng&rdquo;)</Label>
          <FilterSelect className="w-full" allLabel="— Chưa có —" value={d.managerId || undefined} onChange={(v) => set({ managerId: v ?? '' })} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} ariaLabel="Trưởng phòng" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Chi nhánh</Label>
            <FilterSelect className="w-full" allLabel="— Không —" value={d.branchId || undefined} onChange={(v) => set({ branchId: v ?? '' })} options={branches.map((b) => ({ value: b.id, label: b.name }))} ariaLabel="Chi nhánh" />
          </div>
          <div className="space-y-1.5">
            <Label>Thuộc phòng ban</Label>
            <FilterSelect className="w-full" allLabel="— Cấp cao nhất —" value={d.parentId || undefined} onChange={(v) => set({ parentId: v ?? '' })} options={departments.filter((x) => x.id !== d.id).map((x) => ({ value: x.id, label: x.name }))} ariaLabel="Phòng ban cha" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={d.isActive} onCheckedChange={(v) => set({ isActive: !!v })} /> Đang hoạt động
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchDialog({ draft, onClose }: { draft: BranchDraft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<BranchDraft>) => setD((x) => ({ ...x, ...p }));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const body = { name: d.name, address: d.address, isActive: d.isActive };
      return d.id ? api(`/branches/${d.id}`, { method: 'PATCH', body }) : api('/branches', { method: 'POST', body: { ...body, code: d.code } });
    },
    onSuccess: () => {
      toast.success('Đã lưu chi nhánh');
      qc.invalidateQueries({ queryKey: ['admin-branches'] });
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.id ? `Sửa chi nhánh ${draft.name}` : 'Thêm chi nhánh'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="b-code">Mã *</Label>
            <Input id="b-code" disabled={!!d.id} value={d.code} onChange={(e) => set({ code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-name">Tên chi nhánh *</Label>
            <Input id="b-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-addr">Địa chỉ</Label>
          <Input id="b-addr" value={d.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={d.isActive} onCheckedChange={(v) => set({ isActive: !!v })} /> Đang hoạt động
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminOrgPage() {
  const { can } = useAuth();
  const allowed = can('org.manage');
  const departments = useQuery({ queryKey: ['admin-departments'], queryFn: () => api<AdminDepartment[]>('/departments'), enabled: allowed });
  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: () => api<AdminBranch[]>('/branches'), enabled: allowed });
  const [dept, setDept] = useState<DeptDraft | null>(null);
  const [branch, setBranch] = useState<BranchDraft | null>(null);

  if (!allowed) return <p className="text-sm text-muted-foreground">Bạn không có quyền quản lý cơ cấu tổ chức.</p>;
  const error = departments.error ?? branches.error;

  return (
    <>
      <PageHeader title="Phòng ban, chi nhánh" crumbs={[{ label: 'Quản trị' }, { label: 'Phòng ban, chi nhánh' }]} />
      {error ? (
        <ErrorState error={error} />
      ) : !departments.data || !branches.data ? (
        <Skeleton className="h-64" />
      ) : (
        <Tabs defaultValue="departments">
          <TabsList>
            <TabsTrigger value="departments">Phòng ban ({departments.data.length})</TabsTrigger>
            <TabsTrigger value="branches">Chi nhánh ({branches.data.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="departments" className="mt-4 space-y-3">
            <Button onClick={() => setDept({ code: '', name: '', branchId: '', parentId: '', managerId: '', isActive: true })}>
              <Plus /> Thêm phòng ban
            </Button>
            <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Tên phòng ban</TableHead>
                    <TableHead>Trưởng phòng</TableHead>
                    <TableHead>Thuộc</TableHead>
                    <TableHead>Chi nhánh</TableHead>
                    <TableHead className="text-right">Nhân sự</TableHead>
                    <TableHead className="text-right">Hợp đồng</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.data.length === 0 ? (
                    <TableRow><TableCell colSpan={8}><EmptyState title="Chưa có phòng ban" /></TableCell></TableRow>
                  ) : (
                    departments.data.map((d) => (
                      <TableRow key={d.id} className={d.isActive ? '' : 'opacity-50'}>
                        <TableCell className="font-medium">{d.code}</TableCell>
                        <TableCell>
                          {d.name} {!d.isActive && <Badge variant="outline">Ngừng</Badge>}
                        </TableCell>
                        <TableCell>{d.manager?.fullName ?? <span className="text-destructive">Chưa có</span>}</TableCell>
                        <TableCell>{d.parent?.name ?? '—'}</TableCell>
                        <TableCell>{d.branch?.name ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{d._count.users}</TableCell>
                        <TableCell className="text-right tabular-nums">{d._count.contracts}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Sửa ${d.name}`}
                            onClick={() => setDept({ id: d.id, code: d.code, name: d.name, branchId: d.branchId ?? '', parentId: d.parentId ?? '', managerId: d.managerId ?? '', isActive: d.isActive })}
                          >
                            <Pencil />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="branches" className="mt-4 space-y-3">
            <Button onClick={() => setBranch({ code: '', name: '', address: '', isActive: true })}>
              <Plus /> Thêm chi nhánh
            </Button>
            <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Tên chi nhánh</TableHead>
                    <TableHead>Địa chỉ</TableHead>
                    <TableHead className="text-right">Phòng ban</TableHead>
                    <TableHead className="text-right">Nhân sự</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.data.map((b) => (
                    <TableRow key={b.id} className={b.isActive ? '' : 'opacity-50'}>
                      <TableCell className="font-medium">{b.code}</TableCell>
                      <TableCell>{b.name}</TableCell>
                      <TableCell>{b.address ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{b._count.departments}</TableCell>
                      <TableCell className="text-right tabular-nums">{b._count.users}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${b.name}`} onClick={() => setBranch({ id: b.id, code: b.code, name: b.name, address: b.address ?? '', isActive: b.isActive })}>
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
      {dept && departments.data && branches.data && <DeptDialog draft={dept} departments={departments.data} branches={branches.data} onClose={() => setDept(null)} />}
      {branch && <BranchDialog draft={branch} onClose={() => setBranch(null)} />}
    </>
  );
}
