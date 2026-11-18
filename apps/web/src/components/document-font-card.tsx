'use client';

import { DEFAULT_DOCUMENT_FONT, DOCUMENT_FONT_FAMILIES, DOCUMENT_FONT_LABELS, DOCUMENT_FONT_SIZES, type DocumentFont } from '@saha/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Type } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DOCUMENT_FONT_CSS } from '@/lib/document-font';

const NOTES: Record<DocumentFont['family'], string> = {
  TIMES: 'Phông văn bản hành chính. Máy không có Times New Roman ⇒ dùng Tinos (cùng kích thước chữ).',
  ARIAL: 'Không chân, dễ đọc. Máy không có Arial ⇒ dùng Roboto.',
  ROBOTO: 'Không chân, hiện đại; đi kèm ứng dụng nên hiển thị giống nhau trên mọi máy.',
  TAHOMA: 'Không chân, quen thuộc trong văn bản Việt Nam (không có kiểu nghiêng). Máy không có Tahoma ⇒ dùng Roboto.',
};

/** Phông chữ và cỡ chữ của nội dung hợp đồng, đơn hàng, biên bản khi xem, in và xuất PDF – áp dụng cho cả doanh nghiệp. */
export function DocumentFontCard({ id }: { id?: string }) {
  const { user, setDocumentFont } = useAuth();
  const saved = user?.documentFont ?? DEFAULT_DOCUMENT_FONT;
  const [font, setFont] = useState<DocumentFont>(saved);
  const [error, setError] = useState('');
  const changed = font.family !== saved.family || font.size !== saved.size;

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api<DocumentFont>('/company-profile/document-font', { method: 'PUT', body: font }),
    onSuccess: (r) => {
      setError('');
      setDocumentFont(r);
      toast.success('Đã lưu phông chữ văn bản');
    },
    onError: (e) => setError(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message).join('; ') : e instanceof Error ? e.message : 'Lưu thất bại'),
  });

  return (
    <SettingsSection
      id={id}
      icon={Type}
      title="Phông chữ văn bản"
      description="Phông và cỡ chữ của nội dung hợp đồng, đơn hàng, biên bản khi xem, in và tải PDF. Áp dụng cho mọi người dùng trong doanh nghiệp."
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="space-y-1.5">
            <Label htmlFor="doc-font-family">Phông chữ</Label>
            <Select value={font.family} onValueChange={(v) => setFont({ ...font, family: v as DocumentFont['family'] })}>
              <SelectTrigger id="doc-font-family" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_FONT_FAMILIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    <span style={{ fontFamily: DOCUMENT_FONT_CSS[f] }}>{DOCUMENT_FONT_LABELS[f]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{NOTES[font.family]}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-font-size">Cỡ chữ</Label>
            <Select value={String(font.size)} onValueChange={(v) => setFont({ ...font, size: Number(v) })}>
              <SelectTrigger id="doc-font-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_FONT_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} pt{s === DEFAULT_DOCUMENT_FONT.size ? ' (mặc định)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-md border bg-white p-4 text-[#111]" style={{ fontFamily: DOCUMENT_FONT_CSS[font.family], fontSize: `${((0.95 * font.size) / DEFAULT_DOCUMENT_FONT.size).toFixed(4)}rem`, lineHeight: 1.65 }}>
          <p className="text-center font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p className="text-center font-bold">Độc lập – Tự do – Hạnh phúc</p>
          <p className="mt-2">
            Bên A đồng ý mua, Bên B đồng ý bán hàng hóa với số lượng và đơn giá cụ thể như sau. <em>Giá trị trên đã bao gồm thuế GTGT.</em>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          PDF dùng phông cài trên máy người tải (trình duyệt Chrome/Edge có thể hỏi quyền “Truy cập phông chữ” một lần); không có thì dùng phông thay thế ghi ở trên.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={!changed || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
          {changed && (
            <Button type="button" variant="ghost" onClick={() => setFont(saved)}>
              Hoàn tác
            </Button>
          )}
        </div>
      </form>
    </SettingsSection>
  );
}
