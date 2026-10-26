'use client';

import { formatDateVi, orderTotals } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, type Paginated } from '@/lib/api';
import { useCompanyProfile, type CompanyProfile } from '@/lib/company';
import {
  amountText,
  defaultRequestNumber,
  downloadPaymentRequestPdf,
  downloadPaymentRequestWord,
  openPaymentRequestPdf,
  paymentRequestHtml,
  type PaymentRequest,
} from '@/lib/payment-request';
import type { ContractDetail, ContractListItem } from '@/lib/types';

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

/** Giấy đề nghị thanh toán: điền từ đơn đặt hàng/hợp đồng, sửa lại rồi in PDF hoặc tải Word. */
export default function PaymentRequestsPage() {
  const contractId = useSearchParams().get('contract') ?? '';
  return (
    <>
      <PageHeader
        title="Đề nghị thanh toán"
        description="Lập giấy đề nghị thanh toán gửi khách hàng: tự điền từ đơn đặt hàng hoặc hợp đồng, sửa nội dung rồi in PDF hoặc tải Word."
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Đề nghị thanh toán' }]}
      />
      {/* key: mở từ hồ sơ khác thì điền lại từ đầu. */}
      <RequestForm key={contractId} contractId={contractId} />
    </>
  );
}

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

function RequestForm({ contractId }: { contractId: string }) {
  const company = useCompanyProfile();
  const [r, setR] = useState<PaymentRequest>(EMPTY);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [profileApplied, setProfileApplied] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const orders = useQuery({
    queryKey: ['orders', 'payment-picker'],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'ORDER', pageSize: 50 } }),
  });
  const contracts = useQuery({
    queryKey: ['contracts', 'payment-picker'],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { pageSize: 50 } }),
  });
  const contract = useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => api<ContractDetail>(`/contracts/${contractId}`),
    enabled: !!contractId,
  });

  const set = (patch: Partial<PaymentRequest>) => setR((x) => ({ ...x, ...patch }));
  const apply = (c: ContractDetail) => {
    setR((x) => fromContract(c, company.data, x));
    setFilledFrom(c.code);
  };
  // Mở từ một hồ sơ: điền khi dữ liệu về. Không có hồ sơ: lấy thông tin doanh nghiệp mình làm bên thụ hưởng.
  if (contract.data && company.isFetched && filledFrom === null) apply(contract.data);
  if (!contractId && company.data && !profileApplied) {
    const p = company.data;
    setProfileApplied(true);
    setR((x) => ({ ...x, company: p.name, beneficiary: p.name, accountHolder: p.name, account: p.bankAccount ?? '', signerPosition: p.position ?? '', signerName: p.representative ?? '' }));
  }

  const pick = (id?: string) => id && api<ContractDetail>(`/contracts/${id}`).then(apply).catch((e: Error) => toast.error(e.message));
  const options = (list?: ContractListItem[]) => (list ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.parties.find((p) => p.name)?.name ?? c.title}` }));
  const { words } = amountText(r);
  const valid = r.company.trim() && r.recipient.trim() && amountText(r).figure && r.beneficiary.trim();

  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind);
    try {
      await (kind === 'pdf' ? downloadPaymentRequestPdf(r) : openPaymentRequestPdf(r));
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
            <FilterSelect className="w-full" allLabel="Chọn đơn đặt hàng…" value={undefined} onChange={pick} options={options(orders.data?.items)} ariaLabel="Đơn đặt hàng" />
            <FilterSelect className="w-full" allLabel="Chọn hợp đồng…" value={undefined} onChange={pick} options={options(contracts.data?.items)} ariaLabel="Hợp đồng" />
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
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button disabled={!valid || !!busy} onClick={() => run('print')}>
                {busy === 'print' ? <Loader2 className="animate-spin" /> : <Printer />} Mở PDF để in
              </Button>
              <Button variant="outline" disabled={!valid || !!busy} onClick={() => run('pdf')}>
                {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
              </Button>
              <Button variant="outline" disabled={!valid} onClick={() => downloadPaymentRequestWord(r)}>
                <FileText /> Tải Word
              </Button>
              {!valid && <span className="self-center text-xs text-muted-foreground">Nhập công ty, kính gửi, số tiền và đơn vị thụ hưởng.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-sm text-muted-foreground">Xem trước</p>
        <div className="rounded-md border bg-white p-[6%] text-[#111] shadow-sm" style={{ fontSize: 'clamp(11px, 1.05vw, 15px)' }}>
          <div dangerouslySetInnerHTML={{ __html: paymentRequestHtml(r).replace(/font-size:13pt/, 'font-size:1em').replace(/font-size:16pt/, 'font-size:1.25em').replace(/font-size:14pt/, 'font-size:1.08em') }} />
        </div>
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
