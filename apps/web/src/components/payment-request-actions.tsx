'use client';

import { buildTemplateValues, renderTemplate } from '@saha/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleCheck, Loader2, Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MarkSentDialog, SendEmailForm, useSendDone } from '@/components/send-dialogs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { contractPdfFile } from '@/lib/contract-pdf';
import { fileBase, paymentRequestPdfFile, paymentValues, requestFromSaved } from '@/lib/payment-request';
import type { ContractDetail, PaymentRequestDetail, PaymentRequestListItem, TemplateDetail } from '@/lib/types';

const MISSING_MARK = /<mark data-missing="(?:empty|unknown)">\{\{[^<]*?\}\}<\/mark>/g;
const LIST_KEY = 'payment-requests';
const DETAIL_KEY = 'payment-request';

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
      {open === 'sent' && (
        <MarkSentDialog
          description={`Đề nghị ${request.number} gửi ${request.recipient}.`}
          path={`/payment-requests/${request.id}/mark-sent`}
          doneMessage={`Đã đánh dấu gửi đề nghị ${request.number}`}
          listKey={LIST_KEY}
          detailKey={DETAIL_KEY}
          onClose={close}
        />
      )}
      {open === 'paid' && <MarkPaidDialog request={request} onClose={close} />}
      {open === 'email' && <SendEmailDialog id={request.id} onClose={close} />}
    </div>
  );
}

function MarkPaidDialog({ request, onClose }: { request: PaymentRequestListItem; onClose: () => void }) {
  const [date, setDate] = useState(today());
  const done = useSendDone(LIST_KEY, DETAIL_KEY, onClose);
  const save = useMutation({
    mutationFn: () => api<{ id: string }>(`/payment-requests/${request.id}/mark-paid`, { method: 'POST', body: { date } }),
    onSuccess: (x) => done(x.id, `Đã đánh dấu thanh toán đề nghị ${request.number}`),
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
  const request = useQuery({ queryKey: [DETAIL_KEY, id], queryFn: () => api<PaymentRequestDetail>(`/payment-requests/${id}`) });
  const contract = useQuery({
    queryKey: ['contract', request.data?.contractId],
    queryFn: () => api<ContractDetail>(`/contracts/${request.data!.contractId}`),
    enabled: !!request.data?.contractId,
    retry: false,
  });
  const contractReady = !request.data?.contractId || !contract.isPending;
  const r = request.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gửi email đề nghị thanh toán</DialogTitle>
          <DialogDescription>Đính kèm PDF theo nội dung đã lưu; nếu vừa sửa đề nghị, hãy bấm “Lưu thay đổi” trước khi gửi. Gửi được thì đề nghị chuyển sang Đã gửi.</DialogDescription>
        </DialogHeader>
        {r && contractReady ? (
          <SendEmailForm
            defaults={{
              to: r.sentTo ?? contract.data?.parties.find((p) => !p.isInternal && p.email)?.email ?? '',
              subject: `Đề nghị thanh toán số ${r.number} – ${r.company}`,
              message: [`Kính gửi ${r.recipient},`, '', `${r.company} gửi Quý Công ty đề nghị thanh toán số ${r.number} (đính kèm).`, 'Rất mong nhận được sự quan tâm của Quý đơn vị. Trân trọng cảm ơn!'].join('\n'),
            }}
            fileName={`${fileBase(requestFromSaved(r))}.pdf`}
            buildFile={() => buildPdf(r, contract.data)}
            path={`/payment-requests/${r.id}/send-email`}
            listKey={LIST_KEY}
            detailKey={DETAIL_KEY}
            onClose={onClose}
          />
        ) : request.isError ? (
          <p className="text-sm text-destructive">{request.error.message}</p>
        ) : (
          <Skeleton className="h-64" />
        )}
      </DialogContent>
    </Dialog>
  );
}
