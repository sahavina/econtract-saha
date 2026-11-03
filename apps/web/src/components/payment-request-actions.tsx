'use client';

import { buildTemplateValues, PAYMENT_SEND_METHOD_LABELS, PAYMENT_SEND_METHODS, type PaymentSendMethod, renderTemplate } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Loader2, Mail, Paperclip, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { contractPdfFile } from '@/lib/contract-pdf';
import { fileBase, paymentRequestPdfFile, paymentValues, requestFromSaved } from '@/lib/payment-request';
import type { ContractDetail, PaymentRequestDetail, PaymentRequestListItem, TemplateDetail } from '@/lib/types';

const MISSING_MARK = /<mark data-missing="(?:empty|unknown)">\{\{[^<]*?\}\}<\/mark>/g;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** PDF theo nội dung đã lưu: đúng mẫu đã chọn, không có mẫu thì dùng mẫu SAHA dựng sẵn. */
async function buildPdf(request: PaymentRequestDetail, contract: ContractDetail | undefined): Promise<File> {
  const r = requestFromSaved(request);
  if (!request.templateId) return paymentRequestPdfFile(r);
  const template = await api<TemplateDetail>(`/templates/${request.templateId}`);
  const rendered = renderTemplate(template.contentHtml, { ...(contract ? buildTemplateValues(contract) : {}), ...paymentValues(r) });
  return contractPdfFile({ fileName: fileBase(r), title: `Đề nghị thanh toán ${r.number}`, html: rendered.html.replace(MISSING_MARK, '……') });
}

/** Nút theo trạng thái: chưa gửi ⇒ Đã gửi, Gửi email; đã gửi ⇒ Đã thanh toán, Gửi lại email. */
export function PaymentRequestActions({ request, size = 'default' }: { request: PaymentRequestListItem; size?: 'sm' | 'default' }) {
  const { can } = useAuth();
  const [open, setOpen] = useState<'sent' | 'paid' | 'email' | null>(null);
  if (!can('payment_request.manage') || request.status === 'PAID' || request.status === 'CANCELLED') return null;
  const close = () => setOpen(null);
  const sent = request.status === 'SENT';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sent ? (
        <Button size={size} onClick={() => setOpen('paid')}>
          <CircleCheck /> Đã thanh toán
        </Button>
      ) : (
        <Button size={size} onClick={() => setOpen('sent')}>
          <Send /> Đã gửi
        </Button>
      )}
      <Button size={size} variant="outline" onClick={() => setOpen('email')}>
        <Mail /> {sent ? 'Gửi lại email' : 'Gửi email'}
      </Button>
      {open === 'sent' && <MarkSentDialog request={request} onClose={close} />}
      {open === 'paid' && <MarkPaidDialog request={request} onClose={close} />}
      {open === 'email' && <SendEmailDialog id={request.id} onClose={close} />}
    </div>
  );
}

function useDone(onClose: () => void, message: string) {
  const qc = useQueryClient();
  return (id: string) => {
    qc.invalidateQueries({ queryKey: ['payment-requests'] });
    qc.invalidateQueries({ queryKey: ['payment-request', id] });
    toast.success(message);
    onClose();
  };
}

