'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatCompact, formatDate, formatMoney } from '@/lib/format';
import { type PlatformOverview, Pill, SUBSCRIPTION_STATUS, usePlatformGate } from '@/lib/platform';

function Kpi({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <Card className="h-full gap-1 py-4 transition-colors hover:bg-muted/40">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function PlatformOverviewPage() {
  const { allowed, denied } = usePlatformGate();
  const q = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api<PlatformOverview>('/platform/overview'), enabled: allowed });
  if (!allowed) return denied;
  const o = q.data;

  return (
    <>
      <PageHeader title="Tổng quan nền tảng" description="Doanh nghiệp, thuê bao và doanh thu toàn hệ thống." crumbs={[{ label: 'Super Admin' }, { label: 'Tổng quan' }]} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !o ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Doanh nghiệp" value={o.tenants.total} hint={`+${o.tenants.newThisMonth} trong tháng`} href="/platform/tenants" />
            <Kpi label="Tạm ngưng / đóng" value={(o.tenants.byStatus.SUSPENDED ?? 0) + (o.tenants.byStatus.CLOSED ?? 0)} href="/platform/tenants" />
            <Kpi label="Thuê bao trả phí" value={o.subscriptions.active} hint={`${o.subscriptions.trial} đang dùng thử`} />
            <Kpi label="Doanh thu định kỳ / tháng" value={formatCompact(Number(o.subscriptions.mrr))} hint="MRR theo đơn giá gói" />
            <Kpi label="Chờ thanh toán" value={formatCompact(Number(o.invoices.unpaidAmount))} hint={`${o.invoices.unpaidCount} hóa đơn`} href="/platform/invoices?status=ISSUED" />
            <Kpi
              label="Hóa đơn quá hạn"
              value={<span className={o.invoices.overdueCount ? 'text-destructive' : ''}>{o.invoices.overdueCount}</span>}
              hint={formatMoney(o.invoices.overdueAmount)}
              href="/platform/invoices?status=OVERDUE"
            />
          </div>
          {o.tenants.withoutSubscription > 0 && (
            <p role="alert" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {o.tenants.withoutSubscription} doanh nghiệp đang hoạt động nhưng không có gói hiệu lực — họ không thể tạo hợp đồng, người dùng hay tải tài liệu mới.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Theo gói dịch vụ</CardTitle>
              </CardHeader>
              <CardContent>
                {o.byPlan.length === 0 ? (
                  <EmptyState title="Chưa có thuê bao" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gói</TableHead>
                        <TableHead className="text-right">Doanh nghiệp</TableHead>
                        <TableHead className="text-right">MRR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {o.byPlan.map((p) => (
                        <TableRow key={p.planId}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.tenants}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(p.mrr)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="mt-3 text-sm text-muted-foreground">Đã thu trong tháng: {formatMoney(o.invoices.paidThisMonth)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Thuê bao hết hạn trong 30 ngày</CardTitle>
              </CardHeader>
              <CardContent>
                {o.expiring.length === 0 ? (
                  <EmptyState title="Không có thuê bao sắp hết hạn" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Doanh nghiệp</TableHead>
                        <TableHead>Gói</TableHead>
                        <TableHead>Hết hạn</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {o.expiring.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Link href={`/platform/tenants/${s.tenant.id}`} className="font-medium hover:underline">
                              {s.tenant.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {s.plan.name} <Pill {...SUBSCRIPTION_STATUS[s.status]} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(s.endsAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
