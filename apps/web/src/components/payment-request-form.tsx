'use client';

import { buildTemplateValues, formatDateVi, orderTotals, PAYMENT_REQUEST_STATUS_LABELS, PAYMENT_REQUEST_STATUSES, type PaymentRequestStatus, renderTemplate } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Loader2, Printer, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ContractSearchSelect } from '@/components/contract-search-select';
import { FilterSelect } from '@/components/filter-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyProfile, type CompanyProfile } from '@/lib/company';
import { contractPdfFile, downloadContractPdf } from '@/lib/contract-pdf';
import {
  amountDigits,
  amountText,
  defaultRequestNumber,
  downloadPaymentRequestPdf,
  downloadPaymentRequestWord,
  fileBase,
  openPaymentRequestPdf,
  paymentRequestHtml,
  paymentValues,
  requestFromSaved,
  type PaymentRequest,
} from '@/lib/payment-request';
import type { ContractDetail, PaymentRequestDetail, QuoteDetail, TemplateDetail, TemplateListItem } from '@/lib/types';

/** Mẫu dựng sẵn theo giấy đề nghị SAHA (không thuộc thư viện mẫu). */
const BUILT_IN = '';
const MISSING_MARK = /<mark data-missing="(?:empty|unknown)">\{\{[^<]*?\}\}<\/mark>/g;
/** Chỉ mẫu dành cho đề nghị thanh toán: mã có "DNTT" hoặc tên có "đề nghị thanh toán". */
const isPaymentTemplate = (t: TemplateListItem) => /DNTT/i.test(t.code) || /đề nghị thanh toán/i.test(t.name);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const EMPTY: PaymentRequest = {
  company: '',
  number: defaultRequestNumber(today()),
  place: 'Hà Nội',
  date: today(),
  recipient: '',
  basis: '',
  amount: '',
  beneficiary: '',
  account: '',
  accountHolder: '',
  signerPosition: '',
  signerName: '',
};

/** Giá trị cần thanh toán: đơn hàng = tổng gồm VAT theo các dòng hàng; hợp đồng = giá trị hợp đồng. Bỏ phần lẻ đồng. */
function payableAmount(c: ContractDetail): string {
  const value = c.kind === 'ORDER' && c.items.length ? orderTotals(c.items, c.vatRate).total : c.value;
  return String(Math.round(Number(value) || 0) || '');
}

function fromContract(c: ContractDetail, profile: CompanyProfile | undefined, x: PaymentRequest): PaymentRequest {
  const own = c.parties.find((p) => p.isInternal);
  const customer = c.parties.find((p) => !p.isInternal) ?? c.parties[0];
  const company = own?.name || profile?.name || x.company;
  const isOrder = c.kind === 'ORDER';
  const date = formatDateVi(isOrder ? c.expectedSignDate : (c.signedDate ?? c.expectedSignDate));
  const doc = isOrder ? `đơn đặt hàng số ${c.code}${date ? ` ngày ${date}` : ''}` : `hợp đồng số ${c.code}${date ? ` ký ngày ${date}` : ''}`;
  return {
    ...x,
    company,
    recipient: customer?.name ?? '',
    basis: `Căn cứ vào ${doc} giữa ${company} và ${customer?.name ?? '…'}.`,
    amount: payableAmount(c),
    beneficiary: company,
    account: own?.bankAccount || profile?.bankAccount || x.account,
    accountHolder: company,
    signerPosition: own?.position || profile?.position || x.signerPosition,
    signerName: own?.representative || profile?.representative || x.signerName,
  };
}

