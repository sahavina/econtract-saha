'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { errorList, FormErrors, type Invoice, invoiceState, Pill, type TenantRef } from '@/lib/platform';

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** Phát hành hóa đơn; bỏ trống số tiền ⇒ đơn giá tháng của gói hiện hành × số tháng. */
export function CreateInvoiceDialog({
  tenants,
  fixedTenant,
  monthlyPrice,
  onClose,
}: {
  tenants?: TenantRef[];
  fixedTenant?: TenantRef;
  monthlyPrice?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState({ tenantId: fixedTenant?.id ?? '', periodStart: firstOfMonth(), months: '1', amount: '', dueDate: '', description: '', note: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api<Invoice>('/platform/invoices', { method: 'POST', body: d }),
    onSuccess: (inv) => {
      toast.success(`Đã phát hành hóa đơn ${inv.number}`);
      qc.invalidateQueries({ queryKey: ['platform'] });
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  const estimate = monthlyPrice && Number(d.months) > 0 ? Number(monthlyPrice) * Number(d.months) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Phát hành hóa đơn</DialogTitle>
          <DialogDescription>{fixedTenant ? fixedTenant.name : 'Hóa đơn thu phí thuê bao theo kỳ.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!fixedTenant && (
            <div className="space-y-1.5">
              <Label>Doanh nghiệp *</Label>
              <Select value={d.tenantId} onValueChange={(v) => set({ tenantId: v })}>
                <SelectTrigger className="w-full" aria-label="Doanh nghiệp">
                  <SelectValue placeholder="Chọn doanh nghiệp" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-start">Kỳ bắt đầu *</Label>
              <Input id="inv-start" type="date" value={d.periodStart} onChange={(e) => set({ periodStart: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-months">Số tháng *</Label>
              <Input id="inv-months" type="number" min={1} max={36} value={d.months} onChange={(e) => set({ months: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-amount">Số tiền (₫)</Label>
              <Input id="inv-amount" type="number" min={0} value={d.amount} placeholder={estimate !== null ? String(estimate) : 'Theo đơn giá gói'} onChange={(e) => set({ amount: e.target.value })} />
              {estimate !== null && !d.amount && <p className="text-xs text-muted-foreground">Theo gói: {formatMoney(estimate)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-due">Hạn thanh toán</Label>
              <Input id="inv-due" type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              {!d.dueDate && <p className="text-xs text-muted-foreground">Mặc định 15 ngày sau khi phát hành</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-desc">Diễn giải</Label>
            <Input id="inv-desc" value={d.description} placeholder="Tự sinh theo gói và kỳ" onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-note">Ghi chú nội bộ</Label>
            <Textarea id="inv-note" rows={2} value={d.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <FormErrors errors={errors} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={save.isPending || !d.tenantId} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Phát hành
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidInvoiceDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const run = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/platform/invoices/${invoice!.id}/void`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Đã hủy hóa đơn');
      qc.invalidateQueries({ queryKey: ['platform'] });
      setReason('');
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy hóa đơn {invoice?.number}</DialogTitle>
          <DialogDescription>Hóa đơn đã hủy không thể khôi phục; phát hành hóa đơn mới nếu cần.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Lý do *</Label>
          <Textarea id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <FormErrors errors={errors} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="destructive" disabled={run.isPending || !reason.trim()} onClick={() => run.mutate()}>
            Hủy hóa đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bảng hóa đơn kèm thao tác ghi nhận thanh toán / hủy. */
export function InvoiceTable({ invoices, showTenant }: { invoices: Invoice[]; showTenant?: boolean }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const pay = useMutation({
    mutationFn: (id: string) => api(`/platform/invoices/${id}/pay`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã ghi nhận thanh toán');
      qc.invalidateQueries({ queryKey: ['platform'] });
    },
  });

  if (!invoices.length) return <EmptyState title="Chưa có hóa đơn" />;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Số hóa đơn</TableHead>
            {showTenant && <TableHead>Doanh nghiệp</TableHead>}
            <TableHead>Diễn giải</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead>Hạn thanh toán</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium whitespace-nowrap">{inv.number}</TableCell>
              {showTenant && (
                <TableCell>
                  {inv.tenant && (
                    <Link href={`/platform/tenants/${inv.tenant.id}`} className="hover:underline">
                      {inv.tenant.name}
                    </Link>
                  )}
                </TableCell>
              )}
              <TableCell className="min-w-56 text-sm whitespace-normal">
                {inv.description}
                {inv.note && <p className="text-xs text-muted-foreground">{inv.note}</p>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(inv.amount)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(inv.dueDate)}</TableCell>
              <TableCell>
                <Pill {...invoiceState(inv)} />
                {inv.paidAt && <p className="text-xs text-muted-foreground">{formatDate(inv.paidAt)}</p>}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {inv.status === 'ISSUED' && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Ghi nhận thanh toán ${inv.number}`}
                      disabled={pay.isPending}
                      onClick={() =>
                        setConfirm({
                          title: `Ghi nhận đã thanh toán ${inv.number}?`,
                          description: `Số tiền ${formatMoney(inv.amount)}. Thao tác không thể hoàn tác.`,
                          confirmLabel: 'Đã thanh toán',
                          onConfirm: () => pay.mutateAsync(inv.id).then(() => undefined),
                        })
                      }
                    >
                      <CircleCheck />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Hủy hóa đơn ${inv.number}`} onClick={() => setVoiding(inv)}>
                      <Ban />
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <VoidInvoiceDialog invoice={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}
