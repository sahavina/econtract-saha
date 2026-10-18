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
import { formatDateTime } from '@/lib/format';
import { type OdooConfig, useOdooConfig } from '@/lib/odoo';

const formKey = (c: OdooConfig) => (c.configured ? [c.url, c.db, c.username, c.enabled].join('|') : 'new');

/** Cấu hình kết nối Odoo (chỉ đọc khách hàng/nhà cung cấp). API key chỉ gửi lên, không bao giờ hiển thị lại. */
export function OdooSettingsCard() {
  const cfg = useOdooConfig();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tích hợp Odoo</CardTitle>
        <CardDescription>
          Đọc khách hàng và nhà cung cấp từ Odoo để chọn khi tạo hợp đồng (không ghi ngược về Odoo). Nên dùng một tài khoản Odoo riêng chỉ có quyền xem Liên hệ và tạo API key cho tài khoản đó
          (Odoo: Hồ sơ của tôi → Bảo mật tài khoản → Khóa API mới).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!cfg.data ? (
          <Skeleton className="h-40" />
        ) : (
          // key: nạp lại giá trị form sau khi lưu/xóa cấu hình (không đồng bộ state trong effect).
          <OdooSettingsForm key={formKey(cfg.data)} cfg={cfg.data} />
        )}
      </CardContent>
    </Card>
  );
}

function OdooSettingsForm({ cfg }: { cfg: OdooConfig }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ url: cfg.url ?? '', db: cfg.db ?? '', username: cfg.username ?? '', apiKey: '', enabled: cfg.configured ? !!cfg.enabled : true });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; partners?: number; error?: string } | null>(null);


  const invalidate = () => qc.invalidateQueries({ queryKey: ['odoo'] });
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api('/integrations/odoo', { method: 'PUT', body: d }),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình Odoo');
      setErrors([]);
      setD((x) => ({ ...x, apiKey: '' }));
      setTestResult(null);
      invalidate();
    },
    onError: (e) => setErrors(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message) : [e instanceof Error ? e.message : 'Lưu thất bại']),
  });
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; version?: string; partners?: number; error?: string }>('/integrations/odoo/test', { method: 'POST' }),
    onSuccess: (r) => {
      setTestResult(r);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: () => api('/integrations/odoo', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xóa kết nối Odoo');
      setD({ url: '', db: '', username: '', apiKey: '', enabled: true });
      setTestResult(null);
      invalidate();
    },
  });

  const configured = cfg.configured;
  return (
    <>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="odoo-url">Địa chỉ Odoo *</Label>
                <Input id="odoo-url" placeholder="https://erp.congty.vn" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odoo-db">Database *</Label>
                <Input id="odoo-db" value={d.db} onChange={(e) => setD({ ...d, db: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odoo-user">Tài khoản (email đăng nhập) *</Label>
                <Input id="odoo-user" autoComplete="off" value={d.username} onChange={(e) => setD({ ...d, username: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odoo-key">API key {configured ? '' : '*'}</Label>
                <Input
                  id="odoo-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder={cfg.hasApiKey ? 'Đã lưu – bỏ trống để giữ nguyên' : 'Dán API key của tài khoản Odoo'}
                  value={d.apiKey}
                  onChange={(e) => setD({ ...d, apiKey: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: !!v })} /> Bật tích hợp (hiện nút chọn đối tác từ Odoo)
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
                {testResult.ok ? `Kết nối thành công – Odoo ${testResult.version}, ${testResult.partners?.toLocaleString('vi-VN')} đối tác.` : testResult.error}
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
                {test.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />} Kiểm tra kết nối
              </Button>
              {configured && (
                <Button
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() =>
                    setConfirm({
                      title: 'Xóa kết nối Odoo?',
                      description: 'Đối tác đã nhập vẫn giữ trong danh mục; chỉ không tìm/cập nhật từ Odoo được nữa.',
                      destructive: true,
                      confirmLabel: 'Xóa kết nối',
                      onConfirm: () => remove.mutateAsync().then(() => undefined),
                    })
                  }
                >
                  <Trash2 /> Xóa kết nối
                </Button>
              )}
            </div>
          </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
