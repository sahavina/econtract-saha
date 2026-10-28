'use client';

import { formatQtyVi, itemAmount, toScaled, fromScaled } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useCompanyProfile } from '@/lib/company';
import { formatMoney } from '@/lib/format';
import type { ContractDetail, ContractListItem, Product, StockIssueDetail } from '@/lib/types';

interface Line {
  key: string;
  productId: string | null;
  orderItemId: string | null;
  code: string;
  name: string;
  unit: string;
  requestedQty: string;
  quantity: string;
  unitPrice: string;
  /** Còn phải giao của dòng đơn (giới hạn số thực xuất). */
  remaining?: string;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const num = (v: string) => v.replace(/[^\d.]/g, '');
const newKey = () => Math.random().toString(36).slice(2);
const emptyLine = (): Line => ({ key: newKey(), productId: null, orderItemId: null, code: '', name: '', unit: '', requestedQty: '1', quantity: '1', unitPrice: '0' });

const HEADER = {
  issueDate: today(),
  receiverName: '',
  receiverUnit: '',
  receiverAddress: '',
  reason: '',
  warehouse: '',
  warehouseAddress: '',
  debitAccount: '',
  creditAccount: '',
  attachments: '',
  note: '',
};

/** Lập phiếu xuất kho: từ đơn đặt hàng (số còn phải giao) hoặc nhập tay từ danh mục sản phẩm. */
export default function NewStockIssuePage() {
  const orderParam = useSearchParams().get('order') ?? '';
  return (
    <>
      <PageHeader
        title="Lập phiếu xuất kho"
        description="Chọn đơn đặt hàng để điền người nhận và hàng còn phải giao, hoặc nhập tay. Lưu phiếu là ghi nhận đã xuất kho."
        crumbs={[{ label: 'Phiếu xuất kho', href: '/stock-issues' }, { label: 'Lập phiếu' }]}
      />
      <IssueForm key={orderParam} orderParam={orderParam} />
    </>
  );
}

function IssueForm({ orderParam }: { orderParam: string }) {
  const router = useRouter();
  const company = useCompanyProfile();
  const [h, setH] = useState(HEADER);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [order, setOrder] = useState<ContractDetail | null>(null);
  const [loadedParam, setLoadedParam] = useState(false);
  const [warehouseFilled, setWarehouseFilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const orders = useQuery({
    queryKey: ['orders', 'issue-picker'],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'ORDER', pageSize: 100 } }),
  });
  const products = useQuery({
    queryKey: ['products', 'issue-picker'],
    queryFn: () => api<Paginated<Product>>('/products', { query: { pageSize: 500 } }),
  });

  const set = (patch: Partial<typeof HEADER>) => setH((x) => ({ ...x, ...patch }));
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Điền từ đơn: người nhận = khách hàng; dòng hàng = số còn phải giao (bỏ dòng đã giao đủ). */
  const applyOrder = (o: ContractDetail) => {
    const customer = o.parties.find((p) => !p.isInternal) ?? o.parties[0];
    setOrder(o);
    setH((x) => ({
      ...x,
      receiverName: customer?.representative || customer?.name || '',
      receiverUnit: customer?.name ?? '',
      receiverAddress: o.deliveryAddress || customer?.address || '',
      reason: `Xuất bán theo đơn đặt hàng ${o.code}`,
      attachments: `Đơn đặt hàng ${o.code}`,
    }));
    const rows = o.items
      .map((i) => {
        const left = toScaled(i.quantity, 3) - toScaled(i.deliveredQty, 3);
        if (left <= BigInt(0)) return null;
        const remaining = String(Number(fromScaled(left, 3)));
        return { key: newKey(), productId: i.productId, orderItemId: i.id, code: i.code ?? '', name: i.name, unit: i.unit ?? '', requestedQty: remaining, quantity: remaining, unitPrice: i.unitPrice, remaining } satisfies Line;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    setLines(rows.length ? rows : [emptyLine()]);
    if (!rows.length) toast.info(`Đơn ${o.code} đã giao đủ – không còn hàng phải xuất`);
  };
  const pickOrder = (id?: string) => {
    if (!id) {
      setOrder(null);
      setLines([emptyLine()]);
      return;
    }
    api<ContractDetail>(`/contracts/${id}`).then(applyOrder).catch((e: Error) => toast.error(e.message));
  };
  if (orderParam && !loadedParam) {
    setLoadedParam(true);
    pickOrder(orderParam);
  }
  // Kho mặc định: địa chỉ doanh nghiệp mình (điền một lần, người dùng sửa tự do).
  if (!warehouseFilled && company.data) {
    setWarehouseFilled(true);
    set({ warehouse: 'Kho hàng', warehouseAddress: company.data.address ?? '' });
  }

  const pickProduct = (key: string, id?: string) => {
    const p = products.data?.items.find((x) => x.id === id);
    if (p) setLine(key, { productId: p.id, code: p.code, name: p.name, unit: p.unit ?? '', unitPrice: String(Number(p.unitPrice)) });
  };

  const total = lines.reduce((s, l) => s + (Number(itemAmount(l.quantity || '0', l.unitPrice || '0')) || 0), 0);

  const save = async () => {
    if (!h.receiverName.trim()) return toast.error('Nhập họ tên người nhận hàng');
    const rows = lines.filter((l) => l.name.trim());
    if (!rows.length) return toast.error('Nhập ít nhất một dòng hàng');
    setSaving(true);
    try {
      const issue = await api<StockIssueDetail>('/stock-issues', {
        method: 'POST',
        body: {
          ...h,
          orderId: order?.id ?? null,
          items: rows.map((l) => ({
            productId: l.productId,
            orderItemId: l.orderItemId,
            code: l.code,
            name: l.name,
            unit: l.unit,
            requestedQty: l.requestedQty || l.quantity,
            quantity: l.quantity,
            unitPrice: l.unitPrice || '0',
          })),
        },
      });
      toast.success(`Đã lập phiếu xuất kho ${issue.code}`);
      router.push(`/stock-issues/${issue.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Không lưu được phiếu xuất kho');
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof HEADER, opts: { type?: string; placeholder?: string; className?: string } = {}) => (
    <label className={`block space-y-1.5 ${opts.className ?? ''}`}>
      <span className="text-sm font-medium">{label}</span>
      <Input type={opts.type} placeholder={opts.placeholder} value={h[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đơn đặt hàng</CardTitle>
          <CardDescription>
            {order ? `Lập từ đơn ${order.code}: chỉ xuất tối đa số lượng còn phải giao; lưu phiếu sẽ cộng vào “đã giao” của đơn.` : 'Không bắt buộc. Phiếu không gắn đơn thì nhập hàng hóa từ danh mục sản phẩm.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilterSelect
            className="w-full max-w-xl"
            allLabel="— Không gắn đơn (nhập tay) —"
            value={order?.id}
            onChange={pickOrder}
            options={(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.code} · ${o.parties[0]?.name ?? o.title}` }))}
            ariaLabel="Đơn đặt hàng"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin phiếu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {field('Ngày xuất *', 'issueDate', { type: 'date' })}
          {field('Họ tên người nhận hàng *', 'receiverName')}
          {field('Đơn vị / bộ phận nhận', 'receiverUnit', { className: 'lg:col-span-2' })}
          {field('Địa chỉ người nhận', 'receiverAddress', { className: 'sm:col-span-2' })}
          {field('Lý do xuất kho', 'reason', { className: 'sm:col-span-2' })}
          {field('Xuất tại kho (ngăn lô)', 'warehouse')}
          {field('Địa điểm kho', 'warehouseAddress', { className: 'lg:col-span-3' })}
          {field('Tài khoản Nợ', 'debitAccount', { placeholder: 'VD: 632' })}
          {field('Tài khoản Có', 'creditAccount', { placeholder: 'VD: 156' })}
          {field('Chứng từ gốc kèm theo', 'attachments', { className: 'sm:col-span-2' })}
          <label className="block space-y-1.5 sm:col-span-2 lg:col-span-4">
            <span className="text-sm font-medium">Ghi chú</span>
            <Textarea rows={2} value={h.note} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Hàng hóa xuất kho</CardTitle>
            <CardDescription>Số lượng yêu cầu và thực xuất theo mẫu 02-VT; thành tiền = thực xuất × đơn giá.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus /> Thêm dòng
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-64">Tên hàng hóa</TableHead>
                <TableHead className="w-32">Mã số</TableHead>
                <TableHead className="w-20">ĐVT</TableHead>
                <TableHead className="w-28 text-right">SL yêu cầu</TableHead>
                <TableHead className="w-28 text-right">SL thực xuất</TableHead>
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
                    {!l.orderItemId && (
                      <FilterSelect
                        className="w-full"
                        allLabel="— Nhập tay —"
                        value={l.productId ?? undefined}
                        onChange={(id) => pickProduct(l.key, id)}
                        options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                        ariaLabel={`Sản phẩm dòng ${i + 1}`}
                      />
                    )}
                    <Input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} aria-label={`Tên hàng dòng ${i + 1}`} />
                    {l.remaining && <p className="text-xs text-muted-foreground">Còn phải giao: {formatQtyVi(l.remaining)}</p>}
                  </TableCell>
                  <TableCell>
                    <Input value={l.code} onChange={(e) => setLine(l.key, { code: e.target.value })} aria-label={`Mã số dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label={`ĐVT dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input className="text-right" inputMode="decimal" value={l.requestedQty} onChange={(e) => setLine(l.key, { requestedQty: num(e.target.value) })} aria-label={`SL yêu cầu dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right"
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: num(e.target.value) })}
                      aria-label={`SL thực xuất dòng ${i + 1}`}
                      aria-invalid={!!l.remaining && Number(l.quantity) > Number(l.remaining)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input className="text-right" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: num(e.target.value) })} aria-label={`Đơn giá dòng ${i + 1}`} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(itemAmount(l.quantity || '0', l.unitPrice || '0'))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Xóa dòng ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={7} className="text-right font-medium">
                  Cộng
                </TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{formatMoney(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Lưu phiếu xuất kho
        </Button>
      </div>
    </div>
  );
}
