'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useLookups } from '@/lib/queries';

/** Hồ sơ cần kiểm tra: hợp đồng/đơn hoặc đề nghị thanh toán. */
export type InspectionTarget = { kind: string; code: string } & ({ contractId: string; paymentRequestId?: never } | { paymentRequestId: string; contractId?: never });

/** Gửi yêu cầu kiểm tra hồ sơ (hợp đồng/đơn, đề nghị thanh toán) cho một người phụ trách; xong thì mở trang yêu cầu. */
export function InspectionRequestDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: InspectionTarget;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const lookups = useLookups();
  const isOrder = target.kind === 'ORDER';
  const isPayment = target.kind === 'PAYMENT_REQUEST';
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [content, setContent] = useState(
    isOrder ? 'Kiểm tra số lượng, quy cách, chất lượng hàng hóa trước khi giao.' : isPayment ? 'Kiểm tra số tiền, căn cứ thanh toán và thông tin tài khoản thụ hưởng trước khi gửi khách.' : '',
  );
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const send = useMutation({
    meta: { silent: true },
    mutationFn: () => api<{ id: string; code: string }>('/inspections', { method: 'POST', body: { contractId: target.contractId, paymentRequestId: target.paymentRequestId, assigneeId, content, dueDate } }),
    onSuccess: (r) => {
      toast.success(`Đã gửi yêu cầu kiểm tra ${r.code}`);
      qc.invalidateQueries({ queryKey: ['inspections'] });
      onClose();
      router.push(`/inspections/${r.id}`);
    },
    onError: (e) => setErrors(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message) : [e instanceof Error ? e.message : 'Gửi thất bại']),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yêu cầu kiểm tra {target.code}</DialogTitle>
          <DialogDescription>Người phụ trách nhận thông báo và thấy yêu cầu trong mục Yêu cầu kiểm tra; có thể in phiếu kèm mã QR.</DialogDescription>
        </DialogHeader>
        <form
          id="inspection-request"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors([]);
            if (!assigneeId) return setErrors(['Chọn người phụ trách kiểm tra']);
            send.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Người phụ trách kiểm tra *</Label>
            <FilterSelect
              className="w-full"
              allLabel="— Chọn người phụ trách —"
              ariaLabel="Người phụ trách kiểm tra"
              value={assigneeId}
              onChange={setAssigneeId}
              options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: `${u.fullName} · ${u.email}` }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspection-content">Nội dung cần kiểm tra *</Label>
            <Textarea id="inspection-content" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Kiểm tra số lượng, quy cách, điều khoản thanh toán…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspection-due">Hạn xử lý</Label>
            <Input id="inspection-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-48" />
          </div>
          {errors.length > 0 && (
            <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
              {errors.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" form="inspection-request" disabled={send.isPending || !content.trim()}>
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Gửi yêu cầu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
