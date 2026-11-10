'use client';

import type { DocBlock } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { apiRaw, downloadFile } from '@/lib/api';
import { convertDocToDocx, readDocx } from '@/lib/docx';
import { formatFileSize } from '@/lib/documents';
import { readXlsx } from '@/lib/xlsx';
import type { ContractDocument } from '@/lib/types';

type Preview =
  | { type: 'pdf'; url: string }
  | { type: 'image'; url: string }
  | { type: 'html'; html: string }
  | { type: 'blocks'; blocks: DocBlock[] };

/** Tải tệp bằng phiên đăng nhập rồi dựng bản xem theo loại tệp (không có đường dẫn công khai đến tệp). */
async function loadPreview(path: string, doc: ContractDocument): Promise<Preview> {
  const blob = await (await apiRaw(path)).blob();
  const name = doc.fileName.toLowerCase();
  if (name.endsWith('.pdf')) return { type: 'pdf', url: URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })) };
  if (/\.(png|jpe?g)$/.test(name)) return { type: 'image', url: URL.createObjectURL(blob) };
  if (name.endsWith('.xlsx')) {
    const sheet = await readXlsx(new File([blob], doc.fileName));
    if (!sheet) throw new Error('Không đọc được tệp Excel – hãy tải xuống để xem');
    return { type: 'blocks', blocks: sheet.blocks };
  }
  // .doc được máy chủ chuyển sang .docx trước khi đọc.
  const docx = name.endsWith('.doc') ? await convertDocToDocx(new File([blob], doc.fileName)) : blob;
  const content = await readDocx(docx);
  if (!content) throw new Error('Không đọc được tệp Word – hãy tải xuống để xem');
  return { type: 'html', html: content.html };
}

function useDocumentPreview(contractId: string, doc: ContractDocument) {
  const path = `/contracts/${contractId}/documents/${doc.id}/download`;
  const preview = useQuery({
    queryKey: ['contract', contractId, 'documents', doc.id, 'preview'],
    queryFn: () => loadPreview(path, doc),
    // URL tạm bị thu hồi khi đóng nên không dùng lại từ bộ nhớ đệm.
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  const data = preview.data;
  const url = data && 'url' in data ? data.url : null;
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return { path, preview, data, url };
}

/** Bản gốc (PDF) của hồ sơ hiển thị ngay trong trang, đúng định dạng file khách gửi. */
export function MainDocumentFrame({ contractId, doc }: { contractId: string; doc: ContractDocument }) {
  const { preview, data } = useDocumentPreview(contractId, doc);
  if (preview.isError) return <ErrorState error={preview.error} onRetry={() => preview.refetch()} />;
  if (!data || data.type !== 'pdf') return <Skeleton className="h-[80vh]" />;
  return <iframe src={data.url} title={doc.fileName} className="h-[80vh] w-full rounded-lg border" />;
}

/** Xem tài liệu ngay trên trang: PDF, ảnh, Word, Excel. */
export function DocumentPreviewDialog({ contractId, doc, onClose }: { contractId: string; doc: ContractDocument; onClose: () => void }) {
  const { path, preview, data, url } = useDocumentPreview(contractId, doc);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[92vh] max-w-[min(96vw,1100px)] flex-col gap-3 p-4 sm:max-w-[min(96vw,1100px)]">
        <DialogHeader>
          <DialogTitle className="truncate pr-8" title={doc.fileName}>{doc.fileName}</DialogTitle>
          <DialogDescription>
            Phiên bản {doc.version} · {formatFileSize(doc.size)}
            {data?.type === 'html' || data?.type === 'blocks' ? ' · Bản xem nhanh, định dạng có thể khác tệp gốc' : ''}
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => downloadFile(path).catch((e: Error) => toast.error(e.message))}>
              <Download /> Tải xuống
            </Button>
            {url && (
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Mở tab mới
                </a>
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
          {preview.isError ? (
            <div className="p-4"><ErrorState error={preview.error} onRetry={() => preview.refetch()} /></div>
          ) : !data ? (
            <Skeleton className="h-full w-full" />
          ) : data.type === 'pdf' ? (
            <iframe src={data.url} title={doc.fileName} className="h-full w-full border-0" />
          ) : data.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh từ blob tạm, không qua tối ưu ảnh của Next.
            <img src={data.url} alt={doc.fileName} className="mx-auto max-w-full" />
          ) : data.type === 'html' ? (
            <div className="a4-page">
              {/* HTML do readDocx tạo, văn bản đã được escape. */}
              <div className="contract-content" dangerouslySetInnerHTML={{ __html: data.html }} />
            </div>
          ) : (
            <div className="space-y-3 bg-background p-3 text-sm">
              {data.blocks.map((b, i) =>
                b.type === 'p' ? (
                  <p key={i}>{b.text}</p>
                ) : (
                  <Table key={i}>
                    <TableBody>
                      {b.rows.map((row, r) => (
                        <TableRow key={r}>{row.map((cell, c) => <TableCell key={c} className="border">{cell}</TableCell>)}</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ),
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
