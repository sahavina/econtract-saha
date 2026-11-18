'use client';

import { buildTemplateValues, renderTemplate } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileCheck2, FilePlus2, FileText, Loader2, PenTool, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { DocumentPreviewDialog } from '@/components/document-preview-dialog';
import { anchorFor, MisaEsignDialog } from '@/components/misa-esign-dialog';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, downloadFile } from '@/lib/api';
import { contractPdfFile } from '@/lib/contract-pdf';
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, formatFileSize, setMainDocument, uploadContractDocument } from '@/lib/documents';
import { useMisaStatus } from '@/lib/esign';
import { formatDateTime } from '@/lib/format';
import type { ContractDetail, ContractDocument } from '@/lib/types';


const SCAN_LABELS: Record<ContractDocument['scanStatus'], { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  NOT_SCANNED: { label: 'Chưa quét', variant: 'outline' },
  CLEAN: { label: 'An toàn', variant: 'secondary' },
  INFECTED: { label: 'Nhiễm mã độc', variant: 'destructive' },
};

export function ContractDocumentsTab({
  contractId,
  canManage,
  canDelete = canManage,
  contract,
  canSign = false,
}: {
  contractId: string;
  canManage: boolean;
  /** Để tạo PDF từ nội dung hợp đồng. */
  contract?: ContractDetail;
  /** Hiện nút ký số MISA eSign trên tệp PDF (hợp đồng chưa lưu trữ/xóa). */
  canSign?: boolean;
  /** Sau khi ký xong chỉ được bổ sung, không được xóa tài liệu. */
  canDelete?: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [signing, setSigning] = useState<ContractDocument | null>(null);
  const [viewing, setViewing] = useState<ContractDocument | null>(null);
  const misa = useMisaStatus(canSign);
  const key = ['contract', contractId, 'documents'];
  const docs = useQuery({ queryKey: key, queryFn: () => api<ContractDocument[]>(`/contracts/${contractId}/documents`) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['contract', contractId, 'timeline'] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => uploadContractDocument(contractId, file),
    onSuccess: (d) => {
      invalidate();
      toast.success(`Đã tải lên ${d.fileName} (phiên bản ${d.version})`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/contracts/${contractId}/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast.success('Đã xóa tài liệu');
    },
  });

  const setMain = useMutation({
    mutationFn: (id: string) => setMainDocument(contractId, id),
    onSuccess: () => {
      invalidate();
      toast.success('Đã đặt bản gốc – xem ở tab Nội dung');
    },
  });

  const makePdf = useMutation({
    mutationFn: async () => {
      if (!contract?.contentHtml) throw new Error('Hợp đồng chưa có nội dung');
      const { html } = renderTemplate(contract.contentHtml, buildTemplateValues(contract));
      return uploadContractDocument(contractId, await contractPdfFile({ fileName: contract.code, title: `${contract.code} – ${contract.title}`, html }));
    },
    onSuccess: (d) => {
      invalidate();
      toast.success(`Đã tạo ${d.fileName} (phiên bản ${d.version}) từ nội dung hợp đồng`);
    },
  });

  const onFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.size > DOCUMENT_MAX_BYTES) {
        toast.error(`${file.name}: vượt quá 20 MB`);
        continue;
      }
      await upload.mutateAsync(file).catch(() => undefined);
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept={DOCUMENT_ACCEPT} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label="Chọn tài liệu" />
          <Button onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Tải lên tài liệu
          </Button>
          {contract?.contentHtml && (
            <Button variant="outline" onClick={() => makePdf.mutate()} disabled={makePdf.isPending}>
              {makePdf.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Tạo PDF từ nội dung
            </Button>
          )}
          <span className="text-xs text-muted-foreground">PDF, DOC, DOCX, XLSX, PNG, JPG · tối đa 20 MB · trùng tên sẽ tạo phiên bản mới</span>
        </div>
      )}

      {docs.isError ? (
        <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
      ) : !docs.data ? (
        <Skeleton className="h-32" />
      ) : docs.data.length === 0 ? (
        <EmptyState title="Chưa có tài liệu đính kèm" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên file</TableHead>
                <TableHead>Phiên bản</TableHead>
                <TableHead>Kích thước</TableHead>
                <TableHead>SHA-256</TableHead>
                <TableHead>Quét an toàn</TableHead>
                <TableHead>Người tải lên</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <button type="button" className="inline-flex items-center gap-2 text-left font-medium text-primary hover:underline" title={`Xem ${d.fileName}`} onClick={() => setViewing(d)}>
                      <FileText className="size-4 text-muted-foreground" /> {d.fileName}
                    </button>
                    {d.kind === 'MAIN' && <Badge variant="secondary" className="ml-2">Bản gốc</Badge>}
                  </TableCell>
                  <TableCell>v{d.version}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatFileSize(d.size)}</TableCell>
                  <TableCell>
                    <code className="text-xs" title={d.sha256}>
                      {d.sha256.slice(0, 12)}…
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={SCAN_LABELS[d.scanStatus].variant}>{SCAN_LABELS[d.scanStatus].label}</Badge>
                  </TableCell>
                  <TableCell>{d.uploadedBy.fullName}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(d.createdAt)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canManage && canDelete && d.kind !== 'MAIN' && d.mimeType === 'application/pdf' && (
                      <Button variant="outline" size="sm" className="mr-1" disabled={setMain.isPending} title="Xem, in, tải hồ sơ theo đúng tệp này" onClick={() => setMain.mutate(d.id)}>
                        <FileCheck2 /> Đặt làm bản gốc
                      </Button>
                    )}
                    {canSign && misa.data?.ready && d.mimeType === 'application/pdf' && (
                      <Button variant="outline" size="sm" className="mr-1" onClick={() => setSigning(d)}>
                        <PenTool /> Ký số
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Xem ${d.fileName}`} title="Xem tài liệu" onClick={() => setViewing(d)}>
                      <Eye />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Tải xuống ${d.fileName}`}
                      onClick={() => downloadFile(`/contracts/${contractId}/documents/${d.id}/download`).catch((e: Error) => toast.error(e.message))}
                    >
                      <Download />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa ${d.fileName}`}
                        onClick={() =>
                          setConfirm({
                            title: `Xóa tài liệu ${d.fileName} (v${d.version})?`,
                            description: 'Tài liệu được ẩn khỏi hợp đồng; lịch sử vẫn ghi nhận thao tác.',
                            destructive: true,
                            confirmLabel: 'Xóa',
                            onConfirm: () => remove.mutateAsync(d.id).then(() => undefined),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {viewing && <DocumentPreviewDialog contractId={contractId} doc={viewing} onClose={() => setViewing(null)} />}
      {signing && (
        <MisaEsignDialog
          contractId={contractId}
          doc={signing}
          anchor={contract ? anchorFor(contract.parties.find((p) => p.isInternal)?.role) : undefined}
          onClose={() => setSigning(null)}
          onSigned={() => {
            invalidate();
            setSigning(null);
          }}
        />
      )}
    </div>
  );
}
