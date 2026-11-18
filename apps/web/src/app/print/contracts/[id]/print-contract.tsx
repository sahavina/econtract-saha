'use client';

import { buildTemplateValues, renderTemplate } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SignedDocument } from '@/components/signed-document';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { downloadContractPdf } from '@/lib/contract-pdf';
import type { ContractDetail, SignatureRequestInfo, TemplateDetail } from '@/lib/types';

const MISSING_MARK = /<mark data-missing="(?:empty|unknown)">\{\{[^<]*?\}\}<\/mark>/g;

/**
 * Trang in riêng (ngoài khung ứng dụng): chỉ có văn bản khổ A4 và thanh công cụ (ẩn khi in).
 * Không tự gọi window.print() khi tải trang: trình duyệt nhúng có thể mở hộp thoại in ẩn và khóa trang.
 *  - mặc định: nội dung hợp đồng đã thay biến;
 *  - ?doc=signed: bản đã ký hoàn tất kèm chữ ký và chứng thư ký điện tử;
 *  - ?template=<id>: biên bản theo mẫu (giao hàng, xác nhận đơn…) điền từ dữ liệu hồ sơ.
 */
export function PrintContract() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const templateId = params.get('template');
  const signedMode = !templateId && params.get('doc') === 'signed';
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  const contract = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api<ContractDetail>(`/contracts/${id}`),
    enabled: status === 'authenticated',
  });
  const template = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => api<TemplateDetail>(`/templates/${templateId}`),
    enabled: status === 'authenticated' && !!templateId,
  });
  const requests = useQuery({
    queryKey: ['contract', id, 'signature', 'print'],
    queryFn: () => api<SignatureRequestInfo[]>(`/contracts/${id}/signature`),
    enabled: status === 'authenticated' && signedMode,
  });

  const html = useMemo(() => {
    const c = contract.data;
    const source = templateId ? template.data?.contentHtml : c?.contentHtml;
    if (!c || !source) return '';
    const out = renderTemplate(source, buildTemplateValues(c)).html;
    // Biên bản: chỗ chưa có dữ liệu để dòng chấm cho người dùng điền tay khi in.
    return templateId ? out.replace(MISSING_MARK, '……………………') : out;
  }, [contract.data, templateId, template.data]);
  const record = templateId ? template.data : undefined;
  const completed = requests.data?.find((r) => r.status === 'COMPLETED');

  useEffect(() => {
    if (contract.data) document.title = record ? `${record.name} – ${contract.data.code}` : `${contract.data.code} – ${contract.data.title}`;
  }, [contract.data, record]);

  const [exporting, setExporting] = useState(false);
  const downloadPdf = async () => {
    const c = contract.data;
    if (!c) return;
    setExporting(true);
    try {
      await downloadContractPdf(
        signedMode && completed
          ? {
              fileName: `${c.code} - ban da ky`,
              title: `${c.code} – ${c.title} (bản đã ký)`,
              html: completed.contentSnapshot,
              signed: { documentHash: completed.documentHash, signers: completed.signers },
            }
          : record
            ? { fileName: `${c.code} - ${record.name}`, title: `${record.name} – ${c.code}`, html }
            : { fileName: c.code, title: `${c.code} – ${c.title}`, html },
      );
    } catch (e) {
      toast.error(`Không tạo được PDF: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
    } finally {
      setExporting(false);
    }
  };
  const error = contract.error ?? requests.error ?? template.error;
  const loading = status !== 'authenticated' || !contract.data || (signedMode && !requests.data) || (!!templateId && !template.data);
  const empty = !loading && (signedMode ? !completed : !html);

  return (
    <main className="min-h-screen bg-muted/40 print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/contracts/${id}${templateId ? '' : `?tab=${signedMode ? 'signature' : 'content'}`}`}>
              <ArrowLeft /> Quay lại hợp đồng
            </Link>
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {contract.data ? `${contract.data.code} · ${record ? record.name : signedMode ? 'Bản đã ký' : 'Nội dung hợp đồng'}` : ''}
          </p>
          <Button size="sm" variant="outline" disabled={loading || empty} onClick={() => window.print()}>
            <Printer /> In
          </Button>
          <Button size="sm" disabled={loading || empty || exporting} onClick={downloadPdf}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
          </Button>
        </div>
        <p className="mx-auto max-w-[210mm] px-4 pb-2 text-xs text-muted-foreground">
          Tải PDF: tạo file PDF khổ A4 và tải thẳng về máy. In: mở hộp thoại in của trình duyệt (chỉ dùng được trên Chrome/Edge/Firefox, không dùng được trong trình duyệt nhúng).
        </p>
      </div>

      <div className="mx-auto py-6 print:py-0">
        {error ? (
          <p role="alert" className="mx-auto max-w-[210mm] px-4 text-sm text-destructive">
            {error instanceof ApiError ? error.message : templateId ? 'Không tải được hợp đồng hoặc mẫu biên bản.' : 'Không tải được hợp đồng.'}
          </p>
        ) : loading ? (
          <Skeleton className="mx-auto h-[297mm] w-[210mm] max-w-full" />
        ) : empty ? (
          <p className="mx-auto max-w-[210mm] px-4 text-sm text-muted-foreground">
            {signedMode ? 'Hợp đồng chưa có yêu cầu ký đã hoàn tất.' : templateId ? 'Mẫu biên bản chưa có nội dung.' : 'Hợp đồng chưa có nội dung soạn thảo.'}
          </p>
        ) : signedMode && completed ? (
          <SignedDocument snapshot={completed.contentSnapshot} documentHash={completed.documentHash} signers={completed.signers} />
        ) : (
          <div className="a4-page">
            {/* HTML đã được backend làm sạch; giá trị biến được escape khi render. */}
            <div className="contract-content" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>
    </main>
  );
}
