'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarRange, FileText, HardDrive, type LucideIcon, Package, Receipt, Users, Wallet } from 'lucide-react';
import { ListCard, MobileCard, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { formatQuotaMb, formatStorage, type Invoice, invoiceState, SUBSCRIPTION_STATUS, type SubscriptionStatus, type Usage } from '@/lib/platform';
import { cn } from '@/lib/utils';

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

/** Màu nhãn trạng thái thuê bao (nhãn lấy từ SUBSCRIPTION_STATUS). */
const SUB_TONE: Record<SubscriptionStatus, Tone> = { TRIAL: 'sky', ACTIVE: 'green', PAST_DUE: 'amber', CANCELLED: 'gray', EXPIRED: 'gray' };

/** Màu nhãn hóa đơn, khớp với invoiceState. */
const invoiceTone = (inv: Invoice): Tone => (inv.status === 'PAID' ? 'green' : inv.status === 'VOID' ? 'gray' : inv.overdue ? 'red' : 'amber');

function InvoicePill({ inv }: { inv: Invoice }) {
  return <StatusPill tone={invoiceTone(inv)}>{invoiceState(inv).label}</StatusPill>;
}

/** Khung mục kiểu FormSection: biểu tượng + tiêu đề, thân bên dưới. */
function Section({ icon: Icon, title, className, children }: { icon: LucideIcon; title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05),0_1px_2px_-1px_rgb(15_23_42/0.04)]', className)}>
      <header className="flex min-h-14 items-center gap-3 border-b px-5 py-2.5">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Thẻ mức sử dụng: biểu tượng trong ô màu, số đã dùng / hạn mức, thanh tiến độ đổi màu khi gần chạm ngưỡng. */
function UsageMeter({ icon: Icon, tone, label, used, limit, display }: { icon: LucideIcon; tone: string; label: string; used: number; limit: number | null; display: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
      <div className="flex items-center gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tone)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
          <p className="text-lg leading-tight font-bold tabular-nums">{display}</p>
        </div>
      </div>
      {limit !== null && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
          <span className={cn('w-10 text-right text-xs tabular-nums', pct >= 100 ? 'font-semibold text-destructive' : pct >= 80 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {Math.round(pct)}%
          </span>
        </div>
      )}
    </div>
  );
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
          <Section icon={Package} title="Gói hiện hành">
            {!b.subscription || !plan ? (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Doanh nghiệp chưa có gói dịch vụ còn hiệu lực. Bạn vẫn xem và xử lý được dữ liệu hiện có nhưng không thể tạo hợp đồng, người dùng hay tải tài liệu mới.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    <Package className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight">
                      {plan.name}
                      <StatusPill tone={SUB_TONE[b.subscription.status]}>{SUBSCRIPTION_STATUS[b.subscription.status].label}</StatusPill>
                    </p>
                    {plan.description && <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>}
                  </div>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <Wallet className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Đơn giá</dt>
                      <dd className="font-semibold tabular-nums">{formatMoney(plan.priceMonthly)} / tháng</dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Hiệu lực</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatDate(b.subscription.startsAt)} – {b.subscription.endsAt ? formatDate(b.subscription.endsAt) : 'không thời hạn'}
                      </dd>
                    </div>
                  </div>
                </dl>
                {b.subscription.status === 'PAST_DUE' && (
                  <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    Thuê bao đang quá hạn thanh toán, vui lòng thanh toán hóa đơn để tránh gián đoạn.
                  </p>
                )}
              </div>
            )}
          </Section>

          <div>
            <h2 className="mb-3 text-base font-semibold tracking-tight">Mức sử dụng</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <UsageMeter
                icon={Users}
                tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                label="Người dùng (không tính tài khoản vô hiệu)"
                used={b.usage.users}
                limit={plan?.maxUsers ?? null}
                display={`${b.usage.users} / ${plan?.maxUsers ?? '—'}`}
              />
              <UsageMeter
                icon={FileText}
                tone="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300"
                label={`Hợp đồng tạo trong năm ${new Date().getFullYear()}`}
                used={b.usage.contractsThisYear}
                limit={plan?.maxContractsYear ?? null}
                display={`${b.usage.contractsThisYear.toLocaleString('vi-VN')} / ${plan?.maxContractsYear.toLocaleString('vi-VN') ?? '—'}`}
              />
              <UsageMeter
                icon={HardDrive}
                tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
                label="Dung lượng lưu trữ"
                used={b.usage.storageBytes}
                limit={plan ? plan.storageQuotaMb * 1024 * 1024 : null}
                display={`${formatStorage(b.usage.storageBytes)} / ${plan ? formatQuotaMb(plan.storageQuotaMb) : '—'}`}
              />
            </div>
          </div>

          <ListCard
            toolbar={
              <span className="flex items-center gap-2 px-1">
                <Receipt className="size-5 text-primary" aria-hidden />
                <span className="font-semibold">Hóa đơn</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{b.invoices.length}</span>
              </span>
            }
          >
            {b.invoices.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Chưa có hóa đơn" />
              </div>
            ) : (
              <>
                <ul className="divide-y md:hidden">
                  {b.invoices.map((inv) => (
                    <MobileCard key={inv.id} title={inv.number} sub={`Hạn thanh toán ${formatDate(inv.dueDate)}`} status={<InvoicePill inv={inv} />}>
                      <span className="block text-sm whitespace-normal">{inv.description}</span>
                      <span className="block font-semibold tabular-nums">{formatMoney(inv.amount)}</span>
                    </MobileCard>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <Th className="pl-4">Số hóa đơn</Th>
                        <Th>Diễn giải</Th>
                        <Th className="text-right">Số tiền</Th>
                        <Th>Hạn thanh toán</Th>
                        <Th>Trạng thái</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {b.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="pl-4">
                            <TitleCell icon={Receipt} title={inv.number} sub={`Kỳ ${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`} />
                          </TableCell>
                          <TableCell className="max-w-96 min-w-56 text-sm whitespace-normal">{inv.description}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatMoney(inv.amount)}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">{formatDate(inv.dueDate)}</TableCell>
                          <TableCell>
                            <InvoicePill inv={inv} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </ListCard>
        </div>
      )}
    </>
  );
}
