'use client';

import { FREIGHT_PAYER_LABELS, SHIPPING_NOTE_STATUS_LABELS, SHIPPING_NOTE_STATUSES, type ShippingNoteStatus } from '@saha/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Building2, Download, Loader2, Printer, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyProfile } from '@/lib/company';
import { DEFAULT_NOTE, DEFAULT_WARNING, downloadShippingLabel, openShippingLabel, type ShippingLabel } from '@/lib/shipping-label';
import type { ContractDetail, ContractListItem, Partner, ShippingNoteDetail, StockIssueDetail } from '@/lib/types';

const EMPTY: ShippingLabel = {
  from: { contact: '', phone: '', company: '', address: '' },
  warning: DEFAULT_WARNING,
  to: { company: '', contact: '', address: '', phones: '' },
  note: DEFAULT_NOTE,
  boxes: 1,
  showBoxNumber: true,
  layout: 'A4',
};

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

/** Thông tin lưu kèm phiếu: ngày gửi, chành xe, cước, trạng thái, liên kết đơn / phiếu xuất kho. */
interface Meta {
  sendDate: string;
  carrier: string;
  carrierPhone: string;
  vehicle: string;
  trackingNo: string;
  freight: string;
  freightPayer: string;
  status: ShippingNoteStatus;
  remark: string;
  orderId: string | null;
  orderCode: string | null;
  stockIssueId: string | null;
  stockIssueCode: string | null;
}

const EMPTY_META: Meta = {
  sendDate: today(),
  carrier: '',
  carrierPhone: '',
  vehicle: '',
  trackingNo: '',
  freight: '',
  freightPayer: '',
  status: 'DRAFT',
  remark: '',
  orderId: null,
  orderCode: null,
  stockIssueId: null,
  stockIssueCode: null,
};

const fromNote = (n: ShippingNoteDetail): ShippingLabel => ({
  from: { contact: n.fromContact ?? '', phone: n.fromPhone ?? '', company: n.fromCompany ?? '', address: n.fromAddress ?? '' },
  warning: n.warning ?? '',
  to: { company: n.toCompany, contact: n.toContact ?? '', address: n.toAddress, phones: n.toPhones ?? '' },
  note: n.footNote ?? '',
  boxes: n.boxes,
  showBoxNumber: n.showBoxNumber,
  layout: n.layout,
});

const metaFromNote = (n: ShippingNoteDetail): Meta => ({
  sendDate: n.sendDate.slice(0, 10),
  carrier: n.carrier ?? '',
  carrierPhone: n.carrierPhone ?? '',
  vehicle: n.vehicle ?? '',
  trackingNo: n.trackingNo ?? '',
  freight: n.freight ? String(Math.round(Number(n.freight))) : '',
  freightPayer: n.freightPayer ?? '',
  status: n.status,
  remark: n.note ?? '',
  orderId: n.orderId,
  orderCode: n.order?.code ?? null,
  stockIssueId: n.stockIssueId,
  stockIssueCode: n.stockIssue?.code ?? null,
});

/**
 * Phiếu dán thùng gửi chành xe: điền nhanh (đơn, phiếu xuất kho, đối tác, doanh nghiệp mình), xem trước, in PDF
 * và lưu vào danh sách kèm thông tin chành xe, trạng thái gửi.
 */
