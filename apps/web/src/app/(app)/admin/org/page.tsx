'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, type LucideIcon, MapPin, Network, Pencil, Plus, Users, UserX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { ListCard, MobileCard, PersonCell, StatusPill, TitleCell, Th } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLookups } from '@/lib/queries';
import { cn } from '@/lib/utils';
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

const ActivePill = ({ active }: { active: boolean }) => (active ? <StatusPill tone="green">Hoạt động</StatusPill> : <StatusPill tone="gray">Ngừng</StatusPill>);

/** Tiêu đề khung danh sách: biểu tượng + tên + nút thêm bên phải. */
function SectionBar({ icon: Icon, title, count, action }: { icon: LucideIcon; title: string; count: number; action: React.ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2 px-1">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{count}</span>
      </span>
      {action}
    </>
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

  const editDept = (d: AdminDepartment) => setDept({ id: d.id, code: d.code, name: d.name, branchId: d.branchId ?? '', parentId: d.parentId ?? '', managerId: d.managerId ?? '', isActive: d.isActive });
  const editBranch = (b: AdminBranch) => setBranch({ id: b.id, code: b.code, name: b.name, address: b.address ?? '', isActive: b.isActive });
  const editBtn = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${label}`} onClick={onClick}>
      <Pencil />
    </Button>
  );
  const managerCell = (d: AdminDepartment) => (d.manager ? <PersonCell name={d.manager.fullName} sub="Trưởng phòng" /> : <StatusPill tone="red">Chưa có trưởng phòng</StatusPill>);

  return (
    <>
      <PageHeader title="Phòng ban, chi nhánh" description="Trưởng phòng là người duyệt ở bước “Trưởng phòng” của quy trình phê duyệt." crumbs={[{ label: 'Quản trị' }, { label: 'Phòng ban, chi nhánh' }]} />
      {error ? (
        <ErrorState error={error} />
      ) : !departments.data || !branches.data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Network} label="Phòng ban" value={departments.data.length} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" />
            <Stat icon={Building2} label="Chi nhánh" value={branches.data.length} tone="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300" />
            <Stat icon={Users} label="Nhân sự theo phòng ban" value={departments.data.reduce((s, d) => s + d._count.users, 0)} tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" />
            <Stat icon={UserX} label="Phòng ban chưa có trưởng phòng" value={departments.data.filter((d) => d.isActive && !d.managerId).length} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
          </div>
          <Tabs defaultValue="departments">
            <TabsList>
              <TabsTrigger value="departments">Phòng ban ({departments.data.length})</TabsTrigger>
              <TabsTrigger value="branches">Chi nhánh ({branches.data.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="departments" className="mt-4">
              <ListCard
                toolbar={
                  <SectionBar
                    icon={Network}
                    title="Phòng ban"
                    count={departments.data.length}
                    action={
                      <Button className="h-9" onClick={() => setDept({ code: '', name: '', branchId: '', parentId: '', managerId: '', isActive: true })}>
                        <Plus /> Thêm phòng ban
                      </Button>
                    }
                  />
                }
              >
                {departments.data.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="Chưa có phòng ban" />
                  </div>
                ) : (
                  <>
                    <ul className="divide-y md:hidden">
                      {departments.data.map((d) => (
                        <MobileCard
                          key={d.id}
                          title={d.name}
                          sub={d.code}
                          status={<ActivePill active={d.isActive} />}
                          actions={editBtn(d.name, () => editDept(d))}
                        >
                          <span className="block text-xs text-muted-foreground">
                            Trưởng phòng: {d.manager?.fullName ?? <span className="font-medium text-destructive">Chưa có</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {[d.parent ? `Thuộc ${d.parent.name}` : null, d.branch?.name, `${d._count.users} nhân sự`, `${d._count.contracts} hợp đồng`].filter(Boolean).join(' · ')}
                          </span>
                        </MobileCard>
                      ))}
                    </ul>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <Th className="pl-4">Phòng ban</Th>
                            <Th>Trưởng phòng</Th>
                            <Th>Thuộc</Th>
                            <Th>Chi nhánh</Th>
                            <Th className="text-right">Nhân sự</Th>
                            <Th className="text-right">Hợp đồng</Th>
                            <Th>Trạng thái</Th>
                            <Th />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {departments.data.map((d) => (
                            <TableRow key={d.id} className={d.isActive ? '' : 'opacity-60'}>
                              <TableCell className="pl-4">
                                <TitleCell icon={Network} title={d.name} sub={d.code} />
                              </TableCell>
                              <TableCell>{managerCell(d)}</TableCell>
                              <TableCell className="max-w-48 whitespace-normal">{d.parent?.name ?? '—'}</TableCell>
                              <TableCell className="max-w-48 whitespace-normal">{d.branch?.name ?? '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{d._count.users}</TableCell>
                              <TableCell className="text-right tabular-nums">{d._count.contracts}</TableCell>
                              <TableCell>
                                <ActivePill active={d.isActive} />
                              </TableCell>
                              <TableCell className="pr-4 text-right">{editBtn(d.name, () => editDept(d))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </ListCard>
            </TabsContent>
            <TabsContent value="branches" className="mt-4">
              <ListCard
                toolbar={
                  <SectionBar
                    icon={Building2}
                    title="Chi nhánh"
                    count={branches.data.length}
                    action={
                      <Button className="h-9" onClick={() => setBranch({ code: '', name: '', address: '', isActive: true })}>
                        <Plus /> Thêm chi nhánh
                      </Button>
                    }
                  />
                }
              >
                {branches.data.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="Chưa có chi nhánh" />
                  </div>
                ) : (
                  <>
                    <ul className="divide-y md:hidden">
                      {branches.data.map((b) => (
                        <MobileCard key={b.id} title={b.name} sub={b.code} status={<ActivePill active={b.isActive} />} actions={editBtn(b.name, () => editBranch(b))}>
                          {b.address && (
                            <span className="flex items-start gap-1 text-xs text-muted-foreground">
                              <MapPin className="mt-0.5 size-3.5 shrink-0" /> {b.address}
                            </span>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            {b._count.departments} phòng ban · {b._count.users} nhân sự
                          </span>
                        </MobileCard>
                      ))}
                    </ul>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <Th className="pl-4">Chi nhánh</Th>
                            <Th>Địa chỉ</Th>
                            <Th className="text-right">Phòng ban</Th>
                            <Th className="text-right">Nhân sự</Th>
                            <Th>Trạng thái</Th>
                            <Th />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branches.data.map((b) => (
                            <TableRow key={b.id} className={b.isActive ? '' : 'opacity-60'}>
                              <TableCell className="pl-4">
                                <TitleCell icon={Building2} title={b.name} sub={b.code} />
                              </TableCell>
                              <TableCell className="max-w-80 min-w-48 whitespace-normal text-sm">{b.address ?? '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{b._count.departments}</TableCell>
                              <TableCell className="text-right tabular-nums">{b._count.users}</TableCell>
                              <TableCell>
                                <ActivePill active={b.isActive} />
                              </TableCell>
                              <TableCell className="pr-4 text-right">{editBtn(b.name, () => editBranch(b))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </ListCard>
            </TabsContent>
          </Tabs>
        </div>
      )}
      {dept && departments.data && branches.data && <DeptDialog draft={dept} departments={departments.data} branches={branches.data} onClose={() => setDept(null)} />}
      {branch && <BranchDialog draft={branch} onClose={() => setBranch(null)} />}
    </>
  );
}
