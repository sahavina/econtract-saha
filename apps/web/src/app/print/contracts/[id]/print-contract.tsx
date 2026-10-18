'use client';

import { buildTemplateValues, renderTemplate } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { SignedDocument } from '@/components/signed-document';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ContractDetail, SignatureRequestInfo } from '@/lib/types';

/**
 * Trang in riêng (ngoài khung ứng dụng): chỉ có văn bản khổ A4 và thanh công cụ (ẩn khi in).
 * Không tự gọi window.print() khi tải trang: trình duyệt nhúng có thể mở hộp thoại in ẩn và khóa trang.
 *  - mặc định: nội dung hợp đồng đã thay biến;
 *  - ?doc=signed: bản đã ký hoàn tất kèm chữ ký và chứng thư ký điện tử.
 */
export function PrintContract() {
  const { id } = useParams<{ id: string }>();
  const signedMode = useSearchParams().get('doc') === 'signed';
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
  const requests = useQuery({
    queryKey: ['contract', id, 'signature', 'print'],
    queryFn: () => api<SignatureRequestInfo[]>(`/contracts/${id}/signature`),
    enabled: status === 'authenticated' && signedMode,
  });

  const html = useMemo(() => {
    const c = contract.data;
    return c?.contentHtml ? renderTemplate(c.contentHtml, buildTemplateValues(c)).html : '';
  }, [contract.data]);
  const completed = requests.data?.find((r) => r.status === 'COMPLETED');

  useEffect(() => {
    if (contract.data) document.title = `${contract.data.code} – ${contract.data.title}`;
  }, [contract.data]);

  const error = contract.error ?? requests.error;
  const loading = status !== 'authenticated' || !contract.data || (signedMode && !requests.data);
  const empty = !loading && (signedMode ? !completed : !html);

  return (
    <main className="min-h-screen bg-muted/40 print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/contracts/${id}?tab=${signedMode ? 'signature' : 'content'}`}>
              <ArrowLeft /> Quay lại hợp đồng
            </Link>
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {contract.data ? `${contract.data.code} · ${signedMode ? 'Bản đã ký' : 'Nội dung hợp đồng'}` : ''}
          </p>
          <Button size="sm" disabled={loading || empty} onClick={() => window.print()}>
            <Printer /> In / Lưu PDF
          </Button>
        </div>
        <p className="mx-auto max-w-[210mm] px-4 pb-2 text-xs text-muted-foreground">
          Để lưu PDF: bấm In / Lưu PDF rồi chọn máy in “Lưu dưới dạng PDF” (Save as PDF), khổ A4, tắt “Đầu trang và chân trang”.
        </p>
      </div>

      <div className="mx-auto py-6 print:py-0">
        {error ? (
          <p role="alert" className="mx-auto max-w-[210mm] px-4 text-sm text-destructive">
            {error instanceof ApiError ? error.message : 'Không tải được hợp đồng.'}
          </p>
        ) : loading ? (
          <Skeleton className="mx-auto h-[297mm] w-[210mm] max-w-full" />
        ) : empty ? (
          <p className="mx-auto max-w-[210mm] px-4 text-sm text-muted-foreground">
            {signedMode ? 'Hợp đồng chưa có yêu cầu ký đã hoàn tất.' : 'Hợp đồng chưa có nội dung soạn thảo.'}
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
