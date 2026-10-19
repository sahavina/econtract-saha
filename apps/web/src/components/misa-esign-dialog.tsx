'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, LogOut, PenTool, Smartphone, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { type MisaCertificate, type MisaSession, type MisaStatus, useMisaStatus } from '@/lib/esign';
import type { ContractDocument } from '@/lib/types';

const errText = (e: unknown) => (e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message).join('; ') : e instanceof Error ? e.message : 'Thao tác thất bại');
const ACTIVE = ['PENDING', 'ATTACHING'];

/** Ký số một tệp PDF bằng tài khoản MISA eSign của người dùng hiện tại. */
export function MisaEsignDialog({ contractId, doc, onClose, onSigned }: { contractId: string; doc: ContractDocument; onClose: () => void; onSigned: () => void }) {
  const status = useMisaStatus();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const s = status.data;
  const busy = !!sessionId;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ký số MISA eSign</DialogTitle>
          <DialogDescription>
            {doc.fileName} (v{doc.version}) · bản đã ký được lưu thành phiên bản mới của tệp này.
          </DialogDescription>
        </DialogHeader>
        {status.isError ? (
          <p className="text-sm text-destructive">{errText(status.error)}</p>
        ) : !s ? (
          <Skeleton className="h-32" />
        ) : !s.ready ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">Doanh nghiệp chưa cấu hình hoặc đang tắt chữ ký số MISA eSign. Quản trị viên vào Cấu hình → Chữ ký số MISA eSign để nhập ClientID/ClientSecret.</p>
        ) : sessionId ? (
          <SigningProgress sessionId={sessionId} onDone={onSigned} onRetry={() => setSessionId(null)} />
        ) : !s.account?.linked ? (
          <LinkAccount account={s.account} />
        ) : !s.account.certAlias ? (
          <ChooseCertificate />
        ) : (
          <SignForm contractId={contractId} doc={doc} account={s.account} onStarted={setSessionId} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useInvalidateStatus() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['esign', 'status'] });
}

/** Đăng nhập tài khoản MISA eSign (mật khẩu chỉ chuyển tiếp tới MISA, không lưu) và xác thực OTP nếu được yêu cầu. */
function LinkAccount({ account }: { account: MisaStatus['account'] }) {
  const refresh = useInvalidateStatus();
  const [form, setForm] = useState({ userName: account?.username ?? '', password: '' });
  const [otp, setOtp] = useState({ code: '', otpType: '0' });
  const [needOtp, setNeedOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    meta: { silent: true },
    mutationFn: () => api<{ otpRequired: boolean }>('/esign/misa/account/login', { method: 'POST', body: form }),
    onSuccess: (r) => {
      setError(null);
      setForm((f) => ({ ...f, password: '' }));
      if (r.otpRequired) setNeedOtp(true);
      else refresh();
    },
    onError: (e) => setError(errText(e)),
  });
  const verify = useMutation({
    meta: { silent: true },
    mutationFn: () => api('/esign/misa/account/otp', { method: 'POST', body: { code: otp.code, otpType: Number(otp.otpType) } }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(errText(e)),
  });
  const resend = useMutation({
    meta: { silent: true },
    mutationFn: () => api('/esign/misa/account/resend-otp', { method: 'POST' }),
    onSuccess: () => toast.success('Đã gửi lại mã OTP'),
    onError: (e) => setError(errText(e)),
  });

  if (needOtp) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <p className="text-sm">Nhập mã xác thực MISA eSign gửi tới tài khoản {form.userName}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="misa-otp">Mã OTP</Label>
            <Input id="misa-otp" inputMode="numeric" autoComplete="one-time-code" value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nhận mã qua</Label>
            <Select value={otp.otpType} onValueChange={(v) => setOtp({ ...otp, otpType: v })}>
              <SelectTrigger className="w-full" aria-label="Kênh nhận OTP">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">SMS / Email</SelectItem>
                <SelectItem value="1">Ứng dụng xác thực</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={resend.isPending} onClick={() => resend.mutate()}>
            Gửi lại mã
          </Button>
          <Button type="submit" disabled={!otp.code.trim() || verify.isPending}>
            {verify.isPending && <Loader2 className="animate-spin" />} Xác thực
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Đăng nhập tài khoản MISA eSign của chính bạn (tài khoản có chứng thư số ký từ xa). Mật khẩu chỉ được chuyển tới MISA để lấy phiên đăng nhập, hệ thống không lưu mật khẩu.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="misa-user">Email / số điện thoại MISA eSign</Label>
        <Input id="misa-user" autoComplete="username" value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="misa-pass">Mật khẩu</Label>
        <Input id="misa-pass" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={!form.userName.trim() || !form.password || login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" />} Đăng nhập MISA eSign
        </Button>
      </DialogFooter>
    </form>
  );
}

