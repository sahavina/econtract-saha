'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Check, Copy, Link2, Loader2, RotateCcw, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { ContractDetail, ContractFeedbackItem, PreviewVersion, ShareLink, ShareLinkState } from '@/lib/types';

interface LinksResponse {
  mailEnabled: boolean;
  items: ShareLink[];
}
export interface FeedbackResponse {
  current: PreviewVersion;
  newCount: number;
  items: ContractFeedbackItem[];
}

const STATE: Record<ShareLinkState, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  ACTIVE: { label: 'Đang hiệu lực', variant: 'default' },
  EXPIRED: { label: 'Hết hạn', variant: 'secondary' },
  REVOKED: { label: 'Đã thu hồi', variant: 'outline' },
};
const CLOSED = ['CANCELLED', 'LIQUIDATED', 'ARCHIVED'];

export const feedbackKey = (contractId: string) => ['contract', contractId, 'feedback'];

/** Danh sách yêu cầu của khách (dùng chung cho badge ở tab). */
export function useContractFeedback(contractId: string) {
  return useQuery({ queryKey: feedbackKey(contractId), queryFn: () => api<FeedbackResponse>(`/contracts/${contractId}/feedback`) });
}

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Đã sao chép link');
  } catch {
    toast.error('Không sao chép được, hãy chọn và sao chép thủ công');
  }
}

