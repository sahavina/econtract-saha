'use client';

import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { formatQuotaMb, formatStorage, type Invoice, invoiceState, Pill, SUBSCRIPTION_STATUS, type SubscriptionStatus, type Usage, UsageBar } from '@/lib/platform';

interface MyBilling {
  subscription: {
    id: string;
    status: SubscriptionStatus;
    startsAt: string;
    endsAt: string | null;
    plan: { code: string; name: string; description: string | null; maxUsers: number; maxContractsYear: number; storageQuotaMb: number; priceMonthly: string };
  } | null;
  usage: Usage;
  invoices: Invoice[];
}

/** Gói dịch vụ, mức sử dụng và hóa đơn của doanh nghiệp (chỉ xem; đổi gói qua nhà cung cấp). */
export default function BillingPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['billing'], queryFn: () => api<MyBilling>('/billing'), enabled: can('settings.manage') });
  if (!can('settings.manage')) return <p className="text-sm text-muted-foreground">Bạn không có quyền xem gói dịch vụ.</p>;
  const b = q.data;
  const plan = b?.subscription?.plan;

  return (
    <>
      <PageHeader title="Gói dịch vụ" description="Liên hệ nhà cung cấp để đổi gói hoặc gia hạn." crumbs={[{ label: 'Quản trị' }, { label: 'Gói dịch vụ' }]} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !b ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gói hiện hành</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {!b.subscription || !plan ? (
                  <p role="alert" className="text-destructive">
                    Doanh nghiệp chưa có gói dịch vụ còn hiệu lực. Bạn vẫn xem và xử lý được dữ liệu hiện có nhưng không thể tạo hợp đồng, người dùng hay tải tài liệu mới.
                  </p>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                      {plan.name} <Pill {...SUBSCRIPTION_STATUS[b.subscription.status]} />
                    </p>
                    {plan.description && <p className="text-muted-foreground">{plan.description}</p>}
                    <p>Đơn giá: {formatMoney(plan.priceMonthly)} / tháng</p>
                    <p>
                      Hiệu lực: {formatDate(b.subscription.startsAt)} – {b.subscription.endsAt ? formatDate(b.subscription.endsAt) : 'không thời hạn'}
                    </p>
                    {b.subscription.status === 'PAST_DUE' && <p className="text-amber-700 dark:text-amber-400">Thuê bao đang quá hạn thanh toán, vui lòng thanh toán hóa đơn để tránh gián đoạn.</p>}
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mức sử dụng</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <UsageBar label="Người dùng (không tính tài khoản vô hiệu)" used={b.usage.users} limit={plan?.maxUsers ?? null} display={`${b.usage.users} / ${plan?.maxUsers ?? '—'}`} />
                <UsageBar
                  label={`Hợp đồng tạo trong năm ${new Date().getFullYear()}`}
                  used={b.usage.contractsThisYear}
                  limit={plan?.maxContractsYear ?? null}
                  display={`${b.usage.contractsThisYear.toLocaleString('vi-VN')} / ${plan?.maxContractsYear.toLocaleString('vi-VN') ?? '—'}`}
                />
                <UsageBar
                  label="Dung lượng lưu trữ"
                  used={b.usage.storageBytes}
                  limit={plan ? plan.storageQuotaMb * 1024 * 1024 : null}
                  display={`${formatStorage(b.usage.storageBytes)} / ${plan ? formatQuotaMb(plan.storageQuotaMb) : '—'}`}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hóa đơn</CardTitle>
            </CardHeader>
            <CardContent>
              {b.invoices.length === 0 ? (
                <EmptyState title="Chưa có hóa đơn" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Số hóa đơn</TableHead>
                      <TableHead>Diễn giải</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Hạn thanh toán</TableHead>
                      <TableHead>Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium whitespace-nowrap">{inv.number}</TableCell>
                        <TableCell className="min-w-56 text-sm whitespace-normal">{inv.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(inv.amount)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell>
                          <Pill {...invoiceState(inv)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