/** Giấy đề nghị thanh toán: điền từ đơn đặt hàng/hợp đồng, sửa lại, lưu vào danh sách, in PDF hoặc tải Word. */
export function PaymentRequestForm({ contractId = '', quoteId = '', saved }: { contractId?: string; quoteId?: string; saved?: PaymentRequestDetail }) {
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const company = useCompanyProfile();
  const linkedId = saved?.contractId ?? contractId;
  const [r, setR] = useState<PaymentRequest>(saved ? requestFromSaved(saved) : EMPTY);
  // Chỉ gửi trạng thái khi người dùng đổi ở đây; nút Đã gửi/Đã thanh toán đổi trạng thái ngay trên máy chủ.
  const [pickedStatus, setPickedStatus] = useState<PaymentRequestStatus | null>(null);
  const status = pickedStatus ?? saved?.status ?? 'DRAFT';
  // Đề nghị đã lưu: giữ nguyên nội dung, không điền lại từ hồ sơ.
  const [filledFrom, setFilledFrom] = useState<string | null>(saved ? (saved.contract?.code ?? '') : null);
  const [profileApplied, setProfileApplied] = useState(!!saved);
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const [picked, setPicked] = useState<ContractDetail | null>(null);
  const [templateId, setTemplateId] = useState(saved?.templateId ?? BUILT_IN);
  const templates = useQuery({
    queryKey: ['templates', 'payment-picker'],
    queryFn: () => api<Paginated<TemplateListItem>>('/templates', { query: { status: 'ACTIVE', pageSize: 100 } }),
  });
  const template = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => api<TemplateDetail>(`/templates/${templateId}`),
    enabled: templateId !== BUILT_IN,
  });
  const contract = useQuery({
    queryKey: ['contract', linkedId],
    queryFn: () => api<ContractDetail>(`/contracts/${linkedId}`),
    enabled: !!linkedId,
  });
  const source = picked ?? contract.data ?? null;
  const quote = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => api<QuoteDetail>(`/quotes/${encodeURIComponent(quoteId)}`),
    enabled: !!quoteId,
  });
  const [quoteApplied, setQuoteApplied] = useState(false);

  const set = (patch: Partial<PaymentRequest>) => setR((x) => ({ ...x, ...patch }));
  const apply = (c: ContractDetail) => {
    setR((x) => fromContract(c, company.data, x));
    setPicked(c);
    setFilledFrom(c.code);
  };
  // Mở từ một hồ sơ: điền khi dữ liệu về. Không có hồ sơ: lấy thông tin doanh nghiệp mình làm bên thụ hưởng.
  if (contract.data && company.isFetched && filledFrom === null) apply(contract.data);
  if (!linkedId && company.data && !profileApplied) {
    const p = company.data;
    setProfileApplied(true);
    setR((x) => ({ ...x, company: p.name, beneficiary: p.name, accountHolder: p.name, account: p.bankAccount ?? '', signerPosition: p.position ?? '', signerName: p.representative ?? '' }));
  }

  // Lập từ báo giá: khách hàng, căn cứ, số tiền theo báo giá; điền sau thông tin doanh nghiệp mình.
  if (quote.data && company.isFetched && profileApplied && !quoteApplied) {
    const q = quote.data;
    setQuoteApplied(true);
    setR((x) => ({
      ...x,
      recipient: q.customerName,
      basis: `Căn cứ vào báo giá số ${q.code}${formatDateVi(q.date) ? ` ngày ${formatDateVi(q.date)}` : ''} giữa ${x.company || '…'} và ${q.customerName}.`,
      amount: String(Math.round(Number(q.total)) || ''),
    }));
    setFilledFrom(q.code);
  }

  const pick = (id: string) => api<ContractDetail>(`/contracts/${id}`).then(apply).catch((e: Error) => toast.error(e.message));
  const { words } = amountText(r);
  const valid = r.company.trim() && r.recipient.trim() && amountText(r).figure && r.beneficiary.trim();

  // Mẫu từ thư viện: biến hợp đồng/đơn hàng lấy từ hồ sơ đã chọn, biến {{payment.*}} lấy theo nội dung đang nhập.
  const tpl = templateId !== BUILT_IN ? template.data : undefined;
  const rendered = tpl ? renderTemplate(tpl.contentHtml, { ...(source ? buildTemplateValues(source) : {}), ...paymentValues(r) }) : null;
  const finalHtml = rendered ? rendered.html.replace(MISSING_MARK, '……') : null;
  const templateOptions = (templates.data?.items ?? []).filter(isPaymentTemplate).map((t) => ({ value: t.id, label: `${t.code} · ${t.name}` }));
  // Mẫu đã lưu có thể không còn ở trạng thái đang sử dụng.
  if (tpl && !templateOptions.some((o) => o.value === tpl.id)) templateOptions.unshift({ value: tpl.id, label: `${tpl.code} · ${tpl.name}` });

  const save = useMutation({
    mutationFn: () => {
      const body = { ...r, amount: amountDigits(r.amount), contractId: source?.id ?? null, templateId: templateId || null, ...(pickedStatus && { status: pickedStatus }) };
      return saved ? api<{ id: string }>(`/payment-requests/${saved.id}`, { method: 'PATCH', body }) : api<{ id: string }>('/payment-requests', { method: 'POST', body });
    },
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
      qc.invalidateQueries({ queryKey: ['payment-request', x.id] });
      setPickedStatus(null);
      toast.success(saved ? 'Đã lưu thay đổi' : `Đã lưu đề nghị thanh toán ${r.number}`);
      if (!saved) router.replace(`/payment-requests/${x.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind);
    try {
      if (finalHtml) {
        const input = { fileName: fileBase(r), title: `Đề nghị thanh toán ${r.number}`, html: finalHtml };
        if (kind === 'pdf') await downloadContractPdf(input);
        else {
          const url = URL.createObjectURL(await contractPdfFile(input));
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      } else await (kind === 'pdf' ? downloadPaymentRequestPdf(r) : openPaymentRequestPdf(r));
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
          <CardHeader>
            <CardTitle className="text-base">Lấy dữ liệu từ</CardTitle>
            <CardDescription>{filledFrom ? `Đã điền từ ${filledFrom}. Có thể sửa lại mọi nội dung bên dưới.` : 'Chọn đơn đặt hàng hoặc hợp đồng để tự điền khách hàng, căn cứ và số tiền.'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Mẫu đề nghị</span>
              <FilterSelect className="w-full" allLabel="Mẫu SAHA dựng sẵn" value={templateId || undefined} onChange={(id) => setTemplateId(id ?? BUILT_IN)} options={templateOptions} ariaLabel="Mẫu đề nghị" />
              <span className="block text-xs text-muted-foreground">
                {tpl
                  ? `Mẫu ${tpl.code} v${tpl.version}: nội dung bên dưới điền vào các biến {{payment.*}}; biến hợp đồng/đơn hàng lấy từ hồ sơ đã chọn.`
                  : 'Hoặc chọn mẫu đề nghị thanh toán đang sử dụng trong Mẫu hợp đồng (mã có “DNTT” hoặc tên có “đề nghị thanh toán”).'}
              </span>
            </label>
            <ContractSearchSelect kind="ORDER" placeholder="Chọn đơn đặt hàng…" selected={source?.kind === 'ORDER' ? source.code : undefined} onPick={pick} />
            <ContractSearchSelect kind="CONTRACT" placeholder="Chọn hợp đồng…" selected={source?.kind === 'CONTRACT' ? source.code : undefined} onPick={pick} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nội dung đề nghị</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Công ty đề nghị *" className="sm:col-span-2">
              <Input value={r.company} onChange={(e) => set({ company: e.target.value })} />
            </Field>
            <Field label="Số">
              <Input value={r.number} onChange={(e) => set({ number: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_1.2fr] gap-2">
              <Field label="Nơi lập">
                <Input value={r.place} onChange={(e) => set({ place: e.target.value })} />
              </Field>
              <Field label="Ngày">
                <Input type="date" value={r.date} onChange={(e) => set({ date: e.target.value, number: r.number === defaultRequestNumber(r.date) ? defaultRequestNumber(e.target.value) : r.number })} />
              </Field>
            </div>
            <Field label="Kính gửi *" className="sm:col-span-2">
              <Input value={r.recipient} onChange={(e) => set({ recipient: e.target.value })} />
            </Field>
            <Field label="Căn cứ" className="sm:col-span-2">
              <Textarea rows={3} value={r.basis} onChange={(e) => set({ basis: e.target.value })} placeholder="Căn cứ vào báo giá … ngày … giữa … và …" />
            </Field>
            <Field label="Số tiền (đồng) *" className="sm:col-span-2" hint={words || 'Số tiền bằng chữ tự đọc theo số đã nhập.'}>
              <Input inputMode="numeric" value={amountText(r).figure.replace(/ đồng$/, '')} onChange={(e) => set({ amount: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tài khoản thụ hưởng và người ký</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Đơn vị thụ hưởng *" className="sm:col-span-2">
              <Input value={r.beneficiary} onChange={(e) => set({ beneficiary: e.target.value })} />
            </Field>
            <Field label="Tài khoản – ngân hàng" className="sm:col-span-2" hint="VD: 921019999 - Ngân hàng MB - chi nhánh Thanh Xuân">
              <Input value={r.account} onChange={(e) => set({ account: e.target.value })} />
            </Field>
            <Field label="Chủ tài khoản" className="sm:col-span-2">
              <Input value={r.accountHolder} onChange={(e) => set({ accountHolder: e.target.value })} />
            </Field>
            <Field label="Chức vụ người ký">
              <Input value={r.signerPosition} onChange={(e) => set({ signerPosition: e.target.value })} placeholder="Giám đốc" />
            </Field>
            <Field label="Họ tên người ký">
              <Input value={r.signerName} onChange={(e) => set({ signerName: e.target.value })} />
            </Field>
            {saved && can('payment_request.manage') && (
              <Field label="Trạng thái" className="sm:col-span-2">
                <Select value={status} onValueChange={(v) => setPickedStatus(v as PaymentRequestStatus)}>
                  <SelectTrigger className="w-full" aria-label="Trạng thái"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_REQUEST_STATUSES.map((s) => <SelectItem key={s} value={s}>{PAYMENT_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {can('payment_request.manage') && (
                <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {saved ? 'Lưu thay đổi' : 'Lưu đề nghị'}
                </Button>
              )}
              <Button variant="outline" disabled={!valid || !!busy} onClick={() => run('print')}>
                {busy === 'print' ? <Loader2 className="animate-spin" /> : <Printer />} Mở PDF để in
              </Button>
              <Button variant="outline" disabled={!valid || !!busy} onClick={() => run('pdf')}>
                {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
              </Button>
              <Button variant="outline" disabled={!valid} onClick={() => downloadPaymentRequestWord(r, finalHtml ?? undefined)}>
                <FileText /> Tải Word
              </Button>
              {!valid && <span className="self-center text-xs text-muted-foreground">Nhập công ty, kính gửi, số tiền và đơn vị thụ hưởng.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-sm text-muted-foreground">Xem trước</p>
        {rendered ? (
          <div className="a4-page">
            {/* HTML mẫu đã được backend làm sạch; giá trị biến được escape khi render. */}
            <div className="contract-content" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          </div>
        ) : templateId !== BUILT_IN ? (
          <p className="text-sm text-muted-foreground">Đang tải mẫu…</p>
        ) : (
        <div className="rounded-md border bg-white p-[6%] text-[#111] shadow-sm" style={{ fontSize: 'clamp(11px, 1.05vw, 15px)' }}>
          <div dangerouslySetInnerHTML={{ __html: paymentRequestHtml(r).replace(/font-size:13pt/, 'font-size:1em').replace(/font-size:16pt/, 'font-size:1.25em').replace(/font-size:14pt/, 'font-size:1.08em') }} />
        </div>
        )}
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