function CreateLinkDialog({ contract, mailEnabled, open, onClose }: { contract: ContractDetail; mailEnabled: boolean; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  // Bên đối tác: ưu tiên bên đã liên kết danh mục đối tác, rồi bên có email.
  const external = contract.parties.filter((p) => !p.isInternal);
  const partner = external.find((p) => p.partner) ?? external.find((p) => p.email) ?? external[0];
  const [recipientName, setRecipientName] = useState(partner?.representative ?? partner?.name ?? '');
  const [recipientEmail, setRecipientEmail] = useState(partner?.email ?? '');
  const [days, setDays] = useState('14');
  const [sendEmail, setSendEmail] = useState(mailEnabled && !!partner?.email);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<{ url: string; emailed: boolean }>(`/contracts/${contract.id}/share-links`, {
        method: 'POST',
        body: { recipientName, recipientEmail, expiresInDays: Number(days), sendEmail: mailEnabled && sendEmail, message },
      }),
    onSuccess: async (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['contract', contract.id, 'share-links'] });
      qc.invalidateQueries({ queryKey: ['contract', contract.id, 'timeline'] });
      await copy(r.url);
    },
  });
  const fieldError = (f: string) => (create.error instanceof ApiError ? create.error.errors.find((e) => e.field === f)?.message : undefined);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link xem trước cho khách hàng</DialogTitle>
          <DialogDescription>Khách mở link (không cần tài khoản) để đọc bản hiện tại của hợp đồng và gửi yêu cầu bổ sung/thay đổi.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link xem trước" />
              <Button variant="outline" size="icon" aria-label="Sao chép link" onClick={() => copy(result.url)}>
                <Copy />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {result.emailed ? `Đã gửi email tới ${recipientEmail}. ` : ''}Link chỉ hiển thị một lần – hãy sao chép ngay. Cần link khác thì tạo link mới.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Xong</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sl-name">Người nhận</Label>
                <Input id="sl-name" maxLength={120} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sl-email">Email người nhận</Label>
                <Input id="sl-email" type="email" maxLength={200} value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
                {fieldError('recipientEmail') && <p className="text-xs text-destructive">{fieldError('recipientEmail')}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl-days">Hiệu lực (ngày)</Label>
              <Input id="sl-days" type="number" min={1} max={90} className="w-28" value={days} onChange={(e) => setDays(e.target.value)} />
              {fieldError('expiresInDays') && <p className="text-xs text-destructive">{fieldError('expiresInDays')}</p>}
            </div>
            {mailEnabled ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sendEmail} onCheckedChange={(c) => setSendEmail(!!c)} /> Gửi link qua email cho người nhận
                </label>
                {sendEmail && (
                  <div className="space-y-1.5">
                    <Label htmlFor="sl-msg">Lời nhắn trong email</Label>
                    <Textarea id="sl-msg" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Máy chủ chưa cấu hình gửi email (SMTP) – sao chép link và gửi cho khách qua kênh khác.</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Tạo link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackCard({ item, current, contractId, canManage }: { item: ContractFeedbackItem; current: PreviewVersion; contractId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [replying, setReplying] = useState(false);
  const [response, setResponse] = useState(item.response ?? '');
  const update = useMutation({
    mutationFn: (status: 'NEW' | 'RESOLVED') =>
      api<undefined>(`/contracts/${contractId}/feedback/${item.id}`, { method: 'PATCH', body: status === 'RESOLVED' ? { status, response } : { status } }),
    onSuccess: (_r, status) => {
      setReplying(false);
      toast.success(status === 'RESOLVED' ? 'Đã đánh dấu đã xử lý' : 'Đã mở lại yêu cầu');
      qc.invalidateQueries({ queryKey: feedbackKey(contractId) });
      qc.invalidateQueries({ queryKey: ['contract', contractId, 'timeline'] });
    },
  });
  const agree = item.kind === 'AGREE';

  return (
    <li className={`rounded-lg border p-4 ${item.status === 'NEW' ? 'border-primary/40 bg-primary/5' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {agree ? (
          <Badge variant="secondary"><ThumbsUp /> Đồng ý nội dung</Badge>
        ) : (
          <Badge variant="outline">Yêu cầu thay đổi</Badge>
        )}
        <Badge variant={item.status === 'NEW' ? 'default' : 'outline'}>{item.status === 'NEW' ? 'Mới' : 'Đã xử lý'}</Badge>
        <span className="text-sm font-medium">{item.name}</span>
        <span className="text-sm text-muted-foreground">{item.contact}</span>
        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Khách xem {item.revisionSeq ? `phiên bản #${item.revisionSeq}` : 'bản gốc'}
        {item.link.recipientName || item.link.recipientEmail ? ` · qua link gửi ${item.link.recipientName ?? item.link.recipientEmail}` : ''}
      </p>
      {item.outdated && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          Nội dung hợp đồng đã thay đổi sau khi khách xem{current.seq ? ` (khách xem ${item.revisionSeq ? `#${item.revisionSeq}` : 'bản gốc'}, hiện tại #${current.seq})` : ''}. Xem tab Lịch sử chỉnh sửa để đối chiếu.
        </p>
      )}
      {item.clauseRef && <p className="mt-2 text-sm"><span className="text-muted-foreground">Liên quan:</span> {item.clauseRef}</p>}
      {item.message && <p className="mt-1 text-sm whitespace-pre-wrap">{item.message}</p>}
      {item.status === 'RESOLVED' && (
        <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-sm">
          <span className="text-muted-foreground">{item.resolvedByName} xử lý {formatDateTime(item.resolvedAt)}</span>
          {item.response && <span className="block whitespace-pre-wrap">Phản hồi: {item.response}</span>}
        </p>
      )}
      {canManage && (
        <div className="mt-3">
          {replying ? (
            <div className="space-y-2">
              <Textarea rows={2} maxLength={2000} placeholder="Phản hồi cho khách (khách thấy trên trang xem trước, không bắt buộc)" value={response} onChange={(e) => setResponse(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={update.isPending} onClick={() => update.mutate('RESOLVED')}>
                  {update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Đánh dấu đã xử lý
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>Hủy</Button>
              </div>
            </div>
          ) : item.status === 'NEW' ? (
            <Button size="sm" variant="outline" onClick={() => setReplying(true)}><Check /> Xử lý / phản hồi</Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate('NEW')}><RotateCcw /> Mở lại</Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Tab "Khách hàng góp ý": link xem trước công khai và yêu cầu bổ sung/thay đổi của khách. */
export function ContractFeedbackTab({ contract }: { contract: ContractDetail }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const links = useQuery({
    queryKey: ['contract', contract.id, 'share-links'],
    queryFn: () => api<LinksResponse>(`/contracts/${contract.id}/share-links`),
  });
  const feedback = useContractFeedback(contract.id);
  const canManage = can('contract.share');
  const shareable = !contract.deletedAt && !contract.archivedAt && !CLOSED.includes(contract.status);

  const revoke = useMutation({
    mutationFn: (linkId: string) => api<undefined>(`/contracts/${contract.id}/share-links/${linkId}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã thu hồi link');
      qc.invalidateQueries({ queryKey: ['contract', contract.id, 'share-links'] });
      qc.invalidateQueries({ queryKey: ['contract', contract.id, 'timeline'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Link xem trước cho khách hàng</CardTitle>
            <CardDescription>Link công khai, chỉ đọc, luôn hiển thị bản hiện tại của hợp đồng; có hạn dùng và thu hồi được.</CardDescription>
          </div>
          {canManage && shareable && links.data && (
            <Button onClick={() => setCreating(true)}><Link2 /> Tạo link xem trước</Button>
          )}
        </CardHeader>
        <CardContent>
          {links.isError ? (
            <ErrorState error={links.error} onRetry={() => links.refetch()} />
          ) : !links.data ? (
            <Skeleton className="h-20" />
          ) : links.data.items.length === 0 ? (
            <EmptyState title="Chưa có link xem trước" description={shareable ? 'Tạo link để gửi bản dự thảo cho khách hàng góp ý.' : 'Hợp đồng đã đóng, không tạo được link.'} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người nhận</TableHead>
                    <TableHead>Tạo bởi</TableHead>
                    <TableHead>Hết hạn</TableHead>
                    <TableHead>Lượt xem</TableHead>
                    <TableHead>Ý kiến</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.data.items.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div>{l.recipientName ?? '—'}</div>
                        {l.recipientEmail && <div className="text-xs text-muted-foreground">{l.recipientEmail}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{l.createdByName}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</div>
                      </TableCell>
                      <TableCell>{formatDateTime(l.expiresAt)}</TableCell>
                      <TableCell>
                        {l.viewCount}
                        {l.lastViewedAt && <div className="text-xs text-muted-foreground">Gần nhất {formatDateTime(l.lastViewedAt)}</div>}
                      </TableCell>
                      <TableCell>{l.feedbackCount}</TableCell>
                      <TableCell>
                        <Badge variant={STATE[l.state].variant}>{STATE[l.state].label}</Badge>
                        {l.revokedByName && <div className="text-xs text-muted-foreground">bởi {l.revokedByName}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && l.state === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setConfirm({
                                title: 'Thu hồi link xem trước?',
                                description: 'Khách sẽ không mở được link này nữa.',
                                destructive: true,
                                confirmLabel: 'Thu hồi',
                                onConfirm: () => revoke.mutateAsync(l.id),
                              })
                            }
                          >
                            <Ban /> Thu hồi
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Yêu cầu của khách hàng
            {!!feedback.data?.newCount && <Badge>{feedback.data.newCount} mới</Badge>}
          </CardTitle>
          <CardDescription>
            Bản hiện tại{feedback.data?.current.seq ? `: phiên bản #${feedback.data.current.seq}` : ''}. Yêu cầu gửi trên bản cũ được đánh dấu để đối chiếu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedback.isError ? (
            <ErrorState error={feedback.error} onRetry={() => feedback.refetch()} />
          ) : !feedback.data ? (
            <Skeleton className="h-20" />
          ) : feedback.data.items.length === 0 ? (
            <EmptyState title="Chưa có yêu cầu nào" />
          ) : (
            <ul className="space-y-3">
              {feedback.data.items.map((f) => (
                <FeedbackCard key={f.id} item={f} current={feedback.data.current} contractId={contract.id} canManage={canManage} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {links.data && creating && <CreateLinkDialog contract={contract} mailEnabled={links.data.mailEnabled} open={creating} onClose={() => setCreating(false)} />}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
