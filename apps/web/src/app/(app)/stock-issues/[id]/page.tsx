'use client';

import { formatQtyVi, SHIPPING_NOTE_STATUS_LABELS, STOCK_ISSUE_STATUS_LABELS } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, Loader2, Printer, Truck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyProfile } from '@/lib/company';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { downloadStockIssuePdf, openStockIssuePdf } from '@/lib/stock-issue-pdf';
import type { StockIssueDetail } from '@/lib/types';

export default function StockIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const company = useCompanyProfile();
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const issue = useQuery({ queryKey: ['stock-issue', id], queryFn: () => api<StockIssueDetail>(`/stock-issues/${id}`) });
  const cancel = useMutation({
    mutationFn: () => api(`/stock-issues/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Đã hủy phiếu xuất kho');
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ['stock-issue', id] });
      qc.invalidateQueries({ queryKey: ['stock-issues'] });
      qc.invalidateQueries({ queryKey: ['contract'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (issue.isError) return <ErrorState error={issue.error} onRetry={() => issue.refetch()} />;
  if (!issue.data) return <Skeleton className="h-96" />;
  const s = issue.data;
  const cancelled = s.status === 'CANCELLED';
  const companyInfo = { name: company.data?.name ?? '', address: company.data?.address };

  const pdf = async (kind: 'pdf' | 'print') => {
    setBusy(kind);
    try {
      await (kind === 'pdf' ? downloadStockIssuePdf(s, companyInfo) : openStockIssuePdf(s, companyInfo));
    } catch (e) {
      toast.error(`Không tạo được PDF: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
    } finally {
      setBusy(null);
    }
  };

  const info = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '—'}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Phiếu xuất kho {s.code}
            <Badge variant={cancelled ? 'destructive' : 'secondary'}>{STOCK_ISSUE_STATUS_LABELS[s.status]}</Badge>
          </span>
        }
        description={`Ngày xuất ${formatDate(s.issueDate)} · Người lập: ${s.createdBy.fullName}`}
        crumbs={[{ label: 'Phiếu xuất kho', href: '/stock-issues' }, { label: s.code }]}
        actions={
          <>
            <Button onClick={() => pdf('print')} disabled={!!busy || !company.data}>
              {busy === 'print' ? <Loader2 className="animate-spin" /> : <Printer />} In phiếu (02-VT)
            </Button>
            <Button variant="outline" onClick={() => pdf('pdf')} disabled={!!busy || !company.data}>
              {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <Download />} Tải PDF
            </Button>
            {can('delivery.manage') && !cancelled && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/shipping-labels/new?stockIssue=${s.id}`}>
                    <Truck /> Tạo phiếu gửi hàng
                  </Link>
                </Button>
                <Button variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
                  <Ban /> Hủy phiếu
                </Button>
              </>
            )}
          </>
        }
      />

      {cancelled && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Phiếu đã hủy lúc {formatDateTime(s.cancelledAt)}: {s.cancelReason}. {s.order && 'Số lượng đã trả lại cho đơn đặt hàng.'}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Thông tin phiếu</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {info('Người nhận hàng', s.receiverName)}
              {info('Đơn vị / bộ phận', s.receiverUnit)}
              {info('Địa chỉ', s.receiverAddress)}
              {info('Lý do xuất kho', s.reason)}
              {info('Xuất tại kho', s.warehouse)}
              {info('Địa điểm kho', s.warehouseAddress)}
              {info('Tài khoản Nợ / Có', [s.debitAccount, s.creditAccount].filter(Boolean).join(' / '))}
              {info('Chứng từ gốc kèm theo', s.attachments)}
              {info(
                'Đơn đặt hàng',
                s.order && (
                  <Link href={`/contracts/${s.order.id}`} className="text-primary hover:underline">
                    {s.order.code}
                  </Link>
                ),
              )}
              {info('Ghi chú', s.note)}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phiếu gửi hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {s.shippingNotes.length === 0 ? (
              <p className="text-muted-foreground">Chưa có phiếu gửi hàng cho phiếu xuất này.</p>
            ) : (
              s.shippingNotes.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2">
                  <Link href={`/shipping-labels/${n.id}`} className="font-medium text-primary hover:underline">
                    {n.code}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(n.sendDate)}</span>
                  <Badge variant="outline">{SHIPPING_NOTE_STATUS_LABELS[n.status]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Hàng hóa ({s.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>STT</TableHead>
                <TableHead>Tên hàng hóa</TableHead>
                <TableHead>Mã số</TableHead>
                <TableHead>ĐVT</TableHead>
                <TableHead className="text-right">SL yêu cầu</TableHead>
                <TableHead className="text-right">SL thực xuất</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.items.map((i, k) => (
                <TableRow key={i.id}>
                  <TableCell>{k + 1}</TableCell>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>{i.code ?? '—'}</TableCell>
                  <TableCell>{i.unit ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyVi(i.requestedQty)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyVi(i.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(i.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(i.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={7} className="text-right font-medium">
                  Cộng
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatMoney(s.totalAmount)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy phiếu xuất kho {s.code}?</DialogTitle>
            <DialogDescription>{s.order ? `Số lượng thực xuất được trừ lại khỏi "đã giao" của đơn ${s.order.code}.` : 'Phiếu chuyển sang Đã hủy, vẫn lưu để tra cứu.'}</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Lý do hủy *</span>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Đóng
            </Button>
            <Button variant="destructive" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? <Loader2 className="animate-spin" /> : <Ban />} Hủy phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
