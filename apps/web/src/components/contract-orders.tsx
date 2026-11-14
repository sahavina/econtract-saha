'use client';

import { formatQtyVi, ORDER_FULFILLMENT_LABELS, orderFulfillment, orderTotals, toScaled } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Truck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/page-header';
import { ContractStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { FULFILLMENT_BADGE, orderProgress } from '@/lib/orders';
import type { ContractDetail, ContractListItem, OrderSummary } from '@/lib/types';

const QTY = /^\d{1,15}(\.\d{1,3})?$/;
const num = (v: string) => String(Number(v));

/** Hàng hóa của đơn và cập nhật số lượng đã giao (khi đơn đã ký). */
export function OrderItemsTab({ order }: { order: ContractDetail }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canDeliver = ['SIGNED', 'ACTIVE'].includes(order.status) && !order.archivedAt && !order.deletedAt && can('contract.update');
  // Giá trị đang sửa; khóa theo id dòng (khởi tạo từ dữ liệu đã lưu, không đồng bộ trong effect).
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(order.items.map((i) => [i.id, num(i.deliveredQty)])));
  const save = useMutation({
    mutationFn: () =>
      api<ContractDetail>(`/contracts/${order.id}/delivery`, {
        method: 'PATCH',
        body: { items: order.items.map((i) => ({ id: i.id, deliveredQty: draft[i.id] || '0' })) },
      }),
    onSuccess: () => {
      toast.success('Đã cập nhật số lượng đã giao');
      qc.invalidateQueries({ queryKey: ['contract', order.id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
  if (!order.items.length) return <EmptyState title="Đơn chưa có dòng hàng" description="Thêm hàng hóa ở trang Sửa (khi đơn còn Nháp)." />;

  const totals = orderTotals(order.items, order.vatRate);
  const invalid = order.items.some((i) => !QTY.test(draft[i.id] ?? '') || toScaled(draft[i.id], 3) > toScaled(i.quantity, 3));
  const changed = order.items.some((i) => toScaled(draft[i.id], 3) !== toScaled(i.deliveredQty, 3));
  const fulfillment = orderFulfillment(order.items);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            Hàng hóa & giao hàng
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FULFILLMENT_BADGE[fulfillment]}`}>{ORDER_FULFILLMENT_LABELS[fulfillment]}</span>
          </CardTitle>
          <CardDescription>
            {canDeliver
              ? 'Nhập số lượng đã giao của từng dòng rồi bấm Lưu; mỗi lần cập nhật được ghi vào lịch sử hoạt động.'
              : 'Cập nhật số lượng đã giao khi đơn đã ký.'}
          </CardDescription>
        </div>
        {canDeliver && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(Object.fromEntries(order.items.map((i) => [i.id, num(i.quantity)])))}>
              <Truck /> Giao đủ tất cả
            </Button>
            <Button size="sm" disabled={!changed || invalid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="animate-spin" />} Lưu giao hàng
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Hàng hóa</TableHead>
                <TableHead>ĐVT</TableHead>
                <TableHead className="text-right">Số lượng</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
                <TableHead className="w-40 text-right">Đã giao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((i, k) => {
                const v = draft[i.id] ?? '';
                const over = QTY.test(v) && toScaled(v, 3) > toScaled(i.quantity, 3);
                return (
                  <TableRow key={i.id}>
                    <TableCell>{k + 1}</TableCell>
                    <TableCell>
                      <span className="font-medium">{i.name}</span>
                      {i.code && <span className="ml-1 text-xs text-muted-foreground">({i.code})</span>}
                    </TableCell>
                    <TableCell>{i.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQtyVi(i.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQtyVi(i.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQtyVi(i.amount)}</TableCell>
                    <TableCell className="text-right">
                      {canDeliver ? (
                        <>
                          <Input
                            inputMode="decimal"
                            className="ml-auto h-8 w-28 text-right"
                            aria-label={`Đã giao – ${i.name}`}
                            aria-invalid={over || !QTY.test(v)}
                            value={v}
                            onChange={(e) => setDraft({ ...draft, [i.id]: e.target.value.trim() })}
                          />
                          {over && <p className="text-xs text-destructive">Vượt số lượng đặt</p>}
                        </>
                      ) : (
                        <span className="tabular-nums">{formatQtyVi(i.deliveredQty)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right">Cộng tiền hàng</TableCell>
                <TableCell className="text-right tabular-nums">{formatQtyVi(totals.subtotal)}</TableCell>
                <TableCell />
              </TableRow>
              {totals.vatAmount !== null && (
                <>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">Thuế GTGT ({Number(order.vatRate)}%)</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQtyVi(totals.vatAmount)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-semibold">Tổng thanh toán</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatQtyVi(totals.total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </>
              )}
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Các đơn đặt hàng thuộc một hợp đồng nguyên tắc. */
export function ContractOrdersTab({ contract }: { contract: ContractDetail }) {
  const { can } = useAuth();
  const filter = { parentContractId: contract.id };
  const orders = useQuery({
    queryKey: ['orders', 'by-parent', contract.id],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { ...filter, kind: 'ORDER', pageSize: 100 } }),
  });
  const summary = useQuery({
    queryKey: ['orders', 'summary', filter],
    queryFn: () => api<OrderSummary>('/contracts/order-summary', { query: filter }),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Đơn đặt hàng theo hợp đồng này</CardTitle>
          <CardDescription>
            {summary.data
              ? `${summary.data.count} đơn · tổng ${formatMoney(summary.data.value)} · đã giao ${formatMoney(summary.data.deliveredValue)} · còn phải giao ${formatMoney(summary.data.remainingValue)}`
              : 'Đang tổng hợp…'}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/orders?parentContractId=${contract.id}`}>Mở danh sách đơn</Link>
          </Button>
          {can('contract.create') && !contract.deletedAt && (
            <Button size="sm" asChild>
              <Link href={`/orders/new?parent=${contract.id}`}>
                <Plus /> Tạo đơn đặt hàng
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : !orders.data ? (
          <Skeleton className="h-32" />
        ) : orders.data.items.length === 0 ? (
          <EmptyState title="Chưa có đơn đặt hàng thuộc hợp đồng này" />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số đơn</TableHead>
                  <TableHead>Ngày giao</TableHead>
                  <TableHead className="text-right">Giá trị</TableHead>
                  <TableHead>Giao hàng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data.items.map((o) => {
                  const p = orderProgress(o);
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/contracts/${o.id}`} className="font-medium text-primary hover:underline">
                          {o.code}
                        </Link>
                        <p className="text-xs text-muted-foreground">{o.title}</p>
                      </TableCell>
                      <TableCell>{formatDate(o.deliveryDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(o.value, o.currency)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FULFILLMENT_BADGE[p.fulfillment]}`}>
                          {ORDER_FULFILLMENT_LABELS[p.fulfillment]}
                          {p.fulfillment === 'PARTIAL' && ` · ${p.percent}%`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={o.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
