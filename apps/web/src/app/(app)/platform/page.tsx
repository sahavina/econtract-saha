'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, CalendarClock, CreditCard, Layers, type LucideIcon, PauseCircle, Receipt, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { StatusPill, type Tone } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatCompact, formatDate, formatMoney } from '@/lib/format';
import { type PlatformOverview, SUBSCRIPTION_STATUS, type SubscriptionStatus, usePlatformGate } from '@/lib/platform';
import { cn } from '@/lib/utils';

const SUB_TONE: Record<SubscriptionStatus, Tone> = { TRIAL: 'sky', ACTIVE: 'green', PAST_DUE: 'amber', CANCELLED: 'gray', EXPIRED: 'gray' };

/** Thẻ số liệu: biểu tượng trong ô màu, số lớn, nhãn nhỏ; có href ⇒ bấm để mở danh sách. */
function Kpi({ icon: Icon, tone, label, value, hint, href }: { icon: LucideIcon; tone: string; label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const cls = 'flex h-full min-w-0 items-center gap-3 rounded-xl border bg-card p-3 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] sm:gap-4 sm:p-4';
  const body = (
    <>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-5 sm:size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className="block text-xl leading-tight font-bold tabular-nums sm:text-2xl">{value}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={cn(cls, 'transition-all hover:-translate-y-0.5 hover:shadow-md')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Thẻ có tiêu đề kèm biểu tượng (cùng kiểu thẻ trong form hợp đồng). */
function Section({ icon: Icon, title, action, children }: { icon: LucideIcon; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2.5 sm:px-5">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function PlatformOverviewPage() {
  const { allowed, denied } = usePlatformGate();
  const q = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api<PlatformOverview>('/platform/overview'), enabled: allowed });
  if (!allowed) return denied;
  const o = q.data;
  const totalMrr = o ? o.byPlan.reduce((s, p) => s + Number(p.mrr), 0) : 0;

  return (
    <>
      <PageHeader title="Tổng quan nền tảng" description="Doanh nghiệp, thuê bao và doanh thu toàn hệ thống." crumbs={[{ label: 'Super Admin' }, { label: 'Tổng quan' }]} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !o ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <Kpi icon={Building2} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" label="Doanh nghiệp" value={o.tenants.total} hint={`+${o.tenants.newThisMonth} trong tháng`} href="/platform/tenants" />
            <Kpi
              icon={PauseCircle}
              tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              label="Tạm ngưng / đóng"
              value={(o.tenants.byStatus.SUSPENDED ?? 0) + (o.tenants.byStatus.CLOSED ?? 0)}
              href="/platform/tenants"
            />
            <Kpi icon={CreditCard} tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" label="Thuê bao trả phí" value={o.subscriptions.active} hint={`${o.subscriptions.trial} đang dùng thử`} />
            <Kpi icon={TrendingUp} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" label="Doanh thu định kỳ / tháng" value={formatCompact(Number(o.subscriptions.mrr))} hint="MRR theo đơn giá gói" />
            <Kpi
              icon={Receipt}
              tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
              label="Chờ thanh toán"
              value={formatCompact(Number(o.invoices.unpaidAmount))}
              hint={`${o.invoices.unpaidCount} hóa đơn`}
              href="/platform/invoices?status=ISSUED"
            />
            <Kpi
              icon={AlertTriangle}
              tone="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"
              label="Hóa đơn quá hạn"
              value={<span className={o.invoices.overdueCount ? 'text-destructive' : ''}>{o.invoices.overdueCount}</span>}
              hint={formatMoney(o.invoices.overdueAmount)}
              href="/platform/invoices?status=OVERDUE"
            />
          </div>
          {o.tenants.withoutSubscription > 0 && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {o.tenants.withoutSubscription} doanh nghiệp đang hoạt động nhưng không có gói hiệu lực — họ không thể tạo hợp đồng, người dùng hay tải tài liệu mới.
              </span>
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section icon={Layers} title="Theo gói dịch vụ">
              {o.byPlan.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Chưa có thuê bao" />
                </div>
              ) : (
                <ul className="divide-y">
                  {o.byPlan.map((p) => {
                    const pct = totalMrr > 0 ? (Number(p.mrr) / totalMrr) * 100 : 0;
                    return (
                      <li key={p.planId} className="space-y-1.5 px-4 py-3 sm:px-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-sm tabular-nums">
                            <span className="text-muted-foreground">{p.tenants} doanh nghiệp · </span>
                            <span className="font-medium">{formatMoney(p.mrr)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="border-t bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground sm:px-5">
                Đã thu trong tháng: <span className="font-medium text-foreground">{formatMoney(o.invoices.paidThisMonth)}</span>
              </p>
            </Section>
            <Section icon={CalendarClock} title="Thuê bao hết hạn trong 30 ngày">
              {o.expiring.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="Không có thuê bao sắp hết hạn" />
                </div>
              ) : (
                <ul className="divide-y">
                  {o.expiring.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/platform/tenants/${s.tenant.id}`} className="line-clamp-1 font-semibold hover:text-primary">
                          {s.tenant.name}
                        </Link>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {s.plan.name}
                          <StatusPill tone={SUB_TONE[s.status]}>{SUBSCRIPTION_STATUS[s.status].label}</StatusPill>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">Hết hạn</p>
                        <p className="text-sm font-medium whitespace-nowrap tabular-nums">{formatDate(s.endsAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
