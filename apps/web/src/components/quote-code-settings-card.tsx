'use client';

import { DEFAULT_QUOTE_CODE_PATTERN, QUOTE_CODE_TOKENS, renderCode, validateCodePattern } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';

interface QuoteCodeSettings {
  pattern: string;
  defaultPattern: string;
  example: string;
}

/** Ý nghĩa từng token để người dùng bấm chèn vào mẫu. */
const TOKENS: { token: string; label: string }[] = [
  { token: '{YYYY}', label: 'Năm (2026)' },
  { token: '{YY}', label: 'Năm 2 số (26)' },
  { token: '{MM}', label: 'Tháng' },
  { token: '{DD}', label: 'Ngày' },
  { token: '{PARTNER}', label: 'Tên viết tắt khách hàng' },
  { token: '{SEQUENCE:4}', label: 'Số thứ tự 4 chữ số' },
];
const SUGGESTIONS = [DEFAULT_QUOTE_CODE_PATTERN, 'BG{YY}{MM}-{SEQUENCE:3}', '{SEQUENCE:3}/{YYYY}/BG-SAHA', 'BG-{PARTNER}-{DD}{MM}{YY}'];

/** Cấu hình mẫu mã báo giá: áp dụng cho báo giá tạo mới; báo giá đã có giữ nguyên mã. */
export function QuoteCodeSettingsCard({ id }: { id?: string }) {
  const cfg = useQuery({ queryKey: ['quotes', 'code-settings'], queryFn: () => api<QuoteCodeSettings>('/quotes/code-settings') });
  return (
    <SettingsSection
      id={id}
      icon={Hash}
      title="Mã báo giá"
      description="Mẫu số báo giá tự sinh khi tạo báo giá mới. Báo giá đã tạo giữ nguyên số cũ."
    >
      <div className="p-5">{!cfg.data ? <Skeleton className="h-32" /> : <QuoteCodeForm key={cfg.data.pattern} saved={cfg.data.pattern} />}</div>
    </SettingsSection>
  );
}

function QuoteCodeForm({ saved }: { saved: string }) {
  const qc = useQueryClient();
  const [pattern, setPattern] = useState(saved);
  const [serverError, setServerError] = useState('');
  const error = validateCodePattern(pattern, QUOTE_CODE_TOKENS, 'mẫu mã báo giá');
  const example = error ? '' : renderCode(pattern.trim(), { date: new Date(), partnerCode: 'ABC' }, 1);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api<QuoteCodeSettings>('/quotes/code-settings', { method: 'PUT', body: { pattern: pattern.trim() } }),
    onSuccess: (r) => {
      setServerError('');
      qc.setQueryData(['quotes', 'code-settings'], r);
      toast.success('Đã lưu mẫu mã báo giá');
    },
    onError: (e) => setServerError(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message).join('; ') : e instanceof Error ? e.message : 'Lưu thất bại'),
  });

  const insert = (token: string) => setPattern((p) => `${p}${token}`);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) save.mutate();
      }}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-1.5">
          <Label htmlFor="quote-code-pattern">Mẫu mã *</Label>
          <Input id="quote-code-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" aria-invalid={!!error} maxLength={100} />
          {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">Bấm token bên dưới để chèn vào cuối mẫu.</p>}
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Ví dụ mã</span>
          <p className="flex h-9 items-center rounded-md border bg-muted/50 px-3 font-mono text-sm font-semibold break-all">{example || '—'}</p>
          <p className="text-xs text-muted-foreground">Hôm nay, số thứ tự 1, khách hàng viết tắt “ABC”.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TOKENS.map((t) => (
          <button
            key={t.token}
            type="button"
            onClick={() => insert(t.token)}
            className="rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:border-primary hover:bg-primary/5"
            title={`Chèn ${t.token}`}
          >
            <code className="font-semibold text-primary">{t.token}</code> <span className="text-muted-foreground">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Mẫu gợi ý:</span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setPattern(s)} className="rounded-full border px-2.5 py-0.5 font-mono text-xs hover:border-primary hover:text-primary">
              {s}
            </button>
          ))}
        </div>
      </div>

      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        <li>Số thứ tự đếm riêng theo phần cố định của mã: mẫu có {'{YYYY}'} thì sang năm mới đếm lại từ 1.</li>
        <li>Số thứ tự luôn tiếp nối số lớn nhất đã dùng, kể cả báo giá tạo trước khi đổi mẫu – không bị trùng số.</li>
        <li>Mẫu không có {'{SEQUENCE}'}: nếu mã trùng sẽ tự thêm “-2”, “-3”…</li>
      </ul>

      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!!error || save.isPending || pattern.trim() === saved}>
          {save.isPending && <Loader2 className="animate-spin" />} Lưu
        </Button>
        {pattern !== saved && (
          <Button type="button" variant="ghost" onClick={() => setPattern(saved)}>
            Hoàn tác
          </Button>
        )}
      </div>
    </form>
  );
}
