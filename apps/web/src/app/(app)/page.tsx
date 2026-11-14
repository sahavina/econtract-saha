'use client';

import { type ContractStatus } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  AlertCircle,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Database,
  Download,
  FileCheck2,
  FilePen,
  FilePlus2,
  FileText,
  Info,
  ListChecks,
  type LucideIcon,
  PenLine,
  PieChart as PieIcon,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilterSelect } from '@/components/filter-select';
import { ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, formatDate, formatDateTime } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { DashboardSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Filters {
  from?: string;
  to?: string;
  departmentId?: string;
  ownerId?: string;
  contractTypeId?: string;
}

const DAY = 86_400_000;

/** Khoảng thời gian (theo ngày tạo hợp đồng) cho bộ lọc đầu trang. */
const PERIODS = [
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: 'this_quarter', label: 'Quý này' },
  { value: 'this_year', label: 'Năm nay' },
] as const;
type Period = (typeof PERIODS)[number]['value'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === 'this_month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (p === 'last_month') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (p === 'this_quarter') {
    const q = Math.floor(m / 3) * 3;
    return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) };
  }
  return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
}

/** Tiền dạng ngắn kiểu Việt Nam: 18,6 tỷ đ · 180 triệu đ. */
function shortMoney(v: number) {
  const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1e9) return `${fmt(v / 1e9)} tỷ đ`;
  if (Math.abs(v) >= 1e6) return `${fmt(v / 1e6)} triệu đ`;
  if (Math.abs(v) >= 1e3) return `${fmt(v / 1e3)} nghìn đ`;
  return `${fmt(v)} đ`;
}

/** Nhóm trạng thái cho biểu đồ tròn (gom các trạng thái chi tiết như trong mẫu). */
const STATUS_GROUPS: { key: string; label: string; color: string; statuses: ContractStatus[] }[] = [
  { key: 'active', label: 'Đang hiệu lực', color: '#22a35a', statuses: ['ACTIVE', 'SIGNED'] },
  { key: 'pending', label: 'Chờ duyệt & ký', color: '#f5a623', statuses: ['PENDING_APPROVAL', 'APPROVED', 'PENDING_SIGNATURE'] },
  { key: 'draft', label: 'Bản nháp', color: '#a3a9b6', statuses: ['DRAFT'] },
  { key: 'expired', label: 'Hết hạn', color: '#e5484d', statuses: ['EXPIRED'] },
  { key: 'other', label: 'Thanh lý, hủy, lưu trữ', color: '#6366f1', statuses: ['LIQUIDATED', 'CANCELLED', 'ARCHIVED'] },
];

