'use client';

import { buildTemplateValues, renderTemplate, type TemplateContract, variableLabel } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type Paginated } from '@/lib/api';
import { type CompanyProfile, useCompanyProfile } from '@/lib/company';
import { downloadContractPdf } from '@/lib/contract-pdf';
import type { ContractDetail, ContractKind, ContractListItem, TemplateDetail } from '@/lib/types';

const SAMPLE = '';
const MISSING_MARK = /<mark data-missing="(?:empty|unknown)">\{\{[^<]*?\}\}<\/mark>/g;

/** Dữ liệu mẫu để xem trước: bên A là khách hàng giả định, bên B là doanh nghiệp mình (theo Cài đặt). */
function sampleContract(kind: ContractKind, company: CompanyProfile | undefined): TemplateContract {
  const today = new Date().toISOString().slice(0, 10);
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  return {
    code: kind === 'ORDER' ? 'DDH-MAU-0001' : 'HD-MAU-0001',
    title: kind === 'ORDER' ? 'Đơn đặt hàng mẫu' : 'Hợp đồng mẫu',
    value: '2520000',
    currency: 'VND',
    vatRate: '8',
    expectedSignDate: today,
    effectiveDate: today,
    expiryDate: inDays(365),
    parties: [
      {
        role: 'PARTY_A',
        name: 'CÔNG TY TNHH KHÁCH HÀNG MẪU',
        taxCode: '0101234567',
        address: 'Số 1 đường Mẫu, Phường Mẫu, Thành phố Hà Nội',
        representative: 'Ông Nguyễn Văn A',
        position: 'Giám đốc',
        phone: '0900 000 000',
        email: 'khachhang@example.com',
        bankAccount: '0123456789 – Ngân hàng Mẫu – CN Hà Nội',
      },
      {
        role: 'PARTY_B',
        name: company?.name ?? 'CÔNG TY CỦA BẠN',
        taxCode: company?.taxCode,
        address: company?.address,
        representative: company?.representative,
        position: company?.position,
        phone: company?.phone,
        email: company?.email,
        bankAccount: company?.bankAccount,
      },
    ],
    items: [
      { code: 'SP-01', name: 'Keo silicone trung tính 300ml', unit: 'Chai', quantity: '24', unitPrice: '60000' },
      { code: 'SP-02', name: 'Keo bọt nở PU 750ml', unit: 'Chai', quantity: '10', unitPrice: '108000' },
    ],
    parentContract: kind === 'ORDER' ? { code: '01/HĐNT/MAU-SAHA', signedDate: inDays(-30) } : null,
    deliveryDate: inDays(3),
    deliveryAddress: 'Kho công trình mẫu, Phường Mẫu, Thành phố Hà Nội',
    paymentTerms: 'Thanh toán 100% bằng chuyển khoản trước khi giao hàng',
  };
}

/**
 * Xem trước mẫu trên trang A4 với dữ liệu mẫu hoặc dữ liệu một đơn/hợp đồng có sẵn (không lưu gì).
 * `html` truyền vào khi xem nội dung đang soạn (chưa lưu); không truyền thì tải nội dung mẫu đã lưu.
 */
export function TemplatePreviewDialog({
  templateId,
  html,
  kind,
  open,
  onClose,
}: {
  templateId: string;
  html?: string;
  kind: ContractKind;
  open: boolean;
  onClose: () => void;
}) {
  const company = useCompanyProfile(open);
  const [sourceId, setSourceId] = useState(SAMPLE);
  const [exporting, setExporting] = useState(false);
  const template = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => api<TemplateDetail>(`/templates/${templateId}`),
    enabled: open,
  });
  const sources = useQuery({
    queryKey: ['contracts', 'template-preview', kind],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind, pageSize: 50 } }),
    enabled: open,
  });
  const source = useQuery({
    queryKey: ['contract', sourceId],
    queryFn: () => api<ContractDetail>(`/contracts/${sourceId}`),
    enabled: open && !!sourceId,
  });

  const content = html ?? template.data?.contentHtml;
  const data = sourceId ? source.data : sampleContract(kind, company.data);
  const rendered = content !== undefined && data ? renderTemplate(content, buildTemplateValues(data)) : null;
  const name = template.data ? `${template.data.code} · ${template.data.name}` : '';
  const noun = kind === 'ORDER' ? 'đơn đặt hàng' : 'hợp đồng';

  const exportPdf = async () => {
    if (!rendered) return;
    setExporting(true);
    try {
      await downloadContractPdf({
        fileName: `Xem truoc ${template.data?.code ?? 'mau'}`,
        title: `Xem trước mẫu ${template.data?.code ?? ''}`,
        html: rendered.html.replace(MISSING_MARK, '……'),
      });
    } catch (e) {
      toast.error(`Không tạo được PDF: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-[min(96vw,980px)] overflow-hidden p-0 sm:max-w-[min(96vw,980px)]">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b px-5 pt-5 pb-3">
            <DialogTitle>Xem trước mẫu{name && ` ${name}`}</DialogTitle>
            <DialogDescription>
              {html !== undefined ? 'Nội dung đang soạn (kể cả phần chưa lưu). ' : ''}Biến {'{{…}}'} được điền bằng dữ liệu mẫu hoặc một {noun} có sẵn; phần tô vàng là biến chưa có dữ liệu.
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <FilterSelect
                className="w-full sm:w-96"
                allLabel="Dữ liệu mẫu (khách hàng giả định)"
                value={sourceId || undefined}
                onChange={(v) => setSourceId(v ?? SAMPLE)}
                options={(sources.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.parties[0]?.name ?? c.title}` }))}
                ariaLabel={`Dữ liệu xem trước: dữ liệu mẫu hoặc ${noun} có sẵn`}
              />
              <Button variant="outline" size="sm" disabled={!rendered || exporting} onClick={exportPdf}>
                {exporting ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF xem trước
              </Button>
            </div>
            {rendered && rendered.missing.length + rendered.unknown.length > 0 && (
              <p className="pt-1 text-xs text-amber-700 dark:text-amber-400">
                Chưa có dữ liệu: {[...rendered.missing, ...rendered.unknown].map((k) => variableLabel(k)).join(', ')}.
              </p>
            )}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
            {rendered ? (
              <div className="a4-page">
                {/* HTML mẫu đã được backend làm sạch (hoặc nội dung đang soạn từ trình soạn thảo); giá trị biến được escape. */}
                <div className="contract-content" dangerouslySetInnerHTML={{ __html: rendered.html }} />
              </div>
            ) : (
              <Skeleton className="mx-auto h-[297mm] w-[210mm] max-w-full" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
