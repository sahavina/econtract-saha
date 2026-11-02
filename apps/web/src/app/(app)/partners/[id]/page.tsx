'use client';

import { fromScaled, ORDER_FULFILLMENT_LABELS, PARTNER_TYPE_LABELS, SHIPPING_NOTE_STATUS_LABELS, STOCK_ISSUE_STATUS_LABELS, toScaled } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ContractDownloadButton } from '@/components/contract-download-button';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { ContractStatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { isOdooPartner, useOdooConfig } from '@/lib/odoo';
import { FULFILLMENT_BADGE, orderProgress } from '@/lib/orders';
import type { ContractListItem, OrderSummary, PartnerDetail, PaymentListItem, ShippingNoteListItem, StockIssueListItem } from '@/lib/types';

const PAGE_SIZE = 20;
/** Giới hạn dòng của `/lifecycle`: chạm mức này thì tổng thanh toán chưa đủ. */
const PAYMENT_LIMIT = 300;
const PAYMENT_STATUS = { PLANNED: 'Chưa thanh toán', PARTIAL: 'Thanh toán một phần', PAID: 'Đã thanh toán', CANCELLED: 'Đã hủy' } as const;
const ENTITY_LABELS = { ORGANIZATION: 'Tổ chức', INDIVIDUAL: 'Cá nhân' } as const;

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Pager({ data, onPage }: { data: Paginated<unknown>; onPage: (page: number) => void }) {
  if (data.totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}><ChevronLeft /></Button>
      Trang {data.page}/{data.totalPages}
      <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={data.page >= data.totalPages} onClick={() => onPage(data.page + 1)}><ChevronRight /></Button>
    </div>
  );
}

/** Đợt còn phải thanh toán mà đã qua hạn (so theo ngày, cùng cách API tính). */
const isOverdue = (p: PaymentListItem, today: string) => (p.status === 'PLANNED' || p.status === 'PARTIAL') && !!p.dueDate && p.dueDate.slice(0, 10) < today;

/** Cộng tiền theo từng đơn vị tiền tệ của hợp đồng, không gộp ₫ với USD. */
function sumByCurrency(rows: { currency: string; amount: string }[]): string {
  const totals = new Map<string, bigint>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? BigInt(0)) + toScaled(r.amount, 2));
  if (!totals.size) return formatMoney(0);
  return [...totals].map(([currency, n]) => formatMoney(fromScaled(n, 2), currency)).join(' · ');
}

const remainingOf = (p: PaymentListItem) => fromScaled(toScaled(p.amount, 2) - toScaled(p.paidAmount, 2), 2);

