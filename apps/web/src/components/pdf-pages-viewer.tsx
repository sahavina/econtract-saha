'use client';

import { ChevronDown, ChevronUp, Download, Loader2, Minus, Plus } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiRaw, downloadFile } from '@/lib/api';
import { loadPdfjs } from '@/lib/pdf-text';

const ZOOMS = [50, 75, 100, 125, 150, 200] as const;

/** Một trang PDF vẽ lên canvas theo tỉ lệ (bề rộng trang A4 ~ 600px ở 100%). */
function PdfPage({ doc, n, zoom }: { doc: PDFDocumentProxy; n: number; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PDFPageProxy['render']> | null = null;
    (async () => {
      const page = await doc.getPage(n);
      if (cancelled || !ref.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: ((600 / base.width) * zoom) / 100 });
      const ratio = window.devicePixelRatio || 1;
      const canvas = ref.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, n, zoom]);
  return <canvas ref={ref} data-page={n} className="mx-auto block bg-white shadow-sm" aria-label={`Trang ${n}`} />;
}

/**
 * Xem tệp PDF (tải bằng phiên đăng nhập): các trang xếp dọc, chuyển trang, thu phóng, tải xuống.
 * Dùng trong Trung tâm ký kết để xem bản ký số trước khi ký.
 */
export function PdfPagesViewer({ path, fileName }: { path: string; fileName?: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(75);
  const [current, setCurrent] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let task: PDFDocumentLoadingTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [pdfjs, res] = await Promise.all([loadPdfjs(), apiRaw(path)]);
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const d = await task.promise;
        if (!cancelled) setDoc(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không mở được tệp PDF');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [path]);

  const total = doc?.numPages ?? 0;
  const goTo = (n: number) => {
    const page = scroller.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!page || !scroller.current) return;
    scroller.current.scrollTo({ top: page.offsetTop - 12, behavior: 'smooth' });
    setCurrent(n);
  };
  // Trang hiện tại theo vị trí cuộn.
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    const pages = [...box.querySelectorAll<HTMLElement>('[data-page]')];
    const mid = box.scrollTop + box.clientHeight / 3;
    const hit = pages.filter((p) => p.offsetTop <= mid).pop();
    if (hit) setCurrent(Number(hit.dataset.page));
  };
  const zoomStep = (dir: 1 | -1) => setZoom((z) => ZOOMS[Math.min(Math.max(ZOOMS.indexOf(z as (typeof ZOOMS)[number]) + dir, 0), ZOOMS.length - 1)]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <Button variant="ghost" size="icon-sm" aria-label="Trang trước" disabled={current <= 1} onClick={() => goTo(current - 1)}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Trang sau" disabled={!total || current >= total} onClick={() => goTo(current + 1)}>
          <ChevronDown />
        </Button>
        <span className="tabular-nums text-muted-foreground">{total ? `Trang ${current} / ${total}` : '…'}</span>
        <span className="ml-auto flex items-center gap-1 rounded-md border px-1">
          <Button variant="ghost" size="icon-sm" aria-label="Thu nhỏ" disabled={zoom <= ZOOMS[0]} onClick={() => zoomStep(-1)}>
            <Minus />
          </Button>
          <span className="w-12 text-center tabular-nums">{zoom}%</span>
          <Button variant="ghost" size="icon-sm" aria-label="Phóng to" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => zoomStep(1)}>
            <Plus />
          </Button>
        </span>
        <Button variant="ghost" size="sm" onClick={() => downloadFile(path).catch((e: Error) => toast.error(e.message))} title={fileName}>
          <Download /> Tải xuống
        </Button>
      </div>
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 space-y-3 overflow-auto bg-muted/40 p-3">
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {error}
          </p>
        ) : !doc ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          Array.from({ length: total }, (_, i) => <PdfPage key={i + 1} doc={doc} n={i + 1} zoom={zoom} />)
        )}
      </div>
    </div>
  );
}
