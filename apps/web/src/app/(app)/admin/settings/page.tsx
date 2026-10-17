'use client';

import { renderCode, validateCodePattern } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminContractType } from '@/lib/types';

interface Draft {
  id?: string;
  code: string;
  name: string;
  codePattern: string;
  isActive: boolean;
}

const TOKENS = ['{TYPE}', '{DEPT}', '{BRANCH}', '{YYYY}', '{YY}', '{MM}', '{SEQUENCE:4}'];

function TypeDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const patternError = validateCodePattern(d.codePattern);
  // Xem trước với ngày hiện tại, phòng ban KD, chi nhánh HN, số thứ tự 1.
  const example = patternError ? null : renderCode(d.codePattern, { date: new Date(), typeCode: d.code.toUpperCase() || 'HD', departmentCode: 'KD', branchCode: 'HN' }, 1);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const body = { name: d.name, codePattern: d.codePattern, isActive: d.isActive };
      return d.id ? api(`/contract-types/${d.id}`, { method: 'PATCH', body }) : api('/contract-types', { method: 'POST', body: { ...body, code: d.code } });
    },
    onSuccess: () => {
      toast.success('Đã lưu loại hợp đồng');
      qc.invalidateQueries({ queryKey: ['admin-contract-types'] });
      qc.invalidateQueries({ queryKey: ['contract-lookups'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? (e.status === 409 ? 'Mã loại đã tồn tại' : e.errors.map((x) => x.message).join('; ') || e.message) : 'Lưu thất bại'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{d.id ? `Sửa loại ${draft.name}` : 'Thêm loại hợp đồng'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="t-code">Mã loại *</Label>
            <Input id="t-code" disabled={!!d.id} value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Tên loại *</Label>
            <Input id="t-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-pattern">Mẫu mã hợp đồng *</Label>
          <Input id="t-pattern" className="font-mono" value={d.codePattern} onChange={(e) => set({ codePattern: e.target.value })} aria-invalid={!!patternError} />
          <div className="flex flex-wrap gap-1">
            {TOKENS.map((t) => (
              <Button key={t} type="button" variant="outline" size="xs" onClick={() => set({ codePattern: d.codePattern + t })}>
                {t}
              </Button>
            ))}
          </div>
          {patternError ? (
            <p className="text-xs text-destructive">{patternError}</p>
          ) : (
            <p className="text-sm">
              Ví dụ: <code className="font-semibold">{example}</code>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Số thứ tự tự đếm lại khi phần tiền tố thay đổi (ví dụ có {'{YYYY}'} thì mỗi năm đếm lại từ 1). Đổi mẫu chỉ áp dụng cho hợp đồng tạo sau.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={d.isActive} onCheckedChange={(v) => set({ isActive: !!v })} /> Đang sử dụng
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} disabled={!!patternError || !d.code || !d.name || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSettingsPage() {
  const { can } = useAuth();
  const allowed = can('settings.manage');
  const types = useQuery({ queryKey: ['admin-contract-types'], queryFn: () => api<AdminContractType[]>('/contract-types'), enabled: allowed });
  const [editing, setEditing] = useState<Draft | null>(null);

  if (!allowed) return <p className="text-sm text-muted-foreground">Bạn không có quyền quản lý cấu hình.</p>;

  return (
    <>
      <PageHeader title="Cấu hình" crumbs={[{ label: 'Quản trị' }, { label: 'Cấu hình' }]} />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Loại hợp đồng & mẫu mã</CardTitle>
            <CardDescription>Mã hợp đồng tự sinh theo mẫu của từng loại; hợp đồng không chọn loại dùng mẫu HD-{'{YYYY}'}-{'{SEQUENCE:5}'}.</CardDescription>
          </div>
          <Button onClick={() => setEditing({ code: '', name: '', codePattern: '{TYPE}-{YYYY}-{SEQUENCE:4}', isActive: true })}>
            <Plus /> Thêm loại
          </Button>
        </CardHeader>
        <CardContent>
          {types.isError ? (
            <ErrorState error={types.error} onRetry={() => types.refetch()} />
          ) : !types.data ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Tên loại</TableHead>
                    <TableHead>Mẫu mã</TableHead>
                    <TableHead>Ví dụ</TableHead>
                    <TableHead className="text-right">Hợp đồng</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.data.map((t) => (
                    <TableRow key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                      <TableCell className="font-medium">{t.code}</TableCell>
                      <TableCell>
                        {t.name} {!t.isActive && <Badge variant="outline">Ngừng</Badge>}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{t.codePattern}</code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{t.example}</code>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t._count.contracts}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${t.name}`} onClick={() => setEditing({ id: t.id, code: t.code, name: t.name, codePattern: t.codePattern, isActive: t.isActive })}>
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {editing && <TypeDialog draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
