'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TEMPLATE_STATUS_LABELS } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { TemplateStatusBadge } from '@/components/status-badge';
import { TemplatePreviewDialog } from '@/components/template-preview-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ContractKind, TemplateListItem, TemplateStatus } from '@/lib/types';

/** Nhãn theo loại danh sách: mẫu hợp đồng hoặc mẫu đơn đặt hàng (mẫu gắn loại "Đơn đặt hàng"). */
const KIND_TEXT = {
  CONTRACT: {
    title: 'Mẫu hợp đồng',
    noun: 'mẫu hợp đồng',
    description: 'Mẫu dùng biến dữ liệu {{…}} để tự điền khi lập hợp đồng. Chỉ mẫu Đang sử dụng mới được chọn khi tạo hợp đồng.',
    crumbs: [{ label: 'Soạn thảo' }, { label: 'Mẫu hợp đồng' }],
    typeFilter: 'Mọi loại HĐ',
    typeColumn: 'Loại hợp đồng',
    placeholder: 'VD: MAU-HDDV-01',
  },
  ORDER: {
    title: 'Mẫu đơn đặt hàng',
    noun: 'mẫu đơn đặt hàng',
    description: 'Mẫu đơn dùng biến dữ liệu {{…}} (bảng hàng hóa, tổng tiền, các bên…) để tự điền khi lập đơn đặt hàng. Chỉ mẫu Đang sử dụng mới được chọn khi tạo đơn.',
    crumbs: [{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Mẫu đơn đặt hàng' }],
    typeFilter: 'Mọi loại đơn',
    typeColumn: 'Loại đơn',
    placeholder: 'VD: MAU-DDH-02',
  },
} as const;

/** Lời nhắc khi xóa mẫu: hồ sơ đã lập giữ nguyên nội dung (đã sao chép lúc lập). */
export function templateDeleteNote(used: number) {
  return used
    ? `Mẫu đã dùng cho ${used} hợp đồng/đơn hàng – các hồ sơ này giữ nguyên nội dung. Mẫu sẽ không còn được chọn khi lập mới.`
    : 'Mẫu sẽ không còn được chọn khi lập hợp đồng/đơn hàng mới.';
}

const createSchema = z.object({
  code: z.string().trim().min(1, 'Nhập mã mẫu').max(50),
  name: z.string().trim().min(1, 'Nhập tên mẫu').max(255),
});

function CreateTemplateDialog({ open, onClose, kind, contractTypeId }: { open: boolean; onClose: () => void; kind: ContractKind; contractTypeId?: string }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema), defaultValues: { code: '', name: '' } });
  const create = useMutation({
    meta: { silent: true },
    // Mẫu đơn đặt hàng: gắn sẵn loại "Đơn đặt hàng" để nằm trong danh sách mẫu đơn và chọn được khi lập đơn.
    mutationFn: (v: z.infer<typeof createSchema>) => api<{ id: string }>('/templates', { method: 'POST', body: { ...v, ...(contractTypeId && { contractTypeId }) } }),
    onSuccess: (t) => {
      toast.success('Đã tạo mẫu nháp');
      router.push(`/templates/${t.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) form.setError('code', { message: 'Mã mẫu đã tồn tại' });
      else toast.error(err instanceof Error ? err.message : 'Tạo mẫu thất bại');
    },
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo {KIND_TEXT[kind].noun}</DialogTitle>
        </DialogHeader>
        <form id="tpl-create" onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-code">Mã mẫu *</Label>
            <Input id="tpl-code" placeholder={KIND_TEXT[kind].placeholder} aria-invalid={!!errors.code} {...form.register('code')} />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Tên mẫu *</Label>
            <Input id="tpl-name" aria-invalid={!!errors.name} {...form.register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="tpl-create" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Tạo và soạn nội dung
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Danh sách mẫu (Soạn thảo → Mẫu hợp đồng, Đơn đặt hàng → Mẫu đơn đặt hàng). */
export function TemplateList({ kind }: { kind: ContractKind }) {
  const text = KIND_TEXT[kind];
  const { can } = useAuth();
  const qc = useQueryClient();
  const lookups = useLookups();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [contractTypeId, setContractTypeId] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const manage = can('template.manage');
  const remove = useMutation({
    mutationFn: (t: TemplateListItem) => api<undefined>(`/templates/${t.id}`, { method: 'DELETE' }),
    onSuccess: (_r, t) => {
      toast.success(`Đã xóa mẫu ${t.code}`);
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['templates', { kind, q, status, contractTypeId }],
    queryFn: () => api<Paginated<TemplateListItem>>('/templates', { query: { kind, q, status, contractTypeId, pageSize: 100 } }),
    placeholderData: keepPreviousData,
  });

  const kindTypes = (lookups.data?.contractTypes ?? []).filter((t) => t.kind === kind);
  const deptName = (id: string) => lookups.data?.departments.find((d) => d.id === id)?.name ?? '…';

  return (
    <>
      <PageHeader
        title={text.title}
        description={text.description}
        crumbs={[...text.crumbs]}
        actions={
          manage && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Tạo mẫu
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Tìm theo tên, mã mẫu…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm mẫu" />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={setStatus} options={(Object.keys(TEMPLATE_STATUS_LABELS) as TemplateStatus[]).map((s) => ({ value: s, label: TEMPLATE_STATUS_LABELS[s] }))} />
        {kindTypes.length > 1 && <FilterSelect allLabel={text.typeFilter} value={contractTypeId} onChange={setContractTypeId} options={kindTypes.map((t) => ({ value: t.id, label: t.name }))} />}
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã mẫu</TableHead>
                <TableHead>Tên mẫu</TableHead>
                <TableHead>{text.typeColumn}</TableHead>
                <TableHead>Phiên bản</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Phòng ban được dùng</TableHead>
                <TableHead className="text-right">Đã dùng</TableHead>
                <TableHead>Cập nhật</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-24" />
                  </TableCell>
                </TableRow>
              ) : !list.data.items.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-4">
                    <EmptyState title={`Chưa có ${text.noun}`} />
                  </TableCell>
                </TableRow>
              ) : (
                list.data.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/templates/${t.id}`} className="font-medium text-primary hover:underline" onMouseEnter={() => qc.prefetchQuery({ queryKey: ['template', t.id], queryFn: () => api(`/templates/${t.id}`) })}>
                        {t.code}
                      </Link>
                    </TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>{t.contractType?.name ?? '—'}</TableCell>
                    <TableCell>v{t.version}</TableCell>
                    <TableCell>
                      <TemplateStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-sm">{t.departmentIds.length ? t.departmentIds.map(deptName).join(', ') : 'Tất cả'}</TableCell>
                    <TableCell className="text-right tabular-nums">{t._count.contracts}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(t.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Xem trước mẫu ${t.code}`} title="Xem trước với dữ liệu mẫu" onClick={() => setPreviewId(t.id)}>
                          <Eye />
                        </Button>
                    {manage && (
                        <>
                          {t.status !== 'ARCHIVED' && (
                            <Button variant="ghost" size="icon-sm" asChild aria-label={`Sửa mẫu ${t.code}`} title="Sửa nội dung, thông tin mẫu">
                              <Link href={`/templates/${t.id}`}>
                                <Pencil />
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            aria-label={`Xóa mẫu ${t.code}`}
                            title="Xóa mẫu"
                            disabled={remove.isPending}
                            onClick={() =>
                              setConfirm({
                                title: `Xóa mẫu ${t.code}?`,
                                description: templateDeleteNote(t._count.contracts),
                                destructive: true,
                                confirmLabel: 'Xóa',
                                onConfirm: () => remove.mutateAsync(t).then(() => undefined),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </>
                    )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {previewId && <TemplatePreviewDialog templateId={previewId} kind={kind} open onClose={() => setPreviewId(null)} />}
      <CreateTemplateDialog open={creating} onClose={() => setCreating(false)} kind={kind} contractTypeId={kind === 'ORDER' ? kindTypes[0]?.id : undefined} />
    </>
  );
}
