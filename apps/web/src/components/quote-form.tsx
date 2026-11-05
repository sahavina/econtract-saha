'use client';

import { fromScaled, itemAmount, orderTotals, toScaled } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { todayIso } from '@/components/quote-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, type Paginated } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Partner, Product, QuoteDetail } from '@/lib/types';

interface Line {
  key: number;
  productId: string | null;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: null, code: '', name: '', unit: '', quantity: '1', unitPrice: '' });
const num = (v: string) => v.replace(/[^\d.]/g, '');
const plain = (v: string | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)));

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1.5 ${className ?? ''}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

/** Lập/sửa báo giá: khách hàng từ danh mục đối tác hoặc nhập tay, dòng hàng từ danh mục sản phẩm hoặc nhập tay. */
export function QuoteForm({ quote, partnerParam = '', readOnly = false }: { quote?: QuoteDetail; partnerParam?: string; readOnly?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const date0 = quote?.date.slice(0, 10) ?? todayIso();
  const [h, setH] = useState({
    date: date0,
    validUntil: quote ? (quote.validUntil?.slice(0, 10) ?? '') : addDays(date0, 30),
    customerName: quote?.customerName ?? '',
    customerTaxCode: quote?.customerTaxCode ?? '',
    customerAddress: quote?.customerAddress ?? '',
    customerContact: quote?.customerContact ?? '',
    customerPhone: quote?.customerPhone ?? '',
    customerEmail: quote?.customerEmail ?? '',
    vatRate: plain(quote?.vatRate),
    paymentTerms: quote?.paymentTerms ?? '',
    deliveryTerms: quote?.deliveryTerms ?? '',
    note: quote?.note ?? '',
  });
  const [partnerId, setPartnerId] = useState(quote?.partnerId ?? '');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [loadedPartner, setLoadedPartner] = useState(false);
  const [lines, setLines] = useState<Line[]>(
    quote?.items.length
      ? quote.items.map((i) => ({ key: nextKey++, productId: i.productId, code: i.code ?? '', name: i.name, unit: i.unit ?? '', quantity: plain(i.quantity), unitPrice: plain(i.unitPrice) }))
      : [emptyLine()],
  );
  const partners = useQuery({
    queryKey: ['partners', 'picker', partnerSearch],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { q: partnerSearch, pageSize: 50 } }),
  });
  const products = useQuery({
    queryKey: ['products', 'quote-picker'],
    queryFn: () => api<Paginated<Product>>('/products', { query: { pageSize: 500 } }),
  });
  const preset = useQuery({
    queryKey: ['partners', 'detail', partnerParam],
    queryFn: () => api<Partner>(`/partners/${encodeURIComponent(partnerParam)}`),
    enabled: !!partnerParam && !quote,
    retry: false,
  });

  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const applyPartner = (p: Partner) => {
    setPartnerId(p.id);
    set({ customerName: p.name, customerTaxCode: p.taxCode ?? '', customerAddress: p.address ?? '', customerContact: p.representative ?? '', customerPhone: p.phone ?? '', customerEmail: p.email ?? '' });
  };
  if (preset.data && !loadedPartner) {
    setLoadedPartner(true);
    applyPartner(preset.data);
  }
  const pickProduct = (key: number, id?: string) => {
    const p = products.data?.items.find((x) => x.id === id);
    if (p) setLine(key, { productId: p.id, code: p.code, name: p.name, unit: p.unit ?? '', unitPrice: plain(p.unitPrice) });
    // Sản phẩm đầu tiên có thuế suất: điền sẵn VAT nếu chưa nhập.
    if (p?.vatRate && !h.vatRate) set({ vatRate: plain(p.vatRate) });
  };

  const rows = lines.filter((l) => l.name.trim());
  const totals = orderTotals(rows.map((l) => ({ name: l.name, quantity: l.quantity || '0', unitPrice: l.unitPrice || '0' })), h.vatRate || null);
  const partnerOptions = (partners.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
  if (partnerId && !partnerOptions.some((o) => o.value === partnerId)) partnerOptions.unshift({ value: partnerId, label: quote?.partner ? `${quote.partner.code} · ${quote.partner.name}` : h.customerName });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...h,
        partnerId: partnerId || null,
        items: rows.map((l) => ({ productId: l.productId, code: l.code, name: l.name, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice || '0' })),
      };
      return quote ? api<{ id: string; code: string }>(`/quotes/${quote.id}`, { method: 'PATCH', body }) : api<{ id: string; code: string }>('/quotes', { method: 'POST', body });
    },
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote', x.id] });
      toast.success(quote ? 'Đã lưu thay đổi' : `Đã lập báo giá ${x.code}`);
      if (!quote) router.replace(`/quotes/${x.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid = h.customerName.trim() && rows.length > 0;

  const text = (label: string, key: keyof typeof h, className?: string, type?: string) => (
    <Field label={label} className={className}>
      <Input type={type} disabled={readOnly} value={h[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Khách hàng</CardTitle>
          <CardDescription>Chọn từ danh mục đối tác để tự điền, hoặc nhập tay khách mới.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!readOnly && (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 lg:col-span-4">
              <Input placeholder="Lọc danh sách đối tác…" value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} aria-label="Lọc đối tác" />
              <FilterSelect
                className="w-full"
                allLabel="— Nhập tay —"
                value={partnerId || undefined}
                onChange={(id) => {
                  const p = partners.data?.items.find((x) => x.id === id);
                  if (p) applyPartner(p);
                  else setPartnerId('');
                }}
                options={partnerOptions}
                ariaLabel="Đối tác"
              />
            </div>
          )}
          {text('Tên khách hàng *', 'customerName', 'sm:col-span-2 lg:col-span-3')}
          {text('Mã số thuế', 'customerTaxCode')}
          {text('Địa chỉ', 'customerAddress', 'sm:col-span-2 lg:col-span-4')}
          {text('Người liên hệ', 'customerContact')}
          {text('Điện thoại', 'customerPhone')}
          {text('Email', 'customerEmail', 'sm:col-span-2', 'email')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin báo giá</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {text('Ngày báo giá *', 'date', undefined, 'date')}
          {text('Hiệu lực đến', 'validUntil', undefined, 'date')}
          <Field label="Thuế VAT (%)">
            <Input inputMode="decimal" disabled={readOnly} value={h.vatRate} onChange={(e) => set({ vatRate: num(e.target.value) })} placeholder="VD: 8" />
          </Field>
          <div />
          <Field label="Điều kiện thanh toán" className="sm:col-span-2">
            <Textarea rows={2} disabled={readOnly} value={h.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />
          </Field>
          <Field label="Điều kiện giao hàng" className="sm:col-span-2">
            <Textarea rows={2} disabled={readOnly} value={h.deliveryTerms} onChange={(e) => set({ deliveryTerms: e.target.value })} />
          </Field>
          <Field label="Ghi chú" className="sm:col-span-2 lg:col-span-4">
            <Textarea rows={2} disabled={readOnly} value={h.note} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Hàng hóa</CardTitle>
            <CardDescription>Chọn từ danh mục sản phẩm rồi sửa đơn giá nếu cần, hoặc nhập tay.</CardDescription>
          </div>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus /> Thêm dòng
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-64">Tên hàng hóa</TableHead>
                <TableHead className="w-32">Mã hàng</TableHead>
                <TableHead className="w-20">ĐVT</TableHead>
                <TableHead className="w-28 text-right">Số lượng</TableHead>
                <TableHead className="w-32 text-right">Đơn giá</TableHead>
                <TableHead className="w-32 text-right">Thành tiền</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={l.key}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="space-y-1">
                    {!readOnly && (
                      <FilterSelect
                        className="w-full"
                        allLabel="— Nhập tay —"
                        value={l.productId ?? undefined}
                        onChange={(id) => (id ? pickProduct(l.key, id) : setLine(l.key, { productId: null }))}
                        options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                        ariaLabel={`Sản phẩm dòng ${i + 1}`}
                      />
                    )}
                    <Input disabled={readOnly} value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} aria-label={`Tên hàng dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input disabled={readOnly} value={l.code} onChange={(e) => setLine(l.key, { code: e.target.value })} aria-label={`Mã hàng dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input disabled={readOnly} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label={`ĐVT dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input disabled={readOnly} className="text-right" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: num(e.target.value) })} aria-label={`Số lượng dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input disabled={readOnly} className="text-right" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: num(e.target.value) })} aria-label={`Đơn giá dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(itemAmount(l.quantity || '0', l.unitPrice || '0'))}</TableCell>
                  <TableCell>
                    {!readOnly && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Xóa dòng ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={6} className="text-right">Cộng tiền hàng</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(totals.subtotal)}</TableCell>
                <TableCell />
              </TableRow>
              {totals.vatAmount !== null && (
                <TableRow>
                  <TableCell colSpan={6} className="text-right">Thuế GTGT ({h.vatRate}%)</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(totals.vatAmount)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={6} className="text-right font-medium">Tổng cộng</TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{formatMoney(fromScaled(toScaled(totals.total, 2), 2))}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="flex items-center justify-end gap-2">
          {!valid && <span className="text-xs text-muted-foreground">Nhập tên khách hàng và ít nhất một dòng hàng.</span>}
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {quote ? 'Lưu thay đổi' : 'Lưu báo giá'}
          </Button>
        </div>
      )}
    </div>
  );
}
