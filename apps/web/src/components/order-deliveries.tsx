'use client';

import { SHIPPING_NOTE_STATUS_LABELS, STOCK_ISSUE_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { ShippingNoteListItem, StockIssueListItem } from '@/lib/types';

/** Phiếu xuất kho và phiếu gửi hàng của một đơn (tab Hàng hóa & giao hàng). */
export function OrderDeliveries({ orderId }: { orderId: string }) {
  const { can } = useAuth();
  const visible = can('delivery.manage') || can('contract.view_all');
  const issues = useQuery({
    queryKey: ['stock-issues', 'order', orderId],
    queryFn: () => api<Paginated<StockIssueListItem>>('/stock-issues', { query: { orderId, pageSize: 50 } }),
    enabled: visible,
  });
  const notes = useQuery({
    queryKey: ['shipping-notes', 'order', orderId],
    queryFn: () => api<Paginated<ShippingNoteListItem>>('/shipping-notes', { query: { orderId, pageSize: 50 } }),
    enabled: visible,
  });
  if (!visible) return null;
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phiếu xuất kho ({issues.data?.total ?? 0})</CardTitle>
          <CardDescription>Lưu phiếu xuất kho tự cộng số lượng đã giao; hủy phiếu thì trừ lại.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(issues.data?.items ?? []).length === 0 ? (
            <p className="text-muted-foreground">Chưa có phiếu xuất kho.</p>
          ) : (
            issues.data!.items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/stock-issues/${i.id}`} className="font-medium text-primary hover:underline">
                  {i.code}
                </Link>
                <span className="text-muted-foreground">{formatDate(i.issueDate)}</span>
                <span className="tabular-nums">{formatMoney(i.totalAmount)}</span>
                <Badge variant={i.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{STOCK_ISSUE_STATUS_LABELS[i.status]}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phiếu gửi hàng ({notes.data?.total ?? 0})</CardTitle>
          <CardDescription>Phiếu dán thùng gửi chành xe đã lưu cho đơn này.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(notes.data?.items ?? []).length === 0 ? (
            <p className="text-muted-foreground">Chưa có phiếu gửi hàng.</p>
          ) : (
            notes.data!.items.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/shipping-labels/${n.id}`} className="font-medium text-primary hover:underline">
                  {n.code}
                </Link>
                <span className="text-muted-foreground">{formatDate(n.sendDate)}</span>
                <span>{n.carrier ?? '—'}</span>
                <Badge variant="outline">{SHIPPING_NOTE_STATUS_LABELS[n.status]}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
