'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Building2, Download, Loader2, Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, type Paginated } from '@/lib/api';
import { useCompanyProfile } from '@/lib/company';
import { DEFAULT_NOTE, DEFAULT_WARNING, downloadShippingLabel, openShippingLabel, type ShippingLabel } from '@/lib/shipping-label';
import type { ContractDetail, ContractListItem, Partner } from '@/lib/types';

const EMPTY: ShippingLabel = {
  from: { contact: '', phone: '', company: '', address: '' },
  warning: DEFAULT_WARNING,
  to: { company: '', contact: '', address: '', phones: '' },
  note: DEFAULT_NOTE,
  boxes: 1,
  showBoxNumber: true,
  layout: 'A4',
};

/** Phiếu dán thùng gửi chành xe: người gửi – lưu ý – người nhận – điện thoại, in PDF chữ lớn. */
export default function ShippingLabelsPage() {
  const orderId = useSearchParams().get('order') ?? '';
  return (
    <>
      <PageHeader
        title="Phiếu gửi hàng"
        description="Tạo phiếu dán thùng gửi chành xe: người gửi, lưu ý, người nhận và điện thoại; in mỗi thùng một phiếu."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Phiếu gửi hàng' }]}
      />
      {/* key: mở từ đơn khác thì điền lại từ đầu. */}
      <LabelForm key={orderId} orderId={orderId} />
    </>
  );
}

