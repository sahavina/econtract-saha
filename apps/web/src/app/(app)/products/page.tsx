'use client';

import { formatQtyVi } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, TitleCell } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Product } from '@/lib/types';

type Draft = { id?: string; code: string; name: string; unit: string; unitPrice: string; vatRate: string; description: string; isActive: boolean };

const toDraft = (p?: Product): Draft => ({
  id: p?.id,
  code: p?.code ?? '',
  name: p?.name ?? '',
  unit: p?.unit ?? '',
  unitPrice: p ? String(Number(p.unitPrice)) : '0',
  vatRate: p?.vatRate ? String(Number(p.vatRate)) : '',
  description: p?.description ?? '',
  isActive: p?.isActive ?? true,
});

/** Danh mục sản phẩm/hàng hóa dùng khi lập đơn đặt hàng. */
export default function ProductsPage() {
  const { can } = useAuth();
  const manage = can('product.manage');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const products = useQuery({
    queryKey: ['products', 'list', q, all],
    queryFn: () => api<Paginated<Product>>('/products', { query: { q, all, pageSize: 200 } }),
    placeholderData: keepPreviousData,
  });

  const editButton = (p: Product) =>
    manage ? (
      <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${p.name}`} onClick={() => setEditing(toDraft(p))}>
        <Pencil />
      </Button>
    ) : null;

  return (
    <>
      <PageHeader
        title="Sản phẩm"
        description="Danh mục hàng hóa để chọn nhanh khi lập đơn đặt hàng (mã, tên, đơn vị tính, đơn giá, VAT). Đơn đã lập giữ nguyên tên và giá tại thời điểm lập."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Sản phẩm' }]}
        actions={
          manage && (
            <Button className="h-9" onClick={() => setEditing(toDraft())}>
              <Plus /> Thêm sản phẩm
            </Button>
          )
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Tìm mã hoặc tên sản phẩm…" ariaLabel="Tìm sản phẩm" />
            <label className="flex h-9 items-center gap-2 px-1 text-sm">
              <Checkbox checked={all} onCheckedChange={(v) => setAll(!!v)} /> Hiện cả sản phẩm ngừng kinh doanh
            </label>
          </>
        }
      >
        <ListState query={products} empty={{ title: 'Chưa có sản phẩm', description: manage ? 'Bấm “Thêm sản phẩm” để tạo danh mục.' : undefined }} />
        {!!products.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {products.data.items.map((p) => (
                <MobileCard
                  key={p.id}
                  title={p.name}
                  sub={`${p.code} · ${p.unit}`}
                  status={<StatusPill tone={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Đang kinh doanh' : 'Ngừng'}</StatusPill>}
                  actions={editButton(p)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">{formatQtyVi(p.unitPrice)} đ</span>
                    <span className="text-xs text-muted-foreground">VAT {p.vatRate ? `${Number(p.vatRate)}%` : '—'}</span>
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Sản phẩm</Th>
                    <Th>ĐVT</Th>
                    <Th className="text-right">Đơn giá</Th>
                    <Th className="text-right">VAT</Th>
                    <Th>Trạng thái</Th>
                    <Th />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.data.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={Box} title={p.name} sub={p.description ? `${p.code} · ${p.description}` : p.code} />
                      </TableCell>
                      <TableCell>{p.unit}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatQtyVi(p.unitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.vatRate ? `${Number(p.vatRate)}%` : '—'}</TableCell>
                      <TableCell>
                        <StatusPill tone={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Đang kinh doanh' : 'Ngừng'}</StatusPill>
                      </TableCell>
                      <TableCell className="text-right">{editButton(p)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </ListCard>
      {editing && <ProductDialog key={editing.id ?? 'new'} draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProductDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const body = {
        code: d.code,
        name: d.name,
        unit: d.unit,
        unitPrice: d.unitPrice || '0',
        vatRate: d.vatRate === '' ? null : Number(d.vatRate),
        description: d.description,
        isActive: d.isActive,
      };
      return d.id ? api<Product>(`/products/${d.id}`, { method: 'PATCH', body }) : api<Product>('/products', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(d.id ? 'Đã lưu sản phẩm' : 'Đã thêm sản phẩm');
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (e) => setErrors(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message) : [e instanceof Error ? e.message : 'Lưu thất bại']),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.id ? `Sửa sản phẩm ${draft.code}` : 'Thêm sản phẩm'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-code">Mã *</Label>
              <Input id="p-code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-name">Tên sản phẩm *</Label>
              <Input id="p-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-unit">Đơn vị tính</Label>
              <Input id="p-unit" placeholder="Thùng, Chai…" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Đơn giá (chưa VAT)</Label>
              <Input id="p-price" inputMode="decimal" value={d.unitPrice} onChange={(e) => setD({ ...d, unitPrice: e.target.value.trim() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-vat">VAT (%)</Label>
              <Input id="p-vat" inputMode="decimal" value={d.vatRate} onChange={(e) => setD({ ...d, vatRate: e.target.value.trim() })} />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="p-desc">Mô tả</Label>
              <Textarea id="p-desc" rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={d.isActive} onCheckedChange={(v) => setD({ ...d, isActive: !!v })} /> Đang kinh doanh (hiện khi chọn hàng cho đơn)
          </label>
          {errors.length > 0 && (
            <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
