'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, PlugZap, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { DEFAULT_MISA_BASE_URL, type MisaConfig, useMisaConfig } from '@/lib/esign';
import { formatDateTime } from '@/lib/format';

const formKey = (c: MisaConfig) => (c.configured ? [c.baseUrl, c.clientId, c.enabled].join('|') : 'new');

/** Cấu hình ứng dụng MISA eSign (ClientID/ClientSecret). ClientSecret chỉ gửi lên, không bao giờ hiển thị lại. */
export function MisaEsignSettingsCard() {
  const cfg = useMisaConfig();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chữ ký số MISA eSign</CardTitle>
        <CardDescription>
          Ký số tệp PDF hợp đồng bằng chứng thư số từ xa MISA eSign. Nhập ClientID/ClientSecret của ứng dụng đã đăng ký trên MISA Developer (developer.misa.vn). Mỗi người ký liên kết tài
          khoản MISA eSign của chính mình khi ký (trong tab Tài liệu của hợp đồng) và xác nhận trên ứng dụng MISA eSign.
        </CardDescription>
      </CardHeader>
      <CardContent>{!cfg.data ? <Skeleton className="h-40" /> : <MisaSettingsForm key={formKey(cfg.data)} cfg={cfg.data} />}</CardContent>
    </Card>
  );
}

function MisaSettingsForm({ cfg }: { cfg: MisaConfig }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ baseUrl: cfg.baseUrl || DEFAULT_MISA_BASE_URL, clientId: cfg.clientId ?? '', clientSecret: '', enabled: cfg.configured ? !!cfg.enabled : true });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['esign'] });
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api('/esign/misa/config', { method: 'PUT', body: { ...d, clientSecret: d.clientSecret || undefined } }),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình MISA eSign');
      setErrors([]);
      setD((x) => ({ ...x, clientSecret: '' }));
      setTestResult(null);
      invalidate();
    },
    onError: (e) => setErrors(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message) : [e instanceof Error ? e.message : 'Lưu thất bại']),
  });
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string }>('/esign/misa/config/test', { method: 'POST' }),
    onSuccess: (r) => {
      setTestResult(r);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: () => api('/esign/misa/config', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xóa cấu hình MISA eSign');
      setTestResult(null);
      invalidate();
    },
  });

  const configured = cfg.configured;
  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="misa-url">Địa chỉ API *</Label>
            <Input id="misa-url" value={d.baseUrl} onChange={(e) => setD({ ...d, baseUrl: e.target.value })} />
            <p className="text-xs text-muted-foreground">Mặc định {DEFAULT_MISA_BASE_URL} (môi trường thử nghiệm và chính thức dùng cổng theo hướng dẫn của MISA).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="misa-client-id">ClientID *</Label>
            <Input id="misa-client-id" autoComplete="off" value={d.clientId} onChange={(e) => setD({ ...d, clientId: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="misa-client-secret">ClientSecret {configured ? '' : '*'}</Label>
            <Input
              id="misa-client-secret"
              type="password"
              autoComplete="new-password"
              placeholder={cfg.hasSecret ? 'Đã lưu – bỏ trống để giữ nguyên' : 'Dán ClientSecret của ứng dụng'}
              value={d.clientSecret}
              onChange={(e) => setD({ ...d, clientSecret: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: !!v })} /> Bật ký số MISA eSign (hiện nút “Ký số” trên tệp PDF)
        </label>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {testResult && (
          <p role="status" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}>
            {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {testResult.message}
          </p>
        )}
        {!testResult && cfg.lastTestedAt && (
          <p className="text-xs text-muted-foreground">
            Lần kiểm tra gần nhất {formatDateTime(cfg.lastTestedAt)}: {cfg.lastTestOk ? 'thành công' : 'thất bại'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
          <Button variant="outline" disabled={!configured || test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />} Kiểm tra ClientID/Secret
          </Button>
          {configured && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={() =>
                setConfirm({
                  title: 'Xóa cấu hình MISA eSign?',
                  description: 'Tệp đã ký số vẫn giữ nguyên; người dùng sẽ không ký số MISA eSign được nữa cho tới khi cấu hình lại.',
                  destructive: true,
                  confirmLabel: 'Xóa cấu hình',
                  onConfirm: () => remove.mutateAsync().then(() => undefined),
                })
              }
            >
              <Trash2 /> Xóa cấu hình
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