function MarkSentDialog({ request, onClose }: { request: PaymentRequestListItem; onClose: () => void }) {
  const [method, setMethod] = useState<PaymentSendMethod>('ZALO');
  const [note, setNote] = useState('');
  const done = useDone(onClose, `Đã đánh dấu gửi đề nghị ${request.number}`);
  const save = useMutation({
    mutationFn: () => api<{ id: string }>(`/payment-requests/${request.id}/mark-sent`, { method: 'POST', body: { method, note } }),
    onSuccess: (x) => done(x.id),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đánh dấu đã gửi</DialogTitle>
          <DialogDescription>
            Đề nghị {request.number} gửi {request.recipient}. Hệ thống ghi nhận thời điểm và người gửi, không tự gửi gì cho khách.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pr-method">Cách gửi</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentSendMethod)}>
              <SelectTrigger id="pr-method" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_SEND_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_SEND_METHOD_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-note">Ghi chú</Label>
            <Textarea id="pr-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: gửi chị Thủy, phòng mua hàng" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Xác nhận đã gửi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ request, onClose }: { request: PaymentRequestListItem; onClose: () => void }) {
  const [date, setDate] = useState(today());
  const done = useDone(onClose, `Đã đánh dấu thanh toán đề nghị ${request.number}`);
  const save = useMutation({
    mutationFn: () => api<{ id: string }>(`/payment-requests/${request.id}/mark-paid`, { method: 'POST', body: { date } }),
    onSuccess: (x) => done(x.id),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đánh dấu đã thanh toán</DialogTitle>
          <DialogDescription>Đề nghị {request.number} của {request.recipient}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pr-paid">Ngày thanh toán</Label>
          <Input id="pr-paid" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={!date || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Xác nhận đã thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendEmailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const request = useQuery({ queryKey: ['payment-request', id], queryFn: () => api<PaymentRequestDetail>(`/payment-requests/${id}`) });
  const contract = useQuery({
    queryKey: ['contract', request.data?.contractId],
    queryFn: () => api<ContractDetail>(`/contracts/${request.data!.contractId}`),
    enabled: !!request.data?.contractId,
    retry: false,
  });
  const contractReady = !request.data?.contractId || !contract.isPending;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gửi email đề nghị thanh toán</DialogTitle>
          <DialogDescription>Đính kèm PDF theo nội dung đã lưu; nếu vừa sửa đề nghị, hãy bấm “Lưu thay đổi” trước khi gửi. Gửi được thì đề nghị chuyển sang Đã gửi.</DialogDescription>
        </DialogHeader>
        {request.data && contractReady ? (
          <EmailForm request={request.data} contract={contract.data} onClose={onClose} />
        ) : request.isError ? (
          <p className="text-sm text-destructive">{request.error.message}</p>
        ) : (
          <Skeleton className="h-64" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmailForm({ request, contract, onClose }: { request: PaymentRequestDetail; contract: ContractDetail | undefined; onClose: () => void }) {
  const customer = contract?.parties.find((p) => !p.isInternal && p.email);
  const [to, setTo] = useState(request.sentTo ?? customer?.email ?? '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(`Đề nghị thanh toán số ${request.number} – ${request.company}`);
  const [message, setMessage] = useState(
    [
      `Kính gửi ${request.recipient},`,
      '',
      `${request.company} gửi Quý Công ty đề nghị thanh toán số ${request.number} (đính kèm).`,
      'Rất mong nhận được sự quan tâm của Quý đơn vị. Trân trọng cảm ơn!',
    ].join('\n'),
  );
  const done = useDone(onClose, `Đã gửi email đến ${to.trim()}`);
  const fileName = `${fileBase(requestFromSaved(request))}.pdf`;
  const send = useMutation({
    mutationFn: async () => {
      const file = await buildPdf(request, contract);
      const formData = new FormData();
      formData.set('to', to.trim());
      formData.set('cc', cc.trim());
      formData.set('subject', subject);
      formData.set('message', message);
      formData.set('file', file, fileName);
      return api<{ id: string }>(`/payment-requests/${request.id}/send-email`, { method: 'POST', formData });
    },
    onSuccess: (x) => done(x.id),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-to">Gửi đến *</Label>
            <Input id="pr-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ketoan@khachhang.vn" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-cc">CC</Label>
            <Input id="pr-cc" type="email" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-subject">Tiêu đề *</Label>
          <Input id="pr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-message">Nội dung *</Label>
          <Textarea id="pr-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="size-3.5 shrink-0" /> <span className="truncate">{fileName}</span>
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Hủy</Button>
        <Button disabled={!to.trim() || !subject.trim() || !message.trim() || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Gửi email
        </Button>
      </DialogFooter>
    </>
  );
}
