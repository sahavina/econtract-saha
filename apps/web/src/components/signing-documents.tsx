'use client';

import { AlertTriangle, Download, Eye, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatFileSize, sha256Hex } from '@/lib/documents';
import type { PublicSignDocument } from '@/lib/types';

const PREVIEWABLE = new Set(['application/pdf', 'image/png', 'image/jpeg']);

interface Loaded {
  url: string;
  /** File nhận được có cùng SHA-256 với bản đã đóng băng khi gửi ký hay không. */
  verified: boolean;
}

/**
 * Tài liệu đính kèm của yêu cầu ký cho người ký bên ngoài: xem PDF/ảnh ngay trên trang, tải bản gốc.
 * Mỗi file được tải một lần, trình duyệt tự tính SHA-256 để đối chiếu với mã đã đóng băng.
 */
export function SigningDocuments({
  token,
  documents,
  onOpened,
}: {
  token: string;
  documents: PublicSignDocument[];
  /** Gọi khi một tài liệu được mở/tải lần đầu. */
  onOpened?: (documentId: string) => void;
}) {
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PublicSignDocument | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const load = async (doc: PublicSignDocument): Promise<Loaded | null> => {
    if (loaded[doc.id]) return loaded[doc.id];
    setBusy(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/public/sign/${token}/documents/${doc.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? 'Không tải được tài liệu');
      }
      const data = await res.arrayBuffer();
      const verified = (await sha256Hex(data)) === doc.sha256;
      const url = URL.createObjectURL(new Blob([data], { type: doc.mimeType }));
      urls.current.push(url);
      const item = { url, verified };
      setLoaded((x) => ({ ...x, [doc.id]: item }));
      onOpened?.(doc.id);
      return item;
    } catch (e) {
      setError(`${doc.fileName}: ${e instanceof Error ? e.message : 'Không tải được tài liệu'}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const view = async (doc: PublicSignDocument) => {
    if (await load(doc)) setViewing(doc);
  };

  const download = async (doc: PublicSignDocument) => {
    const item = await load(doc);
    if (!item) return;
    const a = document.createElement('a');
    a.href = item.url;
    a.download = doc.fileName;
    a.click();
  };

  if (!documents.length) return null;
  const current = viewing && loaded[viewing.id];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tài liệu hợp đồng ({documents.length})</CardTitle>
        <CardDescription>Vui lòng đọc kỹ các tài liệu trước khi ký. Đây đúng là các file tại thời điểm gửi yêu cầu ký.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y rounded-md border">
          {documents.map((d) => {
            const item = loaded[d.id];
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={d.fileName}>
                    {d.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Phiên bản {d.version} · {formatFileSize(d.size)}
                  </p>
                  {item &&
                    (item.verified ? (
                      <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="size-3.5" /> Đã xác minh: khớp mã băm khi gửi ký
                      </p>
                    ) : (
                      <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3.5" /> Cảnh báo: file nhận được không khớp mã băm đã đóng băng – không nên ký, hãy liên hệ bên gửi
                      </p>
                    ))}
                </div>
                <div className="flex gap-1.5">
                  {PREVIEWABLE.has(d.mimeType) && (
                    <Button variant="outline" size="sm" disabled={busy === d.id} onClick={() => view(d)}>
                      {busy === d.id ? <Loader2 className="animate-spin" /> : <Eye />} Xem
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={busy === d.id} onClick={() => download(d)} aria-label={`Tải về ${d.fileName}`}>
                    <Download /> Tải về
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex h-[90vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewing?.fileName}</DialogTitle>
            <DialogDescription>Phiên bản {viewing?.version} · SHA-256 {viewing?.sha256}</DialogDescription>
          </DialogHeader>
          {viewing && current && (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
              {viewing.mimeType === 'application/pdf' ? (
                <iframe src={current.url} title={viewing.fileName} className="size-full min-h-[60vh]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh từ blob URL, không qua Next Image
                <img src={current.url} alt={viewing.fileName} className="mx-auto max-w-full" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