/** Chi tiết đối tác: thông tin chung, hợp đồng, đơn đặt hàng, thanh toán, xuất kho và giao hàng. */
export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const initialTab = useSearchParams().get('tab');
  const { can } = useAuth();
  const canContracts = can('contract.view_all') || can('contract.view_own');
  const canDeliveries = can('delivery.manage') || can('contract.view_all');
  const [contractPage, setContractPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [issuePage, setIssuePage] = useState(1);
  const [notePage, setNotePage] = useState(1);

  const partner = useQuery({ queryKey: ['partners', 'detail', id], queryFn: () => api<PartnerDetail>(`/partners/${id}`) });
  const odoo = useOdooConfig();
  const contracts = useQuery({
    queryKey: ['contracts', 'by-partner', id, contractPage],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'CONTRACT', partnerId: id, page: contractPage, pageSize: PAGE_SIZE } }),
    enabled: canContracts,
    placeholderData: keepPreviousData,
  });
  const orders = useQuery({
    queryKey: ['orders', 'by-partner', id, orderPage],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'ORDER', partnerId: id, page: orderPage, pageSize: PAGE_SIZE } }),
    enabled: canContracts,
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['orders', 'summary', 'by-partner', id],
    queryFn: () => api<OrderSummary>('/contracts/order-summary', { query: { partnerId: id } }),
    enabled: canContracts,
  });
  const payments = useQuery({
    queryKey: ['lifecycle', 'payments', 'by-partner', id],
    queryFn: () => api<PaymentListItem[]>('/lifecycle', { query: { kind: 'payments', view: 'all', partnerId: id } }),
    enabled: canContracts,
  });
  const issues = useQuery({
    queryKey: ['stock-issues', 'by-partner', id, issuePage],
    queryFn: () => api<Paginated<StockIssueListItem>>('/stock-issues', { query: { partnerId: id, page: issuePage, pageSize: PAGE_SIZE } }),
    enabled: canDeliveries,
    placeholderData: keepPreviousData,
  });
  const notes = useQuery({
    queryKey: ['shipping-notes', 'by-partner', id, notePage],
    queryFn: () => api<Paginated<ShippingNoteListItem>>('/shipping-notes', { query: { partnerId: id, page: notePage, pageSize: PAGE_SIZE } }),
    enabled: canDeliveries,
    placeholderData: keepPreviousData,
  });

  if (partner.isError) return <ErrorState error={partner.error} onRetry={() => partner.refetch()} />;
  if (!partner.data) return <Skeleton className="h-96" />;

  const p = partner.data;
  const typeLabel = PARTNER_TYPE_LABELS[p.type];
  const odooId = isOdooPartner(p) ? p.externalRef!.slice('odoo:'.length) : null;
  const odooUrl = odooId && odoo.data?.url?.startsWith('http') ? `${odoo.data.url.replace(/\/+$/, '')}/web#id=${encodeURIComponent(odooId)}&model=res.partner&view_type=form` : null;

  const today = new Date().toISOString().slice(0, 10);
  const livePayments = (payments.data ?? []).filter((x) => x.status !== 'CANCELLED');
  const overdue = livePayments.filter((x) => isOverdue(x, today));

  const issueCount = issues.data?.total;
  const noteCount = notes.data?.total;
  const deliveryCount = issueCount === undefined || noteCount === undefined ? '…' : issueCount + noteCount;

  return (
    <>
      <PageHeader
        title={
          <>
            {p.name}
            {odooId && <Badge variant="outline" className="ml-2 align-middle text-[10px]">Odoo</Badge>}
          </>
        }
        crumbs={[{ label: 'Đối tác', href: '/partners' }, { label: typeLabel, href: `/partners?type=${p.type}` }, { label: p.code }]}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Mã đối tác">{p.code}</Info>
            <Info label="Phân loại"><Badge variant="secondary">{typeLabel}</Badge></Info>
            <Info label="Loại chủ thể">{ENTITY_LABELS[p.entityType]}</Info>
            <Info label="Tên viết tắt">{p.shortName}</Info>
            <Info label="Mã số thuế">{p.taxCode}</Info>
            {p.idNumber && <Info label="Số giấy tờ">{p.idNumber}</Info>}
            <Info label="Người đại diện">{p.representative && `${p.representative}${p.position ? ` (${p.position})` : ''}`}</Info>
            <Info label="Email">{p.email}</Info>
            <Info label="Điện thoại">{p.phone}</Info>
            <Info label="Liên kết Odoo">
              {odooId &&
                (odooUrl ? (
                  <a href={odooUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Mở trên Odoo (#{odooId}) <ExternalLink className="size-3" />
                  </a>
                ) : (
                  `Đối tác Odoo #${odooId}`
                ))}
            </Info>
            <Info label="Địa chỉ" className="sm:col-span-2">{p.address}</Info>
            {p.note && <Info label="Ghi chú" className="sm:col-span-2 lg:col-span-4">{p.note}</Info>}
          </dl>
          {p.contacts.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-xs text-muted-foreground">Người liên hệ</p>
              <ul className="space-y-1 text-sm">
                {p.contacts.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.fullName}</span>
                    {c.position && ` (${c.position})`}
                    {[c.email, c.phone].filter(Boolean).length > 0 && ` · ${[c.email, c.phone].filter(Boolean).join(' · ')}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {canContracts && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Tổng hợp</CardTitle>
            <CardDescription>
              Theo dữ liệu trong hệ thống hợp đồng, không gồm hồ sơ đã lưu trữ{can('contract.view_all') ? '' : ', chỉ trong phạm vi hồ sơ bạn được xem'}. Giá trị đơn chưa gồm VAT.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!summary.data || !payments.data || !contracts.data ? (
              <Skeleton className="h-16" />
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="Hợp đồng" value={`${contracts.data.total}`} />
                <Stat label="Đơn đặt hàng" value={`${summary.data.count}`} hint={`${summary.data.signed} đơn đã ký · ${formatMoney(summary.data.value)}`} />
                <Stat label="Đơn: còn phải giao" value={formatMoney(summary.data.remainingValue)} hint={`Đã giao ${formatMoney(summary.data.deliveredValue)}`} />
                {/* Chưa khai báo đợt nào ⇒ không hiện 0 ₫, tránh hiểu nhầm là không còn công nợ. */}
                <Stat
                  label="Còn phải thanh toán"
                  value={livePayments.length ? sumByCurrency(livePayments.map((x) => ({ currency: x.contract.currency, amount: remainingOf(x) }))) : '—'}
                  hint={livePayments.length ? `Đã thanh toán ${sumByCurrency(livePayments.map((x) => ({ currency: x.contract.currency, amount: x.paidAmount })))}` : 'Chưa khai báo đợt thanh toán'}
                />
                <Stat
                  label="Quá hạn thanh toán"
                  value={livePayments.length ? sumByCurrency(overdue.map((x) => ({ currency: x.contract.currency, amount: remainingOf(x) }))) : '—'}
                  hint={livePayments.length ? `${overdue.length} đợt` : undefined}
                />
              </dl>
            )}
          </CardContent>
        </Card>
      )}

      {(canContracts || canDeliveries) && (
        <Tabs defaultValue={initialTab ?? (canContracts ? 'contracts' : 'deliveries')}>
          <TabsList className="h-auto flex-wrap justify-start">
            {canContracts && (
              <>
                <TabsTrigger value="contracts">Hợp đồng ({contracts.data?.total ?? '…'})</TabsTrigger>
                <TabsTrigger value="orders">Đơn đặt hàng ({orders.data?.total ?? '…'})</TabsTrigger>
                <TabsTrigger value="payments">Thanh toán ({payments.data?.length ?? '…'})</TabsTrigger>
              </>
            )}
            {canDeliveries && <TabsTrigger value="deliveries">Xuất kho & giao hàng ({deliveryCount})</TabsTrigger>}
          </TabsList>

          {canContracts && (
            <>
              <TabsContent value="contracts">
                {contracts.isError ? (
                  <ErrorState error={contracts.error} onRetry={() => contracts.refetch()} />
                ) : !contracts.data ? (
                  <Skeleton className="h-40" />
                ) : !contracts.data.items.length ? (
                  <EmptyState title="Chưa có hợp đồng" description="Đối tác này chưa là một bên trong hợp đồng nào." />
                ) : (
                  <>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mã hợp đồng</TableHead>
                            <TableHead>Loại</TableHead>
                            <TableHead>Hiệu lực</TableHead>
                            <TableHead>Hết hạn</TableHead>
                            <TableHead className="text-right">Giá trị</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead className="text-right">Tải</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contracts.data.items.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>
                                <Link href={`/contracts/${c.id}`} className="font-medium text-primary hover:underline">{c.code}</Link>
                                <p className="max-w-80 truncate text-xs text-muted-foreground" title={c.title}>{c.title}</p>
                              </TableCell>
                              <TableCell>{c.contractType?.name ?? '—'}</TableCell>
                              <TableCell className="whitespace-nowrap">{formatDate(c.effectiveDate)}</TableCell>
                              <TableCell className="whitespace-nowrap">{formatDate(c.expiryDate)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(c.value, c.currency)}</TableCell>
                              <TableCell><ContractStatusBadge status={c.status} /></TableCell>
                              <TableCell className="text-right"><ContractDownloadButton id={c.id} code={c.code} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pager data={contracts.data} onPage={setContractPage} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="orders">
                {orders.isError ? (
                  <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
                ) : !orders.data ? (
                  <Skeleton className="h-40" />
                ) : !orders.data.items.length ? (
                  <EmptyState title="Chưa có đơn đặt hàng" description="Chưa có đơn đặt hàng nào của đối tác này trong hệ thống hợp đồng." />
                ) : (
                  <>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Số đơn</TableHead>
                            <TableHead>Hợp đồng nguyên tắc</TableHead>
                            <TableHead>Ngày giao</TableHead>
                            <TableHead className="text-right">Giá trị</TableHead>
                            <TableHead>Giao hàng</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead className="text-right">Tải</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.data.items.map((o) => {
                            const progress = orderProgress(o);
                            return (
                              <TableRow key={o.id}>
                                <TableCell>
                                  <Link href={`/contracts/${o.id}`} className="font-medium text-primary hover:underline">{o.code}</Link>
                                  <p className="max-w-80 truncate text-xs text-muted-foreground" title={o.title}>{o.title}</p>
                                </TableCell>
                                <TableCell>
                                  {o.parentContract ? <Link href={`/contracts/${o.parentContract.id}?tab=orders`} className="hover:underline">{o.parentContract.code}</Link> : '—'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{formatDate(o.deliveryDate)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(o.value, o.currency)}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${FULFILLMENT_BADGE[progress.fulfillment]}`}>
                                    {ORDER_FULFILLMENT_LABELS[progress.fulfillment]}
                                    {progress.fulfillment === 'PARTIAL' && ` · ${progress.percent}%`}
                                  </span>
                                </TableCell>
                                <TableCell><ContractStatusBadge status={o.status} /></TableCell>
                                <TableCell className="text-right"><ContractDownloadButton id={o.id} code={o.code} /></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <Pager data={orders.data} onPage={setOrderPage} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="payments">
                {payments.isError ? (
                  <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
                ) : !payments.data ? (
                  <Skeleton className="h-40" />
                ) : !payments.data.length ? (
                  <EmptyState title="Chưa có đợt thanh toán" description="Các đợt thanh toán được khai báo trong tab Vòng đời của từng hợp đồng hoặc đơn hàng." />
                ) : (
                  <>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hồ sơ</TableHead>
                            <TableHead>Đợt</TableHead>
                            <TableHead>Hạn</TableHead>
                            <TableHead className="text-right">Số tiền</TableHead>
                            <TableHead className="text-right">Đã thanh toán</TableHead>
                            <TableHead>Số hóa đơn</TableHead>
                            <TableHead>Trạng thái</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.data.map((x) => (
                            <TableRow key={x.id}>
                              <TableCell><Link href={`/contracts/${x.contract.id}?tab=lifecycle`} className="font-medium text-primary hover:underline">{x.contract.code}</Link></TableCell>
                              <TableCell>{x.title}</TableCell>
                              <TableCell className={`whitespace-nowrap ${isOverdue(x, today) ? 'font-medium text-destructive' : ''}`}>{formatDate(x.dueDate)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(x.amount, x.contract.currency)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(x.paidAmount, x.contract.currency)}</TableCell>
                              <TableCell>{x.invoiceNo ?? '—'}</TableCell>
                              <TableCell><Badge variant={x.status === 'PAID' ? 'default' : x.status === 'PARTIAL' ? 'secondary' : 'outline'}>{PAYMENT_STATUS[x.status]}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {payments.data.length >= PAYMENT_LIMIT && (
                      <p className="mt-2 text-xs text-muted-foreground">Chỉ hiện và cộng {PAYMENT_LIMIT} đợt có hạn sớm nhất, số tổng hợp có thể chưa đủ.</p>
                    )}
                  </>
                )}
              </TabsContent>
            </>
          )}

          {canDeliveries && (
            <TabsContent value="deliveries" className="space-y-6">
              <section>
                <h2 className="mb-2 text-sm font-medium">Phiếu xuất kho</h2>
                {issues.isError ? (
                  <ErrorState error={issues.error} onRetry={() => issues.refetch()} />
                ) : !issues.data ? (
                  <Skeleton className="h-24" />
                ) : !issues.data.items.length ? (
                  <EmptyState title="Chưa có phiếu xuất kho" description="Chỉ tính các phiếu lập từ đơn đặt hàng của đối tác này." />
                ) : (
                  <>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Số phiếu</TableHead>
                            <TableHead>Ngày xuất</TableHead>
                            <TableHead>Đơn hàng</TableHead>
                            <TableHead>Người nhận</TableHead>
                            <TableHead className="text-right">Thành tiền</TableHead>
                            <TableHead>Trạng thái</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {issues.data.items.map((i) => (
                            <TableRow key={i.id}>
                              <TableCell><Link href={`/stock-issues/${i.id}`} className="font-medium text-primary hover:underline">{i.code}</Link></TableCell>
                              <TableCell className="whitespace-nowrap">{formatDate(i.issueDate)}</TableCell>
                              <TableCell>{i.order ? <Link href={`/contracts/${i.order.id}`} className="hover:underline">{i.order.code}</Link> : '—'}</TableCell>
                              <TableCell>{i.receiverName}</TableCell>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(i.totalAmount)}</TableCell>
                              <TableCell><Badge variant={i.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{STOCK_ISSUE_STATUS_LABELS[i.status]}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pager data={issues.data} onPage={setIssuePage} />
                  </>
                )}
              </section>

              <section>
                <h2 className="mb-2 text-sm font-medium">Phiếu gửi hàng</h2>
                {notes.isError ? (
                  <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
                ) : !notes.data ? (
                  <Skeleton className="h-24" />
                ) : !notes.data.items.length ? (
                  <EmptyState title="Chưa có phiếu gửi hàng" description="Chỉ tính các phiếu gắn với đơn đặt hàng của đối tác này." />
                ) : (
                  <>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Số phiếu</TableHead>
                            <TableHead>Ngày gửi</TableHead>
                            <TableHead>Đơn hàng</TableHead>
                            <TableHead>Nơi nhận</TableHead>
                            <TableHead>Chành xe</TableHead>
                            <TableHead>Trạng thái</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {notes.data.items.map((n) => (
                            <TableRow key={n.id}>
                              <TableCell><Link href={`/shipping-labels/${n.id}`} className="font-medium text-primary hover:underline">{n.code}</Link></TableCell>
                              <TableCell className="whitespace-nowrap">{formatDate(n.sendDate)}</TableCell>
                              <TableCell>{n.order ? <Link href={`/contracts/${n.order.id}`} className="hover:underline">{n.order.code}</Link> : '—'}</TableCell>
                              <TableCell className="max-w-80 truncate" title={n.toAddress}>{n.toCompany}</TableCell>
                              <TableCell>{n.carrier ?? '—'}</TableCell>
                              <TableCell><Badge variant="secondary">{SHIPPING_NOTE_STATUS_LABELS[n.status]}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pager data={notes.data} onPage={setNotePage} />
                  </>
                )}
              </section>
            </TabsContent>
          )}
        </Tabs>
      )}
    </>
  );
}