function ChooseCertificate({ onCancel }: { onCancel?: () => void }) {
  const refresh = useInvalidateStatus();
  const certs = useQuery({ queryKey: ['esign', 'certificates'], queryFn: () => api<MisaCertificate[]>('/esign/misa/account/certificates') });
  const select = useMutation({
    mutationFn: (keyAlias: string) => api('/esign/misa/account/certificate', { method: 'PUT', body: { keyAlias } }),
    onSuccess: () => {
      refresh();
      onCancel?.();
    },
  });
  return (
    <div className="space-y-3">
      <p className="text-sm">Chọn chứng thư số dùng để ký:</p>
      {certs.isError ? (
        <p className="text-sm text-destructive">{errText(certs.error)}</p>
      ) : !certs.data ? (
        <Skeleton className="h-20" />
      ) : certs.data.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">Tài khoản MISA eSign này chưa có chứng thư số. Hãy đăng ký/kích hoạt chứng thư số trên ứng dụng MISA eSign.</p>
      ) : (
        <ul className="space-y-2">
          {certs.data.map((c) => {
            const active = (c.keyStatus ?? 'ACTIVE').toUpperCase() === 'ACTIVE';
            return (
              <li key={c.keyAlias} className="flex items-center gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.subject ?? c.keyAlias}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.keyAlias}
                    {c.appName ? ` · ${c.appName}` : ''} · {active ? 'Đang hoạt động' : 'Không hoạt động'}
                  </p>
                </div>
                <Button size="sm" disabled={!active || select.isPending} onClick={() => select.mutate(c.keyAlias)}>
                  Chọn
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {onCancel && (
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Quay lại
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}

function SignForm({
  contractId,
  doc,
  account,
  onStarted,
  onCancel,
}: {
  contractId: string;
  doc: ContractDocument;
  account: NonNullable<MisaStatus['account']>;
  onStarted: (id: string) => void;
  onCancel: () => void;
}) {
  const refresh = useInvalidateStatus();
  const [changeCert, setChangeCert] = useState(false);
  const [opts, setOpts] = useState({ page: '', position: 'BOTTOM_RIGHT', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      api<{ sessionId: string }>(`/esign/misa/contracts/${contractId}/documents/${doc.id}/sign`, {
        method: 'POST',
        body: { page: opts.page ? Number(opts.page) : undefined, position: opts.position, reason: opts.reason || undefined },
      }),
    onSuccess: (r) => onStarted(r.sessionId),
    onError: (e) => setError(errText(e)),
  });
  const unlink = useMutation({ mutationFn: () => api('/esign/misa/account', { method: 'DELETE' }), onSuccess: refresh });

  if (changeCert) return <ChooseCertificate onCancel={() => setChangeCert(false)} />;
  return (
    <div className="space-y-3">
      <div className="rounded-md border px-3 py-2 text-sm">
        <p>
          Tài khoản: <span className="font-medium">{account.displayName || account.username}</span> ({account.username})
        </p>
        <p className="truncate">
          Chứng thư: <span className="font-medium">{account.certSubject ?? account.certAlias}</span>
        </p>
        <div className="mt-1 flex gap-3 text-xs">
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setChangeCert(true)}>
            Đổi chứng thư
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:underline" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            <LogOut className="size-3" /> Hủy liên kết tài khoản
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="misa-page">Trang đặt chữ ký</Label>
          <Input id="misa-page" inputMode="numeric" placeholder="Trang cuối" value={opts.page} onChange={(e) => setOpts({ ...opts, page: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="space-y-1.5">
          <Label>Vị trí</Label>
          <Select value={opts.position} onValueChange={(v) => setOpts({ ...opts, position: v })}>
            <SelectTrigger className="w-full" aria-label="Vị trí chữ ký">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOTTOM_RIGHT">Cuối trang – bên phải</SelectItem>
              <SelectItem value="BOTTOM_LEFT">Cuối trang – bên trái</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="misa-reason">Lý do ký</Label>
          <Input id="misa-reason" placeholder="Mặc định: Ký hợp đồng <mã hợp đồng>" maxLength={200} value={opts.reason} onChange={(e) => setOpts({ ...opts, reason: e.target.value })} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <PenTool />} Gửi yêu cầu ký
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Chờ người ký xác nhận trên ứng dụng MISA eSign (hỏi trạng thái mỗi 3 giây). */
function SigningProgress({ sessionId, onDone, onRetry }: { sessionId: string; onDone: () => void; onRetry: () => void }) {
  const session = useQuery({
    queryKey: ['esign', 'session', sessionId],
    queryFn: () => api<MisaSession>(`/esign/misa/sessions/${sessionId}`),
    refetchInterval: (q) => (q.state.data && !ACTIVE.includes(q.state.data.status) ? false : 3000),
    retry: false,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const done = useRef(false);
  const st = session.data?.status;
  useEffect(() => {
    if (st === 'SUCCESS' && !done.current) {
      done.current = true;
      toast.success('Đã ký số thành công – bản đã ký được lưu thành phiên bản mới');
      onDone();
    }
  }, [st, onDone]);

  const failed = session.isError || st === 'FAILED' || st === 'EXPIRED';
  if (failed) {
    return (
      <div className="space-y-3">
        <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" /> {session.isError ? errText(session.error) : session.data?.error || 'Ký không thành công'}
        </p>
        <DialogFooter>
          <Button onClick={onRetry}>Ký lại</Button>
        </DialogFooter>
      </div>
    );
  }
  if (st === 'SUCCESS') {
    return (
      <p className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="size-4" /> Đã ký số thành công.
      </p>
    );
  }
  const left = session.data ? Math.max(0, Math.ceil((new Date(session.data.expiresAt).getTime() - 30_000 - now) / 1000)) : 120;
  return (
    <div className="space-y-3 py-2 text-center">
      <Smartphone className="mx-auto size-10 text-primary" />
      {st === 'ATTACHING' ? (
        <p className="text-sm">Đã xác nhận – đang gắn chữ ký vào tài liệu…</p>
      ) : (
        <>
          <p className="text-sm font-medium">Mở ứng dụng MISA eSign trên điện thoại và xác nhận yêu cầu ký.</p>
          <p className="text-3xl font-semibold tabular-nums">{left}s</p>
        </>
      )}
      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
