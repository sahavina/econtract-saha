'use client';

import { ChevronLeft, ChevronRight, Loader2, MousePointerClick } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRaw } from '@/lib/api';
import { loadPdfjs } from '@/lib/pdf-text';

/** Khung chữ ký số (khớp SIGNATURE_BOX phía API): 180 × 60 pt. */
export const SIG_W = 180;
export const SIG_H = 60;

/** Vị trí khung chữ ký: trang (từ 1) và góc dưới trái khung theo tọa độ PDF (pt, gốc góc dưới trái trang). */
export interface SignaturePlacement {
  page: number;
  x: number;
  y: number;
}

/** Bề rộng tối đa của trang xem trước (px). */
const MAX_WIDTH = 640;

/**
 * Chọn chỗ đặt chữ ký số trên bản PDF sẽ ký: xem từng trang, bấm hoặc kéo để đặt khung chữ ký.
 * Tọa độ quy đổi qua viewport của pdf.js (đúng cả trang xoay), giới hạn trong khổ trang.
 */
export function SignaturePlacer({
  path,
  initial,
  onCancel,
  onConfirm,
}: {
  /** Đường dẫn API tải tệp PDF (kèm phiên đăng nhập). */
  path: string;
  initial: SignaturePlacement | null;
  onCancel: () => void;
  onConfirm: (p: SignaturePlacement) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNo, setPageNo] = useState(initial?.page ?? 0);
  const [place, setPlace] = useState<SignaturePlacement | null>(initial);
  const [view, setView] = useState<{ page: PDFPageProxy; viewport: PageViewport } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Tải tệp PDF một lần.
  useEffect(() => {
    let task: PDFDocumentLoadingTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [pdfjs, res] = await Promise.all([loadPdfjs(), apiRaw(path)]);
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        if (cancelled) return;
        setPdf(doc);
        setPageNo((n) => (n >= 1 && n <= doc.numPages ? n : doc.numPages));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không mở được bản PDF');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [path]);

  // Vẽ trang đang xem vừa bề rộng khung.
  useEffect(() => {
    if (!pdf || pageNo < 1) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy['render']> | null = null;
    (async () => {
      const page = await pdf.getPage(pageNo);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const width = Math.min(MAX_WIDTH, wrapRef.current?.parentElement?.clientWidth ?? MAX_WIDTH);
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await task.promise.catch(() => undefined);
      if (!cancelled) setView({ page, viewport });
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNo]);

  /** Khổ trang theo tọa độ PDF (đã trừ gốc của MediaBox). */
  const bounds = view ? { x0: view.page.view[0], y0: view.page.view[1], w: view.page.view[2] - view.page.view[0], h: view.page.view[3] - view.page.view[1] } : null;

  const placeAt = (clientX: number, clientY: number) => {
    if (!view || !bounds || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const [px, py] = view.viewport.convertToPdfPoint(clientX - r.left, clientY - r.top) as [number, number];
    // Điểm bấm là tâm khung chữ ký; giữ khung nằm trọn trong trang.
    const x = Math.min(Math.max(px - bounds.x0 - SIG_W / 2, 0), Math.max(bounds.w - SIG_W, 0));
    const y = Math.min(Math.max(py - bounds.y0 - SIG_H / 2, 0), Math.max(bounds.h - SIG_H, 0));
    setPlace({ page: pageNo, x: Math.round(x), y: Math.round(y) });
  };

  const box =
    view && bounds && place && place.page === pageNo
      ? (() => {
          const [x1, y1] = view.viewport.convertToViewportPoint(place.x + bounds.x0, place.y + bounds.y0) as [number, number];
          const [x2, y2] = view.viewport.convertToViewportPoint(place.x + bounds.x0 + SIG_W, place.y + bounds.y0 + SIG_H) as [number, number];
          return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        })()
      : null;

  const total = pdf?.numPages ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex max-h-[94vh] flex-col gap-3 sm:max-w-[min(96vw,720px)]">
        <DialogHeader>
          <DialogTitle>Chọn vị trí chữ ký số</DialogTitle>
          <DialogDescription>Bấm vào chỗ muốn đặt chữ ký trên trang (giữ chuột để kéo). Khung xanh là vùng hiển thị chữ ký số.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={pageNo <= 1} onClick={() => setPageNo((n) => n - 1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center tabular-nums">{total ? `Trang ${pageNo}/${total}` : '…'}</span>
            <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={!total || pageNo >= total} onClick={() => setPageNo((n) => n + 1)}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-muted-foreground">
            {place ? `Đã chọn: trang ${place.page}${place.page !== pageNo ? ' (đang xem trang khác)' : ''}` : 'Chưa chọn vị trí'}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-2">
          {error ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              {error}
            </p>
          ) : (
            <div
              ref={wrapRef}
              className="relative mx-auto w-fit cursor-crosshair touch-none bg-white shadow-sm select-none"
              onPointerDown={(e) => {
                placeAt(e.clientX, e.clientY);
                dragging.current = true;
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* một số trình duyệt/thiết bị không cho giữ con trỏ – vẫn đặt được bằng bấm */
                }
              }}
              onPointerMove={(e) => dragging.current && placeAt(e.clientX, e.clientY)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
            >
              <canvas ref={canvasRef} className="block" aria-label={`Trang ${pageNo} của bản PDF`} />
              {!view && (
                <div className="absolute inset-0 flex min-h-64 min-w-64 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {box && (
                <div
                  className="pointer-events-none absolute flex items-center justify-center rounded-sm border-2 border-primary bg-primary/15 text-[10px] font-medium text-primary"
                  style={box}
                >
                  Chữ ký số
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Hủy
          </Button>
          <Button disabled={!place} onClick={() => place && onConfirm(place)}>
            <MousePointerClick /> Dùng vị trí này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
