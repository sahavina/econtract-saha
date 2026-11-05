'use client';

import { PAYMENT_SEND_METHOD_LABELS, PAYMENT_SEND_METHODS, type PaymentSendMethod } from '@saha/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

/** Làm mới danh sách và chi tiết, báo thành công, đóng hộp thoại. */
export function useSendDone(listKey: string, detailKey: string, onClose: () => void) {
  const qc = useQueryClient();
  return (id: string, message: string) => {
    qc.invalidateQueries({ queryKey: [listKey] });
    qc.invalidateQueries({ queryKey: [detailKey, id] });
    toast.success(message);
    onClose();
  };
}

/** Đánh dấu đã gửi (tự gửi qua Zalo, giấy…): chọn cách gửi, ghi chú. */
export function MarkSentDialog({
  description,
  path,
  doneMessage,
  listKey,
  detailKey,
  onClose,
}: {
  description: string;
  path: string;
  doneMessage: string;
  listKey: string;
  detailKey: string;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentSendMethod>('ZALO');
  const [note, setNote] = useState('');
  const done = useSendDone(listKey, detailKey, onClose);
  const save = useMutation({
    mutationFn: () => api<{ id: string }>(path, { method: 'POST', body: { method, note } }),
    onSuccess: (x) => done(x.id, doneMessage),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đánh dấu đã gửi</DialogTitle>
          <DialogDescription>{description} Hệ thống ghi nhận thời điểm và người gửi, không tự gửi gì cho khách.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="send-method">Cách gửi</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentSendMethod)}>
              <SelectTrigger id="send-method" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_SEND_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_SEND_METHOD_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-note">Ghi chú</Label>
            <Textarea id="send-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: gửi chị Thủy, phòng mua hàng" />
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

/** Soạn email kèm PDF; tệp PDF tạo lúc bấm gửi. */
export function SendEmailForm({
  defaults,
  fileName,
  buildFile,
  path,
  listKey,
  detailKey,
  onClose,
}: {
  defaults: { to: string; subject: string; message: string };
  fileName: string;
  buildFile: () => Promise<File>;
  path: string;
  listKey: string;
  detailKey: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState(defaults.message);
  const done = useSendDone(listKey, detailKey, onClose);
  const send = useMutation({
    mutationFn: async () => {
      const file = await buildFile();
      const formData = new FormData();
      formData.set('to', to.trim());
      formData.set('cc', cc.trim());
      formData.set('subject', subject);
      formData.set('message', message);
      formData.set('file', file, fileName);
      return api<{ id: string }>(path, { method: 'POST', formData });
    },
    onSuccess: (x) => done(x.id, `Đã gửi email đến ${to.trim()}`),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="send-to">Gửi đến *</Label>
            <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ketoan@khachhang.vn" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-cc">CC</Label>
            <Input id="send-cc" type="email" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-subject">Tiêu đề *</Label>
          <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-message">Nội dung *</Label>
          <Textarea id="send-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
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