function LabelForm({ orderId }: { orderId: string }) {
  const company = useCompanyProfile();
  const [l, setL] = useState<ShippingLabel>(EMPTY);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const [partnerQ, setPartnerQ] = useState('');
  const partners = useQuery({
    queryKey: ['partners', 'label-picker', partnerQ],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { q: partnerQ, pageSize: 50 } }),
  });
  const orders = useQuery({
    queryKey: ['orders', 'label-picker'],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'ORDER', pageSize: 50 } }),
  });
  const order = useQuery({
    queryKey: ['contract', orderId],
    queryFn: () => api<ContractDetail>(`/contracts/${orderId}`),
    enabled: !!orderId,
  });

  const set = (patch: Partial<ShippingLabel>) => setL((x) => ({ ...x, ...patch }));
  const setFrom = (patch: Partial<ShippingLabel['from']>) => setL((x) => ({ ...x, from: { ...x.from, ...patch } }));
  const setTo = (patch: Partial<ShippingLabel['to']>) => setL((x) => ({ ...x, to: { ...x.to, ...patch } }));

  const ownCompany = () => {
    const c = company.data;
    if (!c) return null;
    return { company: c.name, address: c.address ?? '', phone: c.phone ?? '' };
  };
  const senderIsUs = () => {
    const c = ownCompany();
    if (!c) return toast.error('Chưa tải được thông tin doanh nghiệp');
    setFrom({ company: c.company, address: c.address, phone: c.phone });
  };
  const receiverIsUs = () => {
    const c = ownCompany();
    if (!c) return toast.error('Chưa tải được thông tin doanh nghiệp');
    setTo({ company: c.company, address: c.address, phones: c.phone });
  };
  const fromPartner = (side: 'from' | 'to', id?: string) => {
    const p = partners.data?.items.find((x) => x.id === id);
    if (!p) return;
    if (side === 'from') setFrom({ company: p.name, address: p.address ?? '', phone: p.phone ?? '', contact: p.representative ?? '' });
    else setTo({ company: p.name, address: p.address ?? '', phones: p.phone ?? '', contact: p.representative ?? '' });
  };
  /** Điền từ đơn đặt hàng: người nhận = khách hàng (địa điểm giao hàng nếu có), người gửi = doanh nghiệp mình. */
  const applyOrder = (o: ContractDetail) => {
    const customer = o.parties.find((p) => !p.isInternal) ?? o.parties[0];
    const own = o.parties.find((p) => p.isInternal);
    const c = ownCompany();
    setL((x) => ({
      ...x,
      from: {
        ...x.from,
        company: own?.name || c?.company || x.from.company,
        address: own?.address || c?.address || x.from.address,
        phone: own?.phone || c?.phone || x.from.phone,
      },
      to: {
        company: customer?.name ?? '',
        contact: customer?.representative ?? '',
        address: o.deliveryAddress || customer?.address || '',
        phones: customer?.phone ?? '',
      },
    }));
    setFilledFrom(o.code);
  };
  if (order.data && filledFrom === null) applyOrder(order.data);

  const swap = () => setL((x) => ({ ...x, from: { contact: x.to.contact, phone: x.to.phones, company: x.to.company, address: x.to.address }, to: { contact: x.from.contact, phones: x.from.phone, company: x.from.company, address: x.from.address } }));
  const valid = (l.from.company.trim() || l.from.contact.trim()) && l.to.company.trim() && l.to.address.trim();

  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind);
    try {
      await (kind === 'pdf' ? downloadShippingLabel(l) : openShippingLabel(l));
    } catch (e) {
      toast.error(`Không tạo được PDF: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Điền nhanh</CardTitle>
              <CardDescription>{filledFrom ? `Đã điền từ đơn ${filledFrom}.` : 'Từ đơn đặt hàng, danh mục đối tác hoặc thông tin doanh nghiệp mình.'}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={swap}>
              <ArrowLeftRight /> Đổi người gửi ⇄ người nhận
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <FilterSelect
              className="w-full"
              allLabel="Chọn đơn đặt hàng để điền người nhận…"
              value={undefined}
              onChange={(id) => id && api<ContractDetail>(`/contracts/${id}`).then(applyOrder).catch((e: Error) => toast.error(e.message))}
              options={(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.code} · ${o.parties[0]?.name ?? o.title}` }))}
              ariaLabel="Đơn đặt hàng"
            />
            <Input placeholder="Lọc danh mục đối tác…" value={partnerQ} onChange={(e) => setPartnerQ(e.target.value)} aria-label="Lọc đối tác" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">Người gửi (FROM)</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={senderIsUs}>
                <Building2 /> Doanh nghiệp mình
              </Button>
              <FilterSelect className="w-56" allLabel="Chọn đối tác…" value={undefined} onChange={(id) => fromPartner('from', id)} options={(partners.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} ariaLabel="Người gửi từ danh mục" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Người liên hệ / khu vực" hint="VD: Chị Trinh – TPHCM">
              <Input value={l.from.contact} onChange={(e) => setFrom({ contact: e.target.value })} />
            </Field>
            <Field label="Điện thoại">
              <Input value={l.from.phone} onChange={(e) => setFrom({ phone: e.target.value })} />
            </Field>
            <Field label="Công ty" className="sm:col-span-2">
              <Input value={l.from.company} onChange={(e) => setFrom({ company: e.target.value })} />
            </Field>
            <Field label="Địa chỉ" className="sm:col-span-2">
              <Input value={l.from.address} onChange={(e) => setFrom({ address: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">Người nhận (TO)</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={receiverIsUs}>
                <Building2 /> Doanh nghiệp mình
              </Button>
              <FilterSelect className="w-56" allLabel="Chọn đối tác…" value={undefined} onChange={(id) => fromPartner('to', id)} options={(partners.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} ariaLabel="Người nhận từ danh mục" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Công ty / người nhận *" className="sm:col-span-2">
              <Input value={l.to.company} onChange={(e) => setTo({ company: e.target.value })} />
            </Field>
            <Field label="Người nhận hàng (tùy chọn)">
              <Input value={l.to.contact} onChange={(e) => setTo({ contact: e.target.value })} />
            </Field>
            <Field label="Điện thoại" hint="Nhiều số cách nhau bằng “ – ”">
              <Input value={l.to.phones} onChange={(e) => setTo({ phones: e.target.value })} />
            </Field>
            <Field label="Địa chỉ giao *" className="sm:col-span-2">
              <Input value={l.to.address} onChange={(e) => setTo({ address: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lưu ý và in</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Dòng lưu ý (chữ lớn)" className="sm:col-span-2">
              <Input value={l.warning} onChange={(e) => set({ warning: e.target.value })} />
            </Field>
            <Field label="Ghi chú cuối phiếu" className="sm:col-span-2">
              <Input value={l.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            <Field label="Số thùng (mỗi thùng một phiếu)">
              <Input inputMode="numeric" value={String(l.boxes)} onChange={(e) => set({ boxes: Math.max(1, Math.min(200, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
            </Field>
            <Field label="Khổ in">
              <Select value={l.layout} onValueChange={(v) => set({ layout: v as ShippingLabel['layout'] })}>
                <SelectTrigger className="w-full" aria-label="Khổ in">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4 ngang – 1 phiếu/trang</SelectItem>
                  <SelectItem value="A5x2">A4 dọc – 2 phiếu/trang (cắt đôi)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={l.showBoxNumber} onCheckedChange={(v) => set({ showBoxNumber: !!v })} /> Ghi “Thùng 1/N” trên mỗi phiếu (khi có nhiều thùng)
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button disabled={!valid || !!busy} onClick={() => run('print')}>
                {busy === 'print' ? <Loader2 className="animate-spin" /> : <Printer />} Mở PDF để in
              </Button>
              <Button variant="outline" disabled={!valid || !!busy} onClick={() => run('pdf')}>
                {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
              </Button>
              {!valid && <span className="self-center text-xs text-muted-foreground">Nhập người gửi, công ty và địa chỉ người nhận.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-sm text-muted-foreground">Xem trước</p>
        <LabelPreview l={l} />
      </div>
    </div>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1.5 ${className ?? ''}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Xem trước giống bản in: chữ đậm, căn giữa, viết hoa; FROM/TO gạch chân. */
function LabelPreview({ l }: { l: ShippingLabel }) {
  const up = (s: string) => s.trim().toUpperCase();
  const toTitle = [l.to.company.trim(), l.to.contact.trim()].filter(Boolean).join(' – ');
  return (
    <div className="aspect-[297/210] w-full overflow-hidden rounded-md border bg-white p-[4%] text-center font-bold text-[#111]" style={{ fontFamily: 'Tinos, "Times New Roman", serif' }}>
      {l.showBoxNumber && l.boxes > 1 && <p className="text-right text-[1.6cqw]">Thùng 1/{l.boxes}</p>}
      <div className="flex h-full flex-col justify-center gap-[0.6em] text-[clamp(10px,1.9vw,17px)] leading-tight">
        <p>
          <span className="underline">FROM:</span>&nbsp;&nbsp;&nbsp; {up(l.from.contact)}
          {l.from.contact.trim() && l.from.phone.trim() && ' – '}
          <span className="text-[1.15em]">{l.from.phone.trim()}</span>
        </p>
        {l.from.company.trim() && <p>{up(l.from.company)}</p>}
        {l.from.address.trim() && <p className="text-[0.9em]">{up(l.from.address)}</p>}
        {l.warning.trim() && <p className="my-[0.4em] text-[2.2em]">{up(l.warning)}</p>}
        <p>
          <span className="underline">TO:</span> {up(toTitle)}
        </p>
        {l.to.address.trim() && <p className="text-[0.9em]">{up(l.to.address)}</p>}
        {l.to.phones.trim() && <p className="text-[1.4em]">{l.to.phones.trim()}</p>}
        {l.note.trim() && <p className="mt-[0.6em] text-[1.15em]">{up(l.note)}</p>}
      </div>
    </div>
  );
}
