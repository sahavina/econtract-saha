'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSignature, Loader2, Mail, PenLine, X, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { type SignatureMark, SignaturePad } from '@/components/signature-pad';
import { SignedDocument } from '@/components/signed-document';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PublicSignView } from '@/lib/types';

function Shell({ children, org }: { children: React.ReactNode; org?: string }) {
  return (
    <main className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSignature className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">SAHA eContract · Ký điện tử</p>
            {org && <p className="text-xs text-muted-foreground">Yêu cầu từ {org}</p>}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">{children}</div>
    </main>
  );
}

export function PublicSign() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const key = ['public-sign', token];
  const view = useQuery({ queryKey: key, queryFn: () => api<PublicSignView>(`/public/sign/${token}`), retry: false });

  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [mark, setMark] = useState<SignatureMark | null>(null);
  const [consent, setConsent] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onError = (err: unknown) => setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
  const sendOtp = useMutation({
    meta: { silent: true },
    mutationFn: () => api<{ sentTo: string }>(`/public/sign/${token}/otp`, { method: 'POST' }),
    onSuccess: (r) => {
      setError(null);
      setOtpInfo(`Đã gửi mã OTP tới ${r.sentTo}. Mã có hiệu lực 10 phút.`);
    },
    onError,
  });
  const sign = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/public/sign/${token}`, { method: 'POST', body: { ...mark, otp, consent } }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError,
  });
  const reject = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/public/sign/${token}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      setError(null);
      setRejecting(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError,
  });

  if (view.isError) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <XCircle className="size-6 text-destructive" />
            <div>
              <p className="font-medium">Không mở được liên kết ký</p>
              <p className="text-sm text-muted-foreground">
                {view.error instanceof ApiError ? view.error.message : 'Liên kết không hợp lệ hoặc đã hết hiệu lực.'} Vui lòng liên hệ bên gửi để nhận liên kết mới.
              </p>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }
  if (!view.data) {
    return (
      <Shell>
        <Skeleton className="h-96" />
      </Shell>
    );
  }

  const v = view.data;
  const canAct = v.request.status === 'IN_PROGRESS' && v.signer.status === 'PENDING';
  const done = v.signer.status === 'SIGNED';

  return (
    <Shell org={v.organization}>
      <Card>
        <CardHeader>
          <CardTitle>{v.contract.title}</CardTitle>
          <CardDescription>
            Số hợp đồng {v.contract.code} · Người ký: {v.signer.name} ({v.signer.email}) · Hạn ký {formatDateTime(v.request.expiresAt)}
          </CardDescription>
        </CardHeader>
        {v.request.message && (
          <CardContent>
            <p className="rounded-md bg-muted px-3 py-2 text-sm">Lời nhắn: {v.request.message}</p>
          </CardContent>
        )}
      </Card>

      {done && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-5" /> Bạn đã ký hợp đồng này. Cảm ơn quý khách!
          {v.request.status === 'COMPLETED' && ' Tất cả các bên đã ký hoàn tất.'}
        </div>
      )}
      {v.signer.status === 'REJECTED' && <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">Bạn đã từ chối ký hợp đồng này.</p>}
      {v.signer.status === 'WAITING' && <p className="rounded-md bg-muted px-4 py-3 text-sm">Chưa đến lượt bạn ký. Bạn sẽ nhận email khi đến lượt.</p>}
      {!canAct && !done && v.signer.status !== 'REJECTED' && v.signer.status !== 'WAITING' && (
        <p className="rounded-md bg-muted px-4 py-3 text-sm">Yêu cầu ký đã kết thúc ({v.request.status === 'EXPIRED' ? 'hết hạn' : 'đã đóng'}).</p>
      )}

      <SignedDocument snapshot={v.request.contentSnapshot} documentHash={v.request.documentHash} signers={v.signers} showCertificate={false} />
      <p className="text-xs break-all text-muted-foreground">Mã băm SHA-256 của văn bản: {v.request.documentHash}</p>

      {canAct && !rejecting && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ký hợp đồng</CardTitle>
            <CardDescription>Bước 1: nhận mã OTP qua email · Bước 2: ký và xác nhận.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Button variant="outline" onClick={() => sendOtp.mutate()} disabled={sendOtp.isPending}>
                {sendOtp.isPending ? <Loader2 className="animate-spin" /> : <Mail />} {otpInfo ? 'Gửi lại mã OTP' : 'Gửi mã OTP qua email'}
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="otp">Mã OTP</Label>
                <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-36 tracking-widest" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            {otpInfo && <p className="text-sm text-muted-foreground">{otpInfo}</p>}
            <SignaturePad defaultName={v.signer.name} onChange={setMark} />
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(c) => setConsent(!!c)} />
              Tôi đã đọc, đồng ý với nội dung hợp đồng và đồng ý ký bằng phương thức điện tử; chữ ký này có giá trị như chữ ký tay.
            </label>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => sign.mutate()} disabled={otp.length !== 6 || !mark || !consent || sign.isPending}>
                {sign.isPending ? <Loader2 className="animate-spin" /> : <PenLine />} Ký hợp đồng
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(true)}>
                <X /> Từ chối ký
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canAct && rejecting && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Từ chối ký</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="reason">Lý do *</Label>
            <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="destructive" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
                Xác nhận từ chối
              </Button>
              <Button variant="outline" onClick={() => setRejecting(false)}>
                Quay lại
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
