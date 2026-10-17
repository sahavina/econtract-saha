'use client';

import { Eraser } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface SignatureMark {
  signatureImage?: string;
  typedName?: string;
}

/** Ô ký: vẽ tay bằng chuột/cảm ứng (xuất PNG) hoặc gõ họ tên. */
export function SignaturePad({ defaultName, onChange }: { defaultName?: string; onChange: (mark: SignatureMark | null) => void }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState(defaultName ?? '');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e3a8a';
  }, [mode]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border p-0.5">
        <Button type="button" size="sm" variant={mode === 'draw' ? 'secondary' : 'ghost'} onClick={() => { setMode('draw'); onChange(null); }}>
          Vẽ chữ ký
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'type' ? 'secondary' : 'ghost'}
          onClick={() => {
            setMode('type');
            onChange(typed.trim().length >= 2 ? { typedName: typed.trim() } : null);
          }}
        >
          Gõ họ tên
        </Button>
      </div>
      {mode === 'draw' ? (
        <div className="relative">
          <canvas
            ref={canvas}
            aria-label="Khung vẽ chữ ký"
            className="h-40 w-full touch-none rounded-lg border border-dashed bg-white"
            onPointerDown={(e) => {
              drawing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const ctx = e.currentTarget.getContext('2d')!;
              const p = point(e);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = e.currentTarget.getContext('2d')!;
              const p = point(e);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              dirty.current = true;
            }}
            onPointerUp={(e) => {
              drawing.current = false;
              if (dirty.current) onChange({ signatureImage: e.currentTarget.toDataURL('image/png') });
            }}
          />
          <Button type="button" variant="ghost" size="sm" className="absolute top-1 right-1" onClick={clear}>
            <Eraser /> Xóa
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">Dùng chuột hoặc ngón tay để ký vào khung.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="typed-sign">Họ tên người ký</Label>
          <Input
            id="typed-sign"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              onChange(e.target.value.trim().length >= 2 ? { typedName: e.target.value.trim() } : null);
            }}
          />
          {typed.trim() && <p className={cn('signature-script text-3xl text-blue-900')}>{typed}</p>}
        </div>
      )}
    </div>
  );
}

/** Hiển thị chữ ký đã lưu (ảnh PNG hoặc "text:Họ tên"). */
export function SignatureMarkView({ value, className }: { value: string | null; className?: string }) {
  if (!value) return null;
  if (value.startsWith('text:')) return <span className={cn('signature-script text-2xl text-blue-900', className)}>{value.slice(5)}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={value} alt="Chữ ký" className={cn('h-16 w-auto', className)} />;
}
