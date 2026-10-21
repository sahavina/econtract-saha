'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Copy, Download, FileKey2, Link2, Loader2, PenLine, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { MisaEsignDialog } from '@/components/misa-esign-dialog';
import { EmptyState, ErrorState } from '@/components/page-header';
import { type SignatureMark, SignaturePad } from '@/components/signature-pad';
import { SignedDocument } from '@/components/signed-document';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, downloadFile } from '@/lib/api';
import { contractPdfFile } from '@/lib/contract-pdf';
import { useMisaStatus } from '@/lib/esign';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ContractDetail, PartyRole, SignatureRequestInfo, SignerStatus } from '@/lib/types';

const SIGNER_STATUS: Record<SignerStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  WAITING: { label: 'Chưa tới lượt', variant: 'outline' },
  PENDING: { label: 'Chờ ký', variant: 'secondary' },
  SIGNED: { label: 'Đã ký', variant: 'default' },
  REJECTED: { label: 'Từ chối', variant: 'destructive' },
  SKIPPED: { label: 'Bỏ qua', variant: 'outline' },
};
const REQUEST_STATUS: Record<SignatureRequestInfo['status'], string> = {
  IN_PROGRESS: 'Đang ký',
  COMPLETED: 'Đã hoàn tất',
  REJECTED: 'Bị từ chối',
  EXPIRED: 'Hết hạn',
  CANCELLED: 'Đã hủy',
};
const ROLE_LABELS: Record<PartyRole, string> = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' };

interface SignerDraft {
  key: number;
  partyRole: PartyRole | '';
  internal: boolean;
  userId: string;
  name: string;
  email: string;
  title: string;
}

let seq = 0;

function defaultSigners(c: ContractDetail): SignerDraft[] {
  return c.parties.map((p) => ({
    key: ++seq,
    partyRole: p.role,
    internal: p.isInternal,
    userId: p.isInternal ? (c.owner?.id ?? '') : '',
    name: p.representative ?? p.name,
    email: p.email ?? '',
    title: p.position ? `${p.position} – ${p.name}` : p.name,
  }));
}

