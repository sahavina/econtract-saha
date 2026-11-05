'use client';

import { type QuoteDecision, QUOTE_STATUS_LABELS, quoteDisplayStatus } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleCheck, CircleX, Mail, PackagePlus, Receipt, RotateCcw, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { MarkSentDialog, SendEmailForm } from '@/components/send-dialogs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyProfile } from '@/lib/company';
import { quoteFileName, quotePdfFile } from '@/lib/quote';
import type { QuoteDetail, QuoteListItem } from '@/lib/types';

const LIST_KEY = 'quotes';
const DETAIL_KEY = 'quote';

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Thao tác theo trạng thái: `menu` gọn cho từng dòng danh sách, `buttons` cho trang chi tiết. */
export function QuoteActions({ quote: q, variant }: { quote: QuoteListItem; variant: 'menu' | 'buttons' }) {
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState<'sent' | 'email' | null>(null);
  const decide = useMutation({
    mutationFn: (decision: QuoteDecision) => api<{ id: string }>(`/quotes/${q.id}/decide`, { method: 'POST', body: { decision } }),
    onSuccess: (_, decision) => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, q.id] });
      toast.success(decision === 'REOPEN' ? `Đã mở lại báo giá ${q.code}` : `Báo giá ${q.code}: ${QUOTE_STATUS_LABELS[decision]}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!can('quote.manage')) return null;

  const decided = q.status === 'ACCEPTED' || q.status === 'REJECTED';
  const actions = [
    !decided && q.status === 'DRAFT' && { key: 'sent', label: 'Đã gửi', icon: Send, run: () => setOpen('sent') },
    !decided && q.status === 'SENT' && { key: 'accept', label: 'Khách đồng ý', icon: CircleCheck, run: () => decide.mutate('ACCEPTED') },
    q.status === 'ACCEPTED' && !q.order && { key: 'order', label: 'Tạo đơn đặt hàng', icon: PackagePlus, run: () => router.push(`/orders/new?quote=${q.id}`) },
    !decided && { key: 'email', label: q.sentAt ? 'Gửi lại email' : 'Gửi email', icon: Mail, run: () => setOpen('email') },
    !decided && q.status === 'SENT' && { key: 'reject', label: 'Từ chối', icon: CircleX, run: () => decide.mutate('REJECTED') },
    (q.status === 'SENT' || q.status === 'ACCEPTED') && { key: 'pay', label: 'Lập đề nghị thanh toán', icon: Receipt, run: () => router.push(`/payment-requests/new?quote=${q.id}`) },
    decided && !q.order && { key: 'reopen', label: 'Mở lại', icon: RotateCcw, run: () => decide.mutate('REOPEN') },
  ].filter((a) => !!a);
  if (!actions.length) return null;

  const close = () => setOpen(null);
  return (
    <>
      {variant === 'menu' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Thao tác <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {actions.map((a) => (
              <DropdownMenuItem key={a.key} disabled={decide.isPending} onSelect={a.run}>
                <a.icon /> {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        actions.map((a, i) => (
          <Button key={a.key} variant={i === 0 ? 'default' : 'outline'} disabled={decide.isPending} onClick={a.run}>
            <a.icon /> {a.label}
          </Button>
        ))
      )}
      {open === 'sent' && (
        <MarkSentDialog
          description={`Báo giá ${q.code} gửi ${q.customerName}.`}
          path={`/quotes/${q.id}/mark-sent`}
          doneMessage={`Đã đánh dấu gửi báo giá ${q.code}`}
          listKey={LIST_KEY}
          detailKey={DETAIL_KEY}
          onClose={close}
        />
      )}
      {open === 'email' && <QuoteEmailDialog id={q.id} onClose={close} />}
    </>
  );
}

function QuoteEmailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const quote = useQuery({ queryKey: [DETAIL_KEY, id], queryFn: () => api<QuoteDetail>(`/quotes/${id}`) });
  const company = useCompanyProfile();
  const q = quote.data;
  const from = company.data?.name ?? '';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gửi email báo giá</DialogTitle>
          <DialogDescription>Đính kèm PDF theo nội dung đã lưu; nếu vừa sửa báo giá, hãy lưu trước khi gửi. Gửi được thì báo giá chuyển sang Đã gửi.</DialogDescription>
        </DialogHeader>
        {q && !company.isPending ? (
          <SendEmailForm
            defaults={{
              to: q.sentTo ?? q.customerEmail ?? '',
              subject: `Báo giá số ${q.code}${from ? ` – ${from}` : ''}`,
              message: [`Kính gửi ${q.customerName},`, '', `${from || 'Chúng tôi'} xin gửi Quý Công ty báo giá số ${q.code} (đính kèm).`, 'Rất mong nhận được phản hồi của Quý Công ty. Trân trọng cảm ơn!'].join('\n'),
            }}
            fileName={quoteFileName(q)}
            buildFile={() => quotePdfFile(q, company.data)}
            path={`/quotes/${q.id}/send-email`}
            listKey={LIST_KEY}
            detailKey={DETAIL_KEY}
            onClose={onClose}
          />
        ) : quote.isError ? (
          <p className="text-sm text-destructive">{quote.error.message}</p>
        ) : (
          <Skeleton className="h-64" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export const displayStatus = (q: Pick<QuoteListItem, 'status' | 'validUntil'>) => quoteDisplayStatus(q.status, q.validUntil, todayIso());
