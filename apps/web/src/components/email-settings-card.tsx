'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Send, Trash2, XCircle } from 'lucide-react';
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
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

interface EmailConfig {
  configured: boolean;
  /** Máy chủ có SMTP chung: khi chưa cấu hình riêng (hoặc tắt), email gửi qua SMTP máy chủ. */
  serverFallback: boolean;
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  fromName?: string;
  fromEmail?: string;
  hasPassword?: boolean;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
}

interface TestResult {
  ok: boolean;
  to: string;
  source?: 'tenant' | 'server';
  error?: string;
}

const formKey = (c: EmailConfig) =>
  c.configured ? [c.host, c.port, c.username, c.fromName, c.fromEmail, c.enabled].join('|') : 'new';

/** Máy chủ gửi email (SMTP) của doanh nghiệp: thư mời ký, OTP, nhắc hạn, link xem trước hợp đồng. */
export function EmailSettingsCard() {
  const cfg = useQuery({ queryKey: ['mail', 'config'], queryFn: () => api<EmailConfig>('/integrations/smtp') });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email gửi đi (SMTP)</CardTitle>
        <CardDescription>
          Hộp thư dùng để gửi thư mời ký, mã OTP, nhắc hạn và link xem trước hợp đồng. Với Gmail: bật Xác minh 2 bước rồi tạo
          Mật khẩu ứng dụng (Tài khoản Google → Bảo mật → Mật khẩu ứng dụng) và dán mật khẩu 16 ký tự đó vào đây, không dùng mật
          khẩu đăng nhập Gmail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!cfg.data ? <Skeleton className="h-48" /> : <EmailSettingsForm key={formKey(cfg.data)} cfg={cfg.data} />}
      </CardContent>
    </Card>
  );
}

function EmailSettingsForm({ cfg }: { cfg: EmailConfig }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [d, setD] = useState({
    host: cfg.host ?? '',
    port: String(cfg.port ?? 465),
    username: cfg.username ?? '',
    password: '',
    fromName: cfg.fromName ?? '',
    fromEmail: cfg.fromEmail ?? '',
    enabled: cfg.configured ? !!cfg.enabled : true,
  });
  const [testTo, setTestTo] = useState(user?.email ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['mail'] });
  const errorsOf = (e: unknown) =>
    e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message) : [e instanceof Error ? e.message : 'Thao tác thất bại'];
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api('/integrations/smtp', { method: 'PUT', body: { ...d, port: Number(d.port) } }),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình email');
      setErrors([]);
      setD((x) => ({ ...x, password: '' }));
      setTestResult(null);
      invalidate();
    },
    onError: (e) => setErrors(errorsOf(e)),
  });
  const test = useMutation({
    meta: { silent: true },
    mutationFn: () => api<TestResult>('/integrations/smtp/test', { method: 'POST', body: { to: testTo } }),
    onSuccess: (r) => {
      setErrors([]);
      setTestResult(r);
      invalidate();
    },
    onError: (e) => setErrors(errorsOf(e)),
  });
  const remove = useMutation({
    mutationFn: () => api('/integrations/smtp', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xóa cấu hình email');
      setTestResult(null);
      invalidate();
    },
  });

  const useGmail = () =>
    setD((x) => ({
      ...x,
      host: 'smtp.gmail.com',
      port: '465',
      fromEmail: x.fromEmail || x.username,
      fromName: x.fromName || 'SAHA eContract',
    }));
  const configured = cfg.configured;
  const canTest = configured || cfg.serverFallback;

  return (
    <>
      <div className="space-y-3">
        {!configured && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {cfg.serverFallback
              ? 'Chưa cấu hình riêng – email đang gửi qua máy chủ SMTP chung của hệ thống.'
              : 'Chưa cấu hình – hệ thống chưa gửi được email (thư mời ký, OTP, link xem trước).'}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="smtp-host">Máy chủ SMTP *</Label>
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={useGmail}>
                Dùng Gmail
              </Button>
            </div>
            <Input id="smtp-host" placeholder="smtp.gmail.com" value={d.host} onChange={(e) => setD({ ...d, host: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-port">Cổng *</Label>
            <Input id="smtp-port" inputMode="numeric" value={d.port} onChange={(e) => setD({ ...d, port: e.target.value })} />
            <p className="text-xs text-muted-foreground">465 (SSL) hoặc 587 (STARTTLS).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-user">Tài khoản SMTP</Label>
            <Input
              id="smtp-user"
              autoComplete="off"
              placeholder="ten@gmail.com"
              value={d.username}
              onChange={(e) => setD({ ...d, username: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-pass">Mật khẩu {configured || !d.username ? '' : '*'}</Label>
            <Input
              id="smtp-pass"
              type="password"
              autoComplete="new-password"
              placeholder={cfg.hasPassword ? 'Đã lưu – bỏ trống để giữ nguyên' : 'Mật khẩu ứng dụng / mật khẩu SMTP'}
              value={d.password}
              onChange={(e) => setD({ ...d, password: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from-name">Tên người gửi *</Label>
            <Input id="smtp-from-name" placeholder="SAHA eContract" value={d.fromName} onChange={(e) => setD({ ...d, fromName: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="smtp-from-email">Email người gửi *</Label>
            <Input
              id="smtp-from-email"
              type="email"
              placeholder="ten@gmail.com"
              value={d.fromEmail}
              onChange={(e) => setD({ ...d, fromEmail: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Với Gmail, nên trùng tài khoản SMTP (Gmail tự thay địa chỉ gửi khác).</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: !!v })} /> Bật gửi email bằng cấu hình này
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
          {configured && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={() =>
                setConfirm({
                  title: 'Xóa cấu hình email?',
                  description: cfg.serverFallback
                    ? 'Email sẽ gửi qua máy chủ SMTP chung của hệ thống.'
                    : 'Hệ thống sẽ không gửi được email (thư mời ký, OTP, link xem trước) cho tới khi cấu hình lại.',
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

        <div className="space-y-1.5 border-t pt-3">
          <Label htmlFor="smtp-test-to">Gửi email thử tới</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="smtp-test-to" type="email" className="max-w-xs" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button variant="outline" disabled={!canTest || !testTo || test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? <Loader2 className="animate-spin" /> : <Send />} Gửi email thử
            </Button>
          </div>
          {!configured && !cfg.serverFallback && <p className="text-xs text-muted-foreground">Lưu cấu hình trước khi gửi thử.</p>}
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {testResult && (
          <p
            role="status"
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}
          >
            {testResult.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            {testResult.ok
              ? `Đã gửi email thử tới ${testResult.to}${testResult.source === 'server' ? ' (qua SMTP chung của máy chủ)' : ''} – kiểm tra hộp thư (cả mục Spam).`
              : `Gửi thất bại: ${testResult.error}`}
          </p>
        )}
        {!testResult && cfg.lastTestedAt && (
          <p className="text-xs text-muted-foreground">
            Lần gửi thử gần nhất {formatDateTime(cfg.lastTestedAt)}: {cfg.lastTestOk ? 'thành công' : 'thất bại'}
          </p>
        )}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