function CreateRequest({ contract }: { contract: ContractDetail }) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const [signers, setSigners] = useState<SignerDraft[]>(() => defaultSigners(contract));
  const [order, setOrder] = useState<'SEQUENTIAL' | 'PARALLEL'>('SEQUENTIAL');
  const [days, setDays] = useState('7');
  const [message, setMessage] = useState('');
  const [digital, setDigital] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const misa = useMisaStatus();
  const hasInternal = signers.some((s) => s.internal);
  const update = (key: number, patch: Partial<SignerDraft>) => setSigners((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const create = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      api(`/contracts/${contract.id}/signature`, {
        method: 'POST',
        body: {
          signingOrder: order,
          expiresInDays: Number(days) || 7,
          message: message || null,
          internalDigital: digital && hasInternal,
          signers: signers.map((s) => {
            const u = lookups.data?.users.find((x) => x.id === s.userId);
            return s.internal
              ? { partyRole: s.partyRole || null, userId: s.userId || null, name: u?.fullName ?? s.name, email: u?.email ?? s.email, title: s.title || null }
              : { partyRole: s.partyRole || null, name: s.name, email: s.email, title: s.title || null };
          }),
        },
      }),
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu ký');
      setErrors([]);
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (err) =>
      setErrors(err instanceof ApiError && err.errors.length ? err.errors.map((e) => `${e.field}: ${e.message}`) : [err instanceof Error ? err.message : 'Gửi thất bại']),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gửi ký điện tử</CardTitle>
        <CardDescription>
          Nội dung hợp đồng sẽ được đóng băng và băm SHA-256 khi gửi. Người ký nội bộ xác nhận bằng mật khẩu; người ký bên ngoài nhận liên kết qua email và xác thực bằng mã OTP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signers.map((s, i) => (
          <div key={s.key} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{order === 'SEQUENTIAL' ? i + 1 : '•'}</span>
              <Select value={s.partyRole || undefined} onValueChange={(v) => update(s.key, { partyRole: v as PartyRole })}>
                <SelectTrigger className="w-36" aria-label="Bên ký">
                  <SelectValue placeholder="Bên ký" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as PartyRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={s.internal} onCheckedChange={(v) => update(s.key, { internal: !!v })} /> Người ký nội bộ
              </label>
              <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Xóa người ký" disabled={signers.length === 1} onClick={() => setSigners((l) => l.filter((x) => x.key !== s.key))}>
                <Trash2 />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {s.internal ? (
                <Select value={s.userId || undefined} onValueChange={(v) => update(s.key, { userId: v })}>
                  <SelectTrigger className="w-full" aria-label="Người ký nội bộ">
                    <SelectValue placeholder="Chọn người ký…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookups.data?.users ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input aria-label="Họ tên người ký" placeholder="Họ tên người ký" value={s.name} onChange={(e) => update(s.key, { name: e.target.value })} />
                  <Input aria-label="Email người ký" type="email" placeholder="Email nhận liên kết & OTP" value={s.email} onChange={(e) => update(s.key, { email: e.target.value })} />
                </>
              )}
              <Input aria-label="Chức danh" placeholder="Chức danh / đơn vị" value={s.title} onChange={(e) => update(s.key, { title: e.target.value })} />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setSigners((l) => [...l, { key: ++seq, partyRole: '', internal: false, userId: '', name: '', email: '', title: '' }])} disabled={signers.length >= 10}>
          <Plus /> Thêm người ký
        </Button>

        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <div className="space-y-1.5">
            <Label>Thứ tự ký</Label>
            <Select value={order} onValueChange={(v) => setOrder(v as 'SEQUENTIAL' | 'PARALLEL')}>
              <SelectTrigger className="w-full" aria-label="Thứ tự ký">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEQUENTIAL">Lần lượt theo thứ tự trên</SelectItem>
                <SelectItem value="PARALLEL">Đồng thời (không theo thứ tự)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-days">Hạn ký (ngày)</Label>
            <Input id="sig-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>
        {misa.data?.ready && hasInternal && (
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <Checkbox className="mt-0.5" checked={digital} onCheckedChange={(v) => setDigital(!!v)} />
            <span>
              <span className="font-medium">Người ký nội bộ ký bằng chữ ký số MISA eSign</span>
              <span className="block text-xs text-muted-foreground">
                Đối tác ký trước qua liên kết + OTP; sau đó người ký nội bộ ký số (chứng thư MISA eSign) lên bản PDF gồm nội dung và chữ ký các bên – hệ thống tự xếp
                người ký số sau cùng. Bản PDF ký số kiểm tra được bằng Adobe Reader.
              </span>
            </span>
          </label>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="sig-msg">Lời nhắn trong email mời ký</Label>
          <Textarea id="sig-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Send />} Gửi yêu cầu ký
        </Button>
      </CardContent>
    </Card>
  );
}

function SignDialog({ contract, request, open, onClose }: { contract: ContractDetail; request: SignatureRequestInfo; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [mark, setMark] = useState<SignatureMark | null>(null);
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const sign = useMutation({
    meta: { silent: true },
    mutationFn: () => api<{ outcome: string }>(`/contracts/${contract.id}/signature/sign`, { method: 'POST', body: { ...mark, password, consent } }),
    onSuccess: (r) => {
      toast.success(r.outcome === 'COMPLETED' ? 'Đã ký – hợp đồng hoàn tất ký' : 'Đã ký thành công');
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['signatures'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Ký thất bại'),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ký hợp đồng {contract.code}</DialogTitle>
          <DialogDescription>Vui lòng đọc kỹ nội dung trước khi ký. Mã băm văn bản: {request.documentHash.slice(0, 16)}…</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <SignedDocument snapshot={request.contentSnapshot} documentHash={request.documentHash} signers={request.signers} showCertificate={false} />
        </div>
        <SignaturePad defaultName={user?.fullName} onChange={setMark} />
        <div className="space-y-1.5">
          <Label htmlFor="sign-password">Mật khẩu tài khoản (xác nhận người ký)</Label>
          <Input id="sign-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
          Tôi đã đọc, đồng ý với nội dung hợp đồng và đồng ý ký bằng phương thức điện tử; chữ ký này có giá trị như chữ ký tay.
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => sign.mutate()} disabled={!mark || !password || !consent || sign.isPending}>
            {sign.isPending ? <Loader2 className="animate-spin" /> : <PenLine />} Ký hợp đồng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ contractId, open, onClose }: { contractId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const reject = useMutation({
    mutationFn: () => api<undefined>(`/contracts/${contractId}/signature/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Đã từ chối ký');
      qc.invalidateQueries({ queryKey: ['contract', contractId] });
      onClose();
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Từ chối ký</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reject-reason">Lý do *</Label>
          <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="destructive" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
            Từ chối ký
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ contract, request }: { contract: ContractDetail; request: SignatureRequestInfo }) {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [digitalSigning, setDigitalSigning] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const active = request.status === 'IN_PROGRESS';
  const mine = active && request.signers.find((s) => s.userId === user?.id && s.status === 'PENDING');
  const canManage = active && can('contract.update');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contract', contract.id] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['signatures'] });
  };
  /** Bản PDF để ký số: tạo một lần từ nội dung đóng băng + chữ ký các bên đã ký, thêm trang "Chữ ký số". */
  const prepareDigitalPdf = async () => {
    if (request.signedDocumentId) return;
    const file = await contractPdfFile({
      fileName: `${contract.code} - ban ky so`,
      title: `${contract.code} – ${contract.title}`,
      html: request.contentSnapshot,
      signed: { documentHash: request.documentHash, signers: request.signers },
      digitalSigners: request.signers.filter((x) => x.method === 'MISA_ESIGN').map((x) => x.name),
    });
    const fd = new FormData();
    fd.append('file', file);
    await api(`/contracts/${contract.id}/signature/digital-pdf`, { method: 'POST', formData: fd });
  };

  const resend = useMutation({
    mutationFn: (signerId: string) => api<{ url: string }>(`/contracts/${contract.id}/signature/signers/${signerId}/resend`, { method: 'POST' }),
    onSuccess: async (r, signerId) => {
      setLinks((l) => ({ ...l, [signerId]: r.url }));
      try {
        await navigator.clipboard.writeText(r.url);
        toast.success('Đã cấp liên kết mới, gửi lại email và sao chép liên kết');
      } catch {
        toast.success('Đã cấp liên kết mới và gửi lại email');
      }
    },
  });
  const cancel = useMutation({
    mutationFn: () => api<undefined>(`/contracts/${contract.id}/signature/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã hủy yêu cầu ký');
      qc.invalidateQueries({ queryKey: ['contract', contract.id] });
    },
  });

  return (
    <div className="space-y-4">
      {mine && (
        <Card className="border-amber-500/50">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Đến lượt bạn ký</CardTitle>
              <CardDescription>Hạn ký: {formatDateTime(request.expiresAt)}</CardDescription>
            </div>
            <div className="flex gap-2">
              {mine.method === 'MISA_ESIGN' ? (
                <Button onClick={() => setDigitalSigning(true)}>
                  <FileKey2 /> Ký số MISA eSign
                </Button>
              ) : (
                <Button onClick={() => setSigning(true)}>
                  <PenLine /> Ký ngay
                </Button>
              )}
              <Button variant="outline" onClick={() => setRejecting(true)}>
                <X /> Từ chối
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              Yêu cầu ký · {REQUEST_STATUS[request.status]}
            </CardTitle>
            <CardDescription>
              Gửi bởi {request.createdBy.fullName} lúc {formatDateTime(request.createdAt)} · {request.signingOrder === 'SEQUENTIAL' ? 'Ký lần lượt' : 'Ký đồng thời'} · Hạn{' '}
              {formatDateTime(request.expiresAt)}
              {request.completedAt && ` · Kết thúc ${formatDateTime(request.completedAt)}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {request.signedDocumentId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadFile(`/contracts/${contract.id}/documents/${request.signedDocumentId}/download`).catch((e: Error) => toast.error(e.message))}
              >
                <Download /> Tải PDF ký số
              </Button>
            )}
            {request.status === 'COMPLETED' && (
              <Button variant="outline" size="sm" asChild>
                <a href={`/print/contracts/${contract.id}?doc=signed`} target="_blank" rel="noopener">
                  <Printer /> In / Tải PDF
                </a>
              </Button>
            )}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirm({
                    title: 'Hủy yêu cầu ký?',
                    description: 'Các liên kết ký sẽ hết hiệu lực; hợp đồng trở về trạng thái Đã phê duyệt.',
                    destructive: true,
                    confirmLabel: 'Hủy yêu cầu',
                    onConfirm: () => cancel.mutateAsync().then(() => undefined),
                  })
                }
              >
                <Ban /> Hủy yêu cầu
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {request.signers.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="w-5 text-muted-foreground">{s.order}.</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{s.partyRole ? ROLE_LABELS[s.partyRole] : ''}</span>
                <span className="text-xs text-muted-foreground">
                  {s.email} · {s.method === 'EMAIL_OTP' ? 'Liên kết + OTP' : s.method === 'MISA_ESIGN' ? 'Chữ ký số MISA eSign' : 'Tài khoản nội bộ'}
                </span>
                <Badge variant={SIGNER_STATUS[s.status].variant}>{SIGNER_STATUS[s.status].label}</Badge>
                {s.signedAt && <span className="text-xs text-muted-foreground">{formatDateTime(s.signedAt)}</span>}
                {s.rejectReason && <span className="w-full pl-8 text-xs text-destructive">Lý do: {s.rejectReason}</span>}
                {s.evidence?.certSubject && (
                  <span className="w-full pl-8 text-xs text-muted-foreground">
                    Chứng thư: {s.evidence.certSubject}
                    {s.evidence.transactionId && ` · Giao dịch MISA: ${s.evidence.transactionId}`}
                  </span>
                )}
                {canManage && s.method === 'EMAIL_OTP' && (s.status === 'PENDING' || s.status === 'WAITING') && (
                  <Button variant="ghost" size="sm" className="ml-auto" disabled={resend.isPending} onClick={() => resend.mutate(s.id)}>
                    <Link2 /> Gửi lại liên kết
                  </Button>
                )}
                {links[s.id] && (
                  <span className="flex w-full items-center gap-2 pl-8 text-xs">
                    <code className="truncate">{links[s.id]}</code>
                    <Button variant="ghost" size="icon-sm" aria-label="Sao chép liên kết" onClick={() => navigator.clipboard.writeText(links[s.id]).then(() => toast.success('Đã sao chép'))}>
                      <Copy />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs break-all text-muted-foreground">SHA-256 văn bản: {request.documentHash}</p>
        </CardContent>
      </Card>

      {(request.status === 'COMPLETED' || request.status === 'IN_PROGRESS') && (
        <SignedDocument snapshot={request.contentSnapshot} documentHash={request.documentHash} signers={request.signers} />
      )}

      {mine && <SignDialog contract={contract} request={request} open={signing} onClose={() => setSigning(false)} />}
      {mine && digitalSigning && (
        <MisaEsignDialog
          contractId={contract.id}
          signature={{ prepare: prepareDigitalPdf }}
          onClose={() => {
            setDigitalSigning(false);
            refresh();
          }}
          onSigned={() => {
            setDigitalSigning(false);
            refresh();
          }}
        />
      )}
      <RejectDialog contractId={contract.id} open={rejecting} onClose={() => setRejecting(false)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

export function ContractSignatureTab({ contract }: { contract: ContractDetail }) {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['contract', contract.id, 'signature', contract.updatedAt],
    queryFn: () => api<SignatureRequestInfo[]>(`/contracts/${contract.id}/signature`),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-48" />;

  const current = q.data.find((r) => r.status === 'IN_PROGRESS') ?? q.data.find((r) => r.status === 'COMPLETED');
  const past = q.data.filter((r) => r !== current);
  const canCreate = contract.status === 'APPROVED' && !contract.archivedAt && !contract.deletedAt && can('contract.update');

  return (
    <div className="space-y-4">
      {current ? (
        <RequestCard contract={contract} request={current} />
      ) : canCreate ? (
        <CreateRequest contract={contract} />
      ) : (
        <EmptyState
          title="Chưa có yêu cầu ký"
          description={contract.status === 'APPROVED' ? undefined : 'Hợp đồng cần được phê duyệt trước khi gửi ký.'}
        />
      )}
      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Lịch sử yêu cầu ký</h3>
          {past.map((r) => (
            <details key={r.id} className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer">
                <span className="font-medium">{REQUEST_STATUS[r.status]}</span> · gửi {formatDateTime(r.createdAt)} bởi {r.createdBy.fullName}
                {r.completedAt && ` · kết thúc ${formatDateTime(r.completedAt)}`}
              </summary>
              <ul className="mt-2 space-y-1">
                {r.signers.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    {s.status === 'SIGNED' ? <Check className="size-4 text-emerald-600" /> : <X className="size-4 text-muted-foreground" />}
                    {s.name} · {SIGNER_STATUS[s.status].label}
                    {s.rejectReason && <span className="text-xs text-destructive">– {s.rejectReason}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
