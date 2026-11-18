'use client';

import {
  DEFAULT_SIGNATURE_APPEARANCE,
  SIGNATURE_CHECK_PNG_BASE64,
  SIGNATURE_FONT_SIZES,
  type SignatureAppearance,
  signatureBoxSize,
  signatureTextLines,
} from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Loader2, Stamp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export interface SignatureAppearanceInfo {
  appearance: SignatureAppearance;
  /** Ảnh logo/con dấu (data URL) hoặc null. */
  logo: string | null;
  /** Kích thước khung chữ ký (pt) theo cấu hình. */
  box: { width: number; height: number };
}

export const signatureAppearanceKey = ['esign', 'appearance'] as const;

export function useSignatureAppearance() {
  return useQuery({ queryKey: signatureAppearanceKey, queryFn: () => api<SignatureAppearanceInfo>('/esign/misa/appearance') });
}

const errText = (e: unknown) => (e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message).join('; ') : e instanceof Error ? e.message : 'Thao tác thất bại');

const TOGGLES: { key: 'showOwner' | 'showLogo' | 'showTime' | 'showCertDetails' | 'showLabels' | 'showCheck'; label: string }[] = [
  { key: 'showOwner', label: 'Chủ sở hữu' },
  { key: 'showLogo', label: 'Logo / con dấu' },
  { key: 'showTime', label: 'Thời gian ký' },
  { key: 'showCertDetails', label: 'Chi tiết chứng thư' },
  { key: 'showLabels', label: 'Nhãn' },
  { key: 'showCheck', label: 'Logo tích xanh' },
];