export function ShippingLabelForm({ note, orderId = '', stockIssueId = '' }: { note?: ShippingNoteDetail; orderId?: string; stockIssueId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canSave = can('delivery.manage');
  const company = useCompanyProfile();
  const [l, setL] = useState<ShippingLabel>(note ? fromNote(note) : EMPTY);
  const [meta, setMeta] = useState<Meta>(note ? metaFromNote(note) : EMPTY_META);
  const [filledFrom, setFilledFrom] = useState<string | null>(note ? null : '');
  const [senderFilled, setSenderFilled] = useState(!!note);
  const [busy, setBusy] = useState<'pdf' | 'print' | 'save' | null>(null);
  const [partnerQ, setPartnerQ] = useState('');
  const partners = useQuery({
    queryKey: ['partners', 'label-picker', partnerQ],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { q: partnerQ, pageSize: 50 } }),
  });
  const orders = useQuery({
    queryKey: ['orders', 'label-picker'],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'ORDER', pageSize: 50 } }),
  });

  const set = (patch: Partial<ShippingLabel>) => setL((x) => ({ ...x, ...patch }));
  const setFrom = (patch: Partial<ShippingLabel['from']>) => setL((x) => ({ ...x, from: { ...x.from, ...patch } }));
  const setTo = (patch: Partial<ShippingLabel['to']>) => setL((x) => ({ ...x, to: { ...x.to, ...patch } }));
  const setM = (patch: Partial<Meta>) => setMeta((x) => ({ ...x, ...patch }));

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
    setM({ orderId: o.id, orderCode: o.code });
    setFilledFrom(`đơn ${o.code}`);
  };
  /** Điền từ phiếu xuất kho: người nhận theo phiếu; phiếu gắn đơn thì lấy thêm điện thoại/địa chỉ giao của đơn. */
  const applyIssue = async (s: StockIssueDetail) => {
    if (s.orderId) {
      try {
        applyOrder(await api<ContractDetail>(`/contracts/${s.orderId}`));
      } catch {
        // Không xem được đơn ⇒ chỉ dùng thông tin trên phiếu xuất kho.
      }
    }
    setL((x) => ({
      ...x,
      to: {
        ...x.to,
        company: x.to.company || s.receiverUnit || s.receiverName,
        contact: x.to.contact || (s.receiverUnit && s.receiverUnit !== s.receiverName ? s.receiverName : ''),
        address: x.to.address || s.receiverAddress || '',
      },
    }));
    setM({ stockIssueId: s.id, stockIssueCode: s.code });
    setFilledFrom(`phiếu xuất kho ${s.code}`);
  };
  // Mở từ đơn / phiếu xuất kho: điền một lần khi tải trang.
  if (filledFrom === '' && (orderId || stockIssueId)) {
    setFilledFrom(null);
    if (stockIssueId) api<StockIssueDetail>(`/stock-issues/${stockIssueId}`).then(applyIssue).catch((e: Error) => toast.error(e.message));
    else api<ContractDetail>(`/contracts/${orderId}`).then(applyOrder).catch((e: Error) => toast.error(e.message));
  }
  // Phiếu mới: người gửi mặc định là doanh nghiệp mình.
  if (!senderFilled && company.data) {
    setSenderFilled(true);
    setL((x) => (x.from.company ? x : { ...x, from: { ...x.from, company: company.data!.name, address: company.data!.address ?? '', phone: company.data!.phone ?? '' } }));
  }

  const swap = () => setL((x) => ({ ...x, from: { contact: x.to.contact, phone: x.to.phones, company: x.to.company, address: x.to.address }, to: { contact: x.from.contact, phones: x.from.phone, company: x.from.company, address: x.from.address } }));
  const valid = !!((l.from.company.trim() || l.from.contact.trim()) && l.to.company.trim() && l.to.address.trim());

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

  const save = async () => {
    setBusy('save');
    const body = {
      sendDate: meta.sendDate,
      orderId: meta.orderId,
      stockIssueId: meta.stockIssueId,
      fromContact: l.from.contact,
      fromPhone: l.from.phone,
      fromCompany: l.from.company,
      fromAddress: l.from.address,
      warning: l.warning,
      toCompany: l.to.company,
      toContact: l.to.contact,
      toAddress: l.to.address,
      toPhones: l.to.phones,
      footNote: l.note,
      boxes: l.boxes,
      showBoxNumber: l.showBoxNumber,
      layout: l.layout,
      carrier: meta.carrier,
      carrierPhone: meta.carrierPhone,
      vehicle: meta.vehicle,
      trackingNo: meta.trackingNo,
      freight: meta.freight,
      freightPayer: meta.freightPayer,
      status: meta.status,
      note: meta.remark,
    };
    try {
      const saved = note
        ? await api<ShippingNoteDetail>(`/shipping-notes/${note.id}`, { method: 'PATCH', body })
        : await api<ShippingNoteDetail>('/shipping-notes', { method: 'POST', body });
      toast.success(note ? `Đã lưu phiếu ${saved.code}` : `Đã lưu phiếu gửi hàng ${saved.code}`);
      qc.invalidateQueries({ queryKey: ['shipping-notes'] });
      qc.invalidateQueries({ queryKey: ['shipping-note', saved.id] });
      qc.invalidateQueries({ queryKey: ['stock-issue'] });
      if (!note) router.replace(`/shipping-labels/${saved.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Không lưu được phiếu gửi hàng');
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
              <CardDescription>{filledFrom ? `Đã điền từ ${filledFrom}.` : 'Từ đơn đặt hàng, danh mục đối tác hoặc thông tin doanh nghiệp mình.'}</CardDescription>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chành xe và trạng thái</CardTitle>
            <CardDescription>
              {meta.orderCode || meta.stockIssueCode ? (
                <>
                  Gắn với{' '}
                  {meta.stockIssueId && (
                    <Link href={`/stock-issues/${meta.stockIssueId}`} className="text-primary hover:underline">
                      phiếu xuất kho {meta.stockIssueCode}
                    </Link>
                  )}
                  {meta.stockIssueId && meta.orderId && ' · '}
                  {meta.orderId && (
                    <Link href={`/contracts/${meta.orderId}`} className="text-primary hover:underline">
                      đơn {meta.orderCode}
                    </Link>
                  )}
                  .
                </>
              ) : (
                'Lưu phiếu để theo dõi trong danh sách phiếu gửi hàng.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày gửi">
              <Input type="date" value={meta.sendDate} onChange={(e) => setM({ sendDate: e.target.value })} />
            </Field>
            <Field label="Trạng thái">
              <Select value={meta.status} onValueChange={(v) => setM({ status: v as ShippingNoteStatus })}>
                <SelectTrigger className="w-full" aria-label="Trạng thái">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPPING_NOTE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SHIPPING_NOTE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Chành xe / nhà xe">
              <Input value={meta.carrier} onChange={(e) => setM({ carrier: e.target.value })} />
            </Field>
            <Field label="Điện thoại chành">
              <Input value={meta.carrierPhone} onChange={(e) => setM({ carrierPhone: e.target.value })} />
            </Field>
            <Field label="Biển số xe / tài xế">
              <Input value={meta.vehicle} onChange={(e) => setM({ vehicle: e.target.value })} />
            </Field>
            <Field label="Mã vận đơn / số phiếu chành">
              <Input value={meta.trackingNo} onChange={(e) => setM({ trackingNo: e.target.value })} />
            </Field>
            <Field label="Cước phí (đồng)">
              <Input inputMode="numeric" value={meta.freight} onChange={(e) => setM({ freight: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Bên trả cước">
              <FilterSelect
                className="w-full"
                allLabel="— Chưa xác định —"
                value={meta.freightPayer || undefined}
                onChange={(v) => setM({ freightPayer: v ?? '' })}
                options={Object.entries(FREIGHT_PAYER_LABELS).map(([value, label]) => ({ value, label }))}
                ariaLabel="Bên trả cước"
              />
            </Field>
            <Field label="Ghi chú nội bộ" className="sm:col-span-2">
              <Textarea rows={2} value={meta.remark} onChange={(e) => setM({ remark: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {canSave && (
            <Button disabled={!valid || !!busy} onClick={save}>
              {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} {note ? 'Lưu thay đổi' : 'Lưu phiếu'}
            </Button>
          )}
          <Button variant={canSave ? 'outline' : 'default'} disabled={!valid || !!busy} onClick={() => run('print')}>
            {busy === 'print' ? <Loader2 className="animate-spin" /> : <Printer />} Mở PDF để in
          </Button>
          <Button variant="outline" disabled={!valid || !!busy} onClick={() => run('pdf')}>
            {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
          </Button>
          {!valid && <span className="self-center text-xs text-muted-foreground">Nhập người gửi, công ty và địa chỉ người nhận.</span>}
        </div>
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
