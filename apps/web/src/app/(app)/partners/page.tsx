'use client';

import { PARTNER_TYPE_LABELS, PARTNER_TYPES, type PartnerType } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CloudDownload, Link2, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { OdooPartnerDialog } from '@/components/odoo-partner-dialog';
import { PartnerDialog } from '@/components/partner-dialog';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isOdooPartner, odooReady, useOdooConfig } from '@/lib/odoo';
import type { Partner } from '@/lib/types';

export default function PartnersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const type = (params.get('type') ?? undefined) as PartnerType | undefined;
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [paging, setPaging] = useState({ type, page: 1 });
  // Trang reset về 1 khi đổi phân loại (kể cả qua menu sidebar).
  const page = paging.type === type ? paging.page : 1;
  const setPage = (p: number) => setPaging({ type, page: p });
  const [dialog, setDialog] = useState<{ partner?: Partner } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [odooOpen, setOdooOpen] = useState(false);
  /** Đối tác đang ánh xạ với Odoo (mở hộp thoại tìm trên Odoo). */
  const [linking, setLinking] = useState<Partner | null>(null);
  const odoo = useOdooConfig();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['partners', { type, q: debounced, page }],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { type, q: debounced, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });

  const syncOdoo = useMutation({
    mutationFn: (id: string) => api<Partner>(`/integrations/odoo/partners/${id}/sync`, { method: 'POST' }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success(`Đã cập nhật ${p.code} từ Odoo`);
    },
  });

  /** Ánh xạ tự động theo MST các đối tác chưa liên kết Odoo. */
  const autoLink = useMutation({
    mutationFn: () =>
      api<{ linked: { code: string; odooName: string }[]; ambiguous: string[]; notFound: string[]; failed: { code: string; error: string }[] }>(
        '/integrations/odoo/partners/auto-link',
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      const lines = [
        r.linked.length ? `Đã ánh xạ: ${r.linked.map((x) => `${x.code} → ${x.odooName}`).join('; ')}` : '',
        r.ambiguous.length ? `Nhiều kết quả trùng MST (ánh xạ tay): ${r.ambiguous.join(', ')}` : '',
        r.notFound.length ? `Không thấy trên Odoo: ${r.notFound.join(', ')}` : '',
        r.failed.length ? `Lỗi: ${r.failed.map((x) => `${x.code} (${x.error})`).join('; ')}` : '',
      ].filter(Boolean);
      const fn = r.linked.length ? toast.success : toast.info;
      fn(r.linked.length ? `Đã ánh xạ ${r.linked.length} đối tác với Odoo` : 'Không có đối tác nào ánh xạ được theo MST', {
        description: lines.join('\n') || 'Mọi đối tác có MST đều đã liên kết Odoo.',
        duration: 15_000,
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/partners/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success('Đã xóa đối tác');
    },
  });

  const title = type ? PARTNER_TYPE_LABELS[type] : 'Tất cả đối tác';
  const data = list.data;

  return (
    <>
      <PageHeader
        title={title}
        crumbs={[{ label: 'Đối tác', href: '/partners' }, { label: title }]}
        actions={
          can('partner.manage') && (
            <div className="flex gap-2">
              {odooReady(odoo.data) && (
                <>
                  <Button variant="outline" disabled={autoLink.isPending} onClick={() => autoLink.mutate()} title="Liên kết các đối tác chưa ánh xạ với đối tác Odoo trùng mã số thuế">
                    {autoLink.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Ánh xạ Odoo theo MST
                  </Button>
                  <Button variant="outline" onClick={() => setOdooOpen(true)}>
                    <CloudDownload /> Nhập từ Odoo
                  </Button>
                </>
              )}
              <Button onClick={() => setDialog({})}><Plus /> Thêm đối tác</Button>
            </div>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-72" placeholder="Tìm theo tên, mã, MST, email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm đối tác" />
        <FilterSelect allLabel="Mọi phân loại" value={type} onChange={(v) => { router.replace(v ? `${pathname}?type=${v}` : pathname); }} options={PARTNER_TYPES.map((t) => ({ value: t, label: PARTNER_TYPE_LABELS[t] }))} />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên đối tác</TableHead>
                <TableHead>Phân loại</TableHead>
                <TableHead>Mã số thuế</TableHead>
                <TableHead>Người đại diện</TableHead>
                <TableHead>Liên hệ</TableHead>
                <TableHead className="text-right">Hợp đồng</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow><TableCell colSpan={8}><Skeleton className="h-24" /></TableCell></TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-4">
                    <EmptyState title="Chưa có đối tác" description="Thêm khách hàng, nhà cung cấp để dùng khi tạo hợp đồng." />
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => {
                      // Đang bôi đen để sao chép (MST, tên…) thì không mở trang.
                      if (!window.getSelection()?.toString()) router.push(`/partners/${p.id}`);
                    }}
                  >
                    <TableCell className="font-medium">{p.code}</TableCell>
                    <TableCell>
                      <Link href={`/partners/${p.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {p.name}
                      </Link>
                      {isOdooPartner(p) && <Badge variant="outline" className="ml-1.5 text-[10px]">Odoo</Badge>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{PARTNER_TYPE_LABELS[p.type]}</Badge></TableCell>
                    <TableCell>{p.taxCode ?? '—'}</TableCell>
                    <TableCell>{p.representative ? `${p.representative}${p.position ? ` (${p.position})` : ''}` : '—'}</TableCell>
                    <TableCell className="text-xs">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{p._count?.contractParties ?? 0}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {can('partner.manage') && (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label="Sửa" onClick={() => setDialog({ partner: p })}><Pencil /></Button>
                          {isOdooPartner(p) && odooReady(odoo.data) && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Cập nhật ${p.code} từ Odoo`} disabled={syncOdoo.isPending} onClick={() => syncOdoo.mutate(p.id)}>
                              <RefreshCw className={syncOdoo.isPending && syncOdoo.variables === p.id ? 'animate-spin' : undefined} />
                            </Button>
                          )}
                          {!isOdooPartner(p) && odooReady(odoo.data) && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Ánh xạ ${p.code} với Odoo`} title="Ánh xạ với đối tác Odoo" onClick={() => setLinking(p)}>
                              <Link2 />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Xóa"
                            onClick={() => setConfirm({ title: `Xóa đối tác ${p.name}?`, description: 'Hợp đồng đã tạo vẫn giữ thông tin các bên.', destructive: true, confirmLabel: 'Xóa', onConfirm: () => remove.mutateAsync(p.id).then(() => undefined) })}
                          >
                            <Trash2 />
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

      {data && data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
          Trang {data.page}/{data.totalPages}
          <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
        </div>
      )}

      <PartnerDialog open={!!dialog} partner={dialog?.partner} defaultType={type} onClose={() => setDialog(null)} />
      {linking && (
        <OdooPartnerDialog
          key={linking.id}
          open
          onOpenChange={(o) => !o && setLinking(null)}
          mode="link"
          linkPartner={{ id: linking.id, code: linking.code }}
          initialQuery={linking.taxCode || linking.name}
        />
      )}
      <OdooPartnerDialog open={odooOpen} onOpenChange={setOdooOpen} mode="import" defaultKind={type === 'CUSTOMER' || type === 'SUPPLIER' ? type : undefined} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