function relTime(at: string, now: number) {
  const diff = now - new Date(at).getTime();
  if (!now || diff < 0) return formatDateTime(at);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} ngày trước` : formatDateTime(at);
}

function activityIcon(action: string): { icon: LucideIcon; tone: string } {
  if (/approve|self_approve/.test(action)) return { icon: CheckCircle2, tone: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300' };
  if (/sign/.test(action)) return { icon: PenLine, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300' };
  if (/reject|delete|cancel/.test(action)) return { icon: CircleAlert, tone: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' };
  if (/create|duplicate/.test(action)) return { icon: FilePlus2, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300' };
  return { icon: FileText, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
}

function Kpi({ icon: Icon, label, value, sub, tone, href }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode; tone: string; href?: string }) {
  const body = (
    <div className={cn('flex h-full flex-col items-start gap-2.5 rounded-xl border bg-card p-3.5 sm:flex-row sm:gap-4 sm:p-5 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] transition-all', href && 'hover:-translate-y-0.5 hover:shadow-md')}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        <p className="mt-0.5 text-xl leading-tight font-bold sm:text-[1.7rem] tracking-tight break-words tabular-nums">{value}</p>
        {sub && <div className="mt-1 text-xs sm:text-sm">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Panel({ icon: Icon, title, action, children, className }: { icon: LucideIcon; title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-4 sm:px-5">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <Icon className="size-5 text-primary" />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="px-4 pb-5 sm:px-5">{children}</CardContent>
    </Card>
  );
}

const SeeAll = ({ href }: { href: string }) => (
  <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
    Xem tất cả <ArrowRight className="size-4" />
  </Link>
);

export default function DashboardPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState<Filters>({});
  const [period, setPeriod] = useState<Period | undefined>();
  const [months, setMonths] = useState<'6' | '12'>('6');
  const lookups = useLookups();
  const summary = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => api<DashboardSummary>('/dashboard/summary', { query: { ...filters } }),
  });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const d = summary.data;
  const k = d?.kpis;
  const now = useNow();

  const series = (d?.monthly ?? []).slice(months === '6' ? -6 : -12).map((m) => ({ ...m, label: `Th${Number(m.month.slice(5))}`, billions: m.value / 1e9 }));
  const groups = STATUS_GROUPS.map((g) => ({ ...g, count: (d?.byStatus ?? []).filter((s) => g.statuses.includes(s.status)).reduce((a, s) => a + s.count, 0) })).filter((g) => g.count > 0);
  const groupTotal = groups.reduce((a, g) => a + g.count, 0);
  const due = Number(d?.payments.dueThisMonth ?? 0);
  const paid = Number(d?.payments.paidThisMonth ?? 0);
  const paidPct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : null;
  const daysLeft = (date: string) => (now ? Math.max(0, Math.ceil((new Date(date).getTime() - now) / DAY)) : null);
  const tasks = k
    ? [
        { icon: CheckCircle2, label: 'Phê duyệt hợp đồng', count: k.myApprovals, href: '/tasks', tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300' },
        { icon: PenLine, label: 'Hợp đồng chờ ký', count: k.pendingSignature, href: '/contracts?view=pending_signature', tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300' },
        { icon: Wallet, label: 'Thanh toán quá hạn', count: d?.payments.overdueCount ?? 0, href: '/lifecycle', tone: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' },
        { icon: AlarmClock, label: 'Quá hạn xử lý', count: k.overdue, href: '/contracts?view=pending_approval', tone: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300' },
        { icon: FilePen, label: 'Hợp đồng nháp', count: k.draft, href: '/contracts?view=draft', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Tổng quan hợp đồng"
        description="Theo dõi hoạt động và các chỉ số hợp đồng doanh nghiệp"
        crumbs={[{ label: 'Không gian làm việc', href: '/' }, { label: 'Tổng quan' }]}
        actions={
          <>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <FilterSelect
                allLabel="Toàn thời gian"
                className="h-9 w-44 pl-9"
                value={period}
                onChange={(v) => {
                  setPeriod(v as Period | undefined);
                  set(v ? periodRange(v as Period) : { from: undefined, to: undefined });
                }}
                options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                ariaLabel="Khoảng thời gian tạo hợp đồng"
              />
            </div>
            {can('report.view') && (
              <Button variant="outline" asChild className="h-9">
                <Link href="/reports">
                  <Download /> Báo cáo
                </Link>
              </Button>
            )}
            {can('contract.create') && (
              <Button asChild className="h-9">
                <Link href="/contracts/new">
                  <FilePlus2 /> Tạo hợp đồng
                </Link>
              </Button>
            )}
          </>
        }
      />

      {can('contract.view_all') && (
        <div className="-mt-2 mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <FilterSelect allLabel="Tất cả phòng ban" className="h-8 w-44" value={filters.departmentId} onChange={(v) => set({ departmentId: v })} options={(lookups.data?.departments ?? []).map((x) => ({ value: x.id, label: x.name }))} ariaLabel="Phòng ban" />
          <FilterSelect allLabel="Tất cả loại HĐ" className="h-8 w-44" value={filters.contractTypeId} onChange={(v) => set({ contractTypeId: v })} options={(lookups.data?.contractTypes ?? []).map((x) => ({ value: x.id, label: x.name }))} ariaLabel="Loại hợp đồng" />
          <FilterSelect allLabel="Tất cả nhân viên" className="h-8 w-44" value={filters.ownerId} onChange={(v) => set({ ownerId: v })} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} ariaLabel="Nhân viên" />
        </div>
      )}

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {!k ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
            ) : (
              <>
                <Kpi
                  icon={FileText}
                  label="Tổng hợp đồng"
                  value={k.total}
                  href="/contracts"
                  tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                  sub={
                    k.newThisMonth > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-green-600">
                        <ArrowUp className="size-4" /> +{k.newThisMonth} trong tháng
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Chưa có hợp đồng mới trong tháng</span>
                    )
                  }
                />
                <Kpi icon={FileCheck2} label="Đang hiệu lực" value={k.active} href="/contracts?view=active" tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" sub={<span className="text-muted-foreground">{k.expiringSoon} sắp hết hạn</span>} />
                <Kpi icon={Clock} label="Chờ phê duyệt & ký" value={k.pendingApproval + k.pendingSignature} href="/contracts?view=pending_approval" tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" sub={<span className="text-muted-foreground">{k.pendingApproval} chờ duyệt · {k.pendingSignature} chờ ký</span>} />
                <Kpi icon={Database} label="Giá trị đang hiệu lực" value={shortMoney(Number(k.activeValue))} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" sub={<span className="text-muted-foreground">{k.active} hợp đồng</span>} />
              </>
            )}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
            <Panel
              icon={BarChart3}
              title="Giá trị hợp đồng theo tháng"
              action={
                <FilterSelect
                  allLabel="6 tháng gần nhất"
                  className="h-8 w-40"
                  value={months === '6' ? undefined : months}
                  onChange={(v) => setMonths(v === '12' ? '12' : '6')}
                  options={[{ value: '12', label: '12 tháng gần nhất' }]}
                  ariaLabel="Số tháng"
                />
              }
            >
              <p className="mb-1 text-xs text-muted-foreground">Tỷ đồng</p>
              <div className="h-60">
                {!d ? (
                  <Skeleton className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 22, right: 16, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} />
                      <Tooltip
                        formatter={(_, __, item) => [shortMoney((item.payload as { value: number }).value), 'Giá trị']}
                        labelFormatter={(_, payload) => {
                          const m = (payload?.[0]?.payload as { month?: string } | undefined)?.month;
                          return m ? `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)} · ${(payload?.[0]?.payload as { count: number }).count} hợp đồng` : '';
                        }}
                      />
                      <Area type="monotone" dataKey="billions" stroke="var(--primary)" strokeWidth={2.5} fill="url(#valueFill)" dot={{ r: 4, fill: 'var(--primary)', strokeWidth: 0 }} activeDot={{ r: 6 }}>
                        <LabelList dataKey="billions" position="top" offset={10} fontSize={11} fontWeight={600} formatter={(v: unknown) => (Number(v) ? Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '')} />
                      </Area>
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel icon={PieIcon} title="Trạng thái hợp đồng">
              {!d ? (
                <Skeleton className="h-60" />
              ) : groupTotal === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
              ) : (
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  <div className="relative size-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={groups} dataKey="count" nameKey="label" innerRadius={62} outerRadius={90} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                          {groups.map((g) => (
                            <Cell key={g.key} fill={g.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold tabular-nums">{groupTotal}</span>
                      <span className="text-xs text-muted-foreground">hợp đồng</span>
                    </div>
                  </div>
                  <ul className="w-full flex-1 divide-y text-sm">
                    {groups.map((g) => (
                      <li key={g.key} className="flex items-center gap-2.5 py-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                        <span className="flex-1">{g.label}</span>
                        <span className="font-semibold tabular-nums">{g.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
            <Panel
              icon={AlertCircle}
              title={
                <span className="flex items-center gap-2.5">
                  Hợp đồng cần chú ý
                  {!!k?.expiringSoon && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">{k.expiringSoon} sắp hết hạn</span>}
                </span>
              }
              action={<SeeAll href="/contracts?view=expiring" />}
            >
              {!d ? (
                <Skeleton className="h-40" />
              ) : d.expiringContracts.length === 0 ? (
                <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-green-600" /> Không có hợp đồng sắp hết hạn.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/60 text-left text-[13px] text-foreground/80">
                        <th className="rounded-l-lg px-3 py-2.5 font-semibold">Hợp đồng</th>
                        <th className="px-3 py-2.5 font-semibold">Đối tác</th>
                        <th className="px-3 py-2.5 font-semibold">Hết hạn</th>
                        <th className="px-3 py-2.5 font-semibold">Còn lại</th>
                        <th className="rounded-r-lg px-3 py-2.5 text-right font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {d.expiringContracts.map((c) => {
                        const left = daysLeft(c.expiryDate);
                        return (
                          <tr key={c.id}>
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-2.5">
                                <FileText className="size-4 shrink-0 text-muted-foreground" />
                                <span className="min-w-0">
                                  <span className="line-clamp-1 font-semibold">{c.title}</span>
                                  <span className="block text-xs text-muted-foreground">{c.code}</span>
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-2">
                                <Users className="size-4 shrink-0 text-muted-foreground" />
                                <span className="line-clamp-1">{c.parties[0]?.name ?? '—'}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="flex items-center gap-2">
                                <CalendarDays className="size-4 text-muted-foreground" />
                                {formatDate(c.expiryDate)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {left !== null && (
                                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', left <= 15 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
                                  <Clock className="size-3.5" /> Còn {left} ngày
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <Link href={`/contracts/${c.id}`} className="font-semibold text-primary hover:underline">
                                Xem
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel icon={ListChecks} title="Công việc cần xử lý">
              {!k ? (
                <Skeleton className="h-48" />
              ) : (
                <>
                  <ul className="divide-y rounded-xl border">
                    {tasks.map((t) => (
                      <li key={t.label}>
                        <Link href={t.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', t.tone)}>
                            <t.icon className="size-[18px]" />
                          </span>
                          <span className="flex-1 text-sm font-medium">{t.label}</span>
                          <span className={cn('min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums', t.count > 0 ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' : 'bg-muted text-muted-foreground')}>{t.count}</span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {k.myApprovals > 0 && (
                    <p className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      <Info className="size-4 shrink-0" /> Hoàn tất phê duyệt để đẩy nhanh tiến độ ký kết.
                    </p>
                  )}
                </>
              )}
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Panel icon={Wallet} title="Thanh toán tháng này" action={<SeeAll href="/lifecycle" />}>
              {!d ? (
                <Skeleton className="h-28" />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3 sm:divide-x">
                    {[
                      { icon: Download, label: 'Đến hạn trong tháng', value: due, sub: `${d.payments.installmentsThisMonth} đợt`, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300' },
                      { icon: CheckCircle2, label: 'Đã thanh toán', value: paid, sub: paidPct === null ? '' : `${paidPct}% số đến hạn`, tone: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300' },
                      { icon: CircleAlert, label: 'Quá hạn', value: Number(d.payments.overdue), sub: `${d.payments.overdueCount} đợt chưa thanh toán`, tone: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' },
                    ].map((x) => (
                      <div key={x.label} className="flex items-center gap-3 sm:pl-4 sm:first:pl-0">
                        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', x.tone)}>
                          <x.icon className="size-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-muted-foreground">{x.label}</span>
                          <span className="block text-lg leading-snug font-bold break-words tabular-nums">{shortMoney(x.value)}</span>
                          {x.sub && <span className="block text-xs text-muted-foreground">{x.sub}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${paidPct ?? 0}%` }} />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{paidPct === null ? 'Chưa có đợt thanh toán đến hạn trong tháng' : `${paidPct}% (đã thanh toán / đến hạn)`}</span>
                  </div>
                </>
              )}
            </Panel>

            <Panel icon={Zap} title="Hoạt động gần đây" action={can('audit.view') ? <SeeAll href="/audit-logs" /> : undefined}>
              {!d ? (
                <Skeleton className="h-28" />
              ) : d.recentActivity.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Chưa có hoạt động</p>
              ) : (
                <ul className="divide-y">
                  {d.recentActivity.slice(0, 5).map((a) => {
                    const { icon: Icon, tone } = activityIcon(a.action);
                    const code = (a.data as { code?: string } | null)?.code;
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="line-clamp-1">
                            <span className="font-medium">{a.actorName ?? 'Hệ thống'}</span>{' '}
                            <span className="text-muted-foreground">{(AUDIT_ACTION_LABELS[a.action] ?? a.action).toLowerCase()}</span>
                            {code && a.entityId && (
                              <>
                                {' '}
                                <Link href={`/contracts/${a.entityId}`} className="font-semibold text-primary hover:underline">
                                  {code}
                                </Link>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{relTime(a.createdAt, now)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
