'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, downloadFile } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ContractDocument } from '@/lib/types';

const ACCEPT = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg';
const MAX_BYTES = 20 * 1024 * 1024;

const SCAN_LABELS: Record<ContractDocument['scanStatus'], { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  NOT_SCANNED: { label: 'Chưa quét', variant: 'outline' },
  CLEAN: { label: 'An toàn', variant: 'secondary' },
  INFECTED: { label: 'Nhiễm mã độc', variant: 'destructive' },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ContractDocumentsTab({
  contractId,
  canManage,
  canDelete = canManage,
}: {
  contractId: string;
  canManage: boolean;
  /** Sau khi ký xong chỉ được bổ sung, không được xóa tài liệu. */
  canDelete?: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const key = ['contract', contractId, 'documents'];
  const docs = useQuery({ queryKey: key, queryFn: () => api<ContractDocument[]>(`/contracts/${contractId}/documents`) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['contract', contractId, 'timeline'] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api<ContractDocument>(`/contracts/${contractId}/documents`, { method: 'POST', formData: fd });
    },
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

  const onFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.size > MAX_BYTES) {
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
          <input ref={input} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label="Chọn tài liệu" />
          <Button onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Tải lên tài liệu
          </Button>
          <span className="text-xs text-muted-foreground">PDF, DOCX, XLSX, PNG, JPG · tối đa 20 MB · trùng tên sẽ tạo phiên bản mới</span>
        </div>
      )}

      {docs.isError ? (
        <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
      ) : !docs.data ? (
        <Skeleton className="h-32" />
      ) : docs.data.length === 0 ? (
        <EmptyState title="Chưa có tài liệu đính kèm" />
      ) : (
        <div className="rounded-lg border">
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
                    <span className="inline-flex items-center gap-2 font-medium">
                      <FileText className="size-4 text-muted-foreground" /> {d.fileName}
                    </span>
                  </TableCell>
                  <TableCell>v{d.version}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatSize(d.size)}</TableCell>
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
    </div>
  );
}