/** Cấu hình hiển thị chữ ký số MISA eSign trên PDF (cả doanh nghiệp): nội dung, bố cục, cỡ hình, cỡ chữ, ngôn ngữ, ảnh logo. */
export function SignatureAppearanceCard({ id }: { id?: string }) {
  const info = useSignatureAppearance();
  return (
    <SettingsSection
      id={id}
      icon={Stamp}
      title="Hiển thị chữ ký số"
      description="Nội dung và hình thức khung chữ ký số MISA eSign đóng lên PDF khi ký. Áp dụng cho mọi người ký số trong doanh nghiệp."
    >
      <div className="p-5">{info.data ? <AppearanceForm key={JSON.stringify(info.data.appearance)} saved={info.data} /> : <Skeleton className="h-64" />}</div>
    </SettingsSection>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-lg border p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-md px-3 py-1.5 text-sm transition-colors', value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Xem trước gần đúng khung chữ ký (MISA tự dựng hình thật khi ký). */
export function SignaturePreview({ appearance: a, logo, owner }: { appearance: SignatureAppearance; logo: string | null; owner: string }) {
  const { width, height } = signatureBoxSize(a);
  const scale = 1.25; // px trên mỗi pt
  // Thời điểm mẫu cố định khi mở thẻ (không đổi theo mỗi lần vẽ lại).
  const [sampleAt] = useState(() => new Date());
  const lines = signatureTextLines(a, {
    owner,
    signedAt: sampleAt,
    cert: { serial: '54010C478754CBA588A73F5C9CD0B850', issuer: 'MISA eSign CA', validTo: new Date(sampleAt.getTime() + 3 * 365 * 86_400_000) },
  });
  const showImage = a.showLogo && !!logo;
  const vertical = a.layout === 'VERTICAL';
  return (
    <div
      className={cn('relative flex overflow-hidden rounded-md border border-dashed border-gray-300 bg-white p-1 text-[#111]', vertical ? 'flex-col items-center' : 'items-center')}
      style={{ width: width * scale, height: height * scale }}
      aria-label="Xem trước khung chữ ký"
    >
      {a.showCheck && (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh base64 nhỏ, không qua tối ưu ảnh của Next.
        <img src={`data:image/png;base64,${SIGNATURE_CHECK_PNG_BASE64}`} alt="" className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 opacity-25" style={{ height: height * scale * 0.7 }} />
      )}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh data URL do quản trị tải lên.
        <img src={logo!} alt="Logo" className={cn('relative shrink-0 object-contain', vertical ? 'max-h-[45%] w-auto' : 'h-full max-w-[40%]')} />
      )}
      {lines.length > 0 && (
        <div className="relative min-w-0 flex-1 overflow-hidden leading-tight break-words" style={{ fontSize: a.fontSize * scale, textAlign: vertical ? 'center' : 'left' }}>
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppearanceForm({ saved }: { saved: SignatureAppearanceInfo }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [a, setA] = useState<SignatureAppearance>(saved.appearance);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const changed = JSON.stringify(a) !== JSON.stringify(saved.appearance);
  const set = (patch: Partial<SignatureAppearance>) => setA((x) => ({ ...x, ...patch }));

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api<SignatureAppearanceInfo>('/esign/misa/appearance', { method: 'PUT', body: a }),
    onSuccess: (r) => {
      setError('');
      qc.setQueryData(signatureAppearanceKey, r);
      toast.success('Đã lưu cấu hình hiển thị chữ ký');
    },
    onError: (e) => setError(errText(e)),
  });
  const upload = useMutation({
    meta: { silent: true },
    mutationFn: (dataUrl: string) => api<SignatureAppearanceInfo>('/esign/misa/appearance/logo', { method: 'PUT', body: { dataUrl } }),
    onSuccess: (r) => {
      setError('');
      qc.setQueryData(signatureAppearanceKey, { ...r, appearance: saved.appearance });
      set({ showLogo: true });
      toast.success('Đã tải ảnh logo');
    },
    onError: (e) => setError(errText(e)),
  });
  const remove = useMutation({
    meta: { silent: true },
    mutationFn: () => api<SignatureAppearanceInfo>('/esign/misa/appearance/logo', { method: 'DELETE' }),
    onSuccess: (r) => {
      qc.setQueryData(signatureAppearanceKey, { ...r, appearance: saved.appearance });
      set({ showLogo: false });
    },
    onError: (e) => setError(errText(e)),
  });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError('Chỉ nhận ảnh PNG hoặc JPG');
    if (file.size > 300 * 1024) return setError('Ảnh tối đa 300 KB');
    const reader = new FileReader();
    reader.onload = () => upload.mutate(String(reader.result));
    reader.readAsDataURL(file);
  };

  const fontIndex = Math.max(0, (SIGNATURE_FONT_SIZES as readonly number[]).indexOf(a.fontSize));

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Nội dung hiển thị</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 2xl:grid-cols-3">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={a[t.key]} onCheckedChange={(v) => set({ [t.key]: !!v })} /> {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid items-center gap-x-4 gap-y-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <Label>Bố cục</Label>
          <Segmented label="Bố cục" value={a.layout} onChange={(v) => set({ layout: v })} options={[{ value: 'HORIZONTAL', label: 'Ngang' }, { value: 'VERTICAL', label: 'Dọc' }]} />
          <Label>Hình ảnh</Label>
          <Segmented label="Cỡ hình" value={a.imageSize} onChange={(v) => set({ imageSize: v })} options={[{ value: 'S', label: 'Nhỏ' }, { value: 'M', label: 'Vừa' }, { value: 'L', label: 'Lớn' }]} />
          <Label htmlFor="sig-font">Cỡ chữ</Label>
          <div className="flex items-center gap-3">
            <input
              id="sig-font"
              type="range"
              min={0}
              max={SIGNATURE_FONT_SIZES.length - 1}
              step={1}
              value={fontIndex}
              onChange={(e) => set({ fontSize: SIGNATURE_FONT_SIZES[Number(e.target.value)] })}
              className="w-full accent-[var(--primary)]"
            />
            <span className="w-10 text-right text-sm tabular-nums">{a.fontSize} pt</span>
          </div>
          <Label htmlFor="sig-lang">Ngôn ngữ</Label>
          <Select value={a.language} onValueChange={(v) => set({ language: v as SignatureAppearance['language'] })}>
            <SelectTrigger id="sig-lang" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Ảnh logo / con dấu</Label>
          <div className="flex flex-wrap items-center gap-2">
            {saved.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh data URL do quản trị tải lên.
              <img src={saved.logo} alt="Logo đã tải" className="h-12 w-auto rounded border bg-white object-contain p-1" />
            ) : (
              <span className="text-sm text-muted-foreground">Chưa có ảnh.</span>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)} />
            <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              {upload.isPending ? <Loader2 className="animate-spin" /> : <ImageUp />} {saved.logo ? 'Đổi ảnh' : 'Tải ảnh lên'}
            </Button>
            {saved.logo && (
              <Button type="button" variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
                <Trash2 /> Xóa ảnh
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG/JPG tối đa 300 KB, nên dùng ảnh nền trong suốt. Bật “Logo / con dấu” để đưa ảnh vào khung chữ ký.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={!changed || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
          <Button type="button" variant="ghost" disabled={!changed} onClick={() => setA(saved.appearance)}>
            Hủy
          </Button>
          <Button type="button" variant="ghost" className="ml-auto" onClick={() => setA(DEFAULT_SIGNATURE_APPEARANCE)}>
            Mặc định
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Xem trước chữ ký</p>
        <SignaturePreview appearance={a} logo={saved.logo} owner={user?.tenant.name?.toUpperCase() ?? 'CÔNG TY'} />
        <p className="text-xs text-muted-foreground">
          Bản xem trước gần đúng; hình thật do MISA eSign dựng khi ký. Khung {signatureBoxSize(a).width} × {signatureBoxSize(a).height} pt.
        </p>
      </div>
    </form>
  );
}
