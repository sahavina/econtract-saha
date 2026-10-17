'use client';

import { CONTRACT_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  CheckCircle2,
  Clock,
  FilePen,
  FilePlus2,
  FileSignature,
  FileText,
  Hourglass,
  type LucideIcon,
  PenLine,
  Percent,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, formatCompact, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { DashboardSummary } from '@/lib/types';

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)'];

interface Filters {
  from?: string;
  to?: string;
  departmentId?: string;
  ownerId?: string;
  contractTypeId?: string;
}

function Kpi({ icon: Icon, label, value, href, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; href?: string; tone?: string }) {
  const body = (
    <Card className="h-full gap-2 py-4 transition-colors hover:bg-muted/40">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${tone ?? 'bg-primary/10 text-primary'}`}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [filters, setFilters] = useState<Filters>({});
  const lookups = useLookups();
  const summary = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => api<DashboardSummary>('/dashboard/summary', { query: { ...filters } }),
  });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const k = summary.data?.kpis;

  return (
    <>
      <PageHeader
        title={`Xin chào, ${user?.fullName ?? ''}`}
        description="Tổng quan tình hình hợp đồng của doanh nghiệp"
        actions={
          can('contract.create') && (
            <Button asChild>
              <Link href="/contracts/new">
                <FilePlus2 /> Tạo hợp đồng
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" aria-label="Từ ngày" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <span className="text-sm text-muted-foreground">–</span>
        <Input type="date" className="w-40" aria-label="Đến ngày" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        <FilterSelect allLabel="Tất cả phòng ban" value={filters.departmentId} onChange={(v) => set({ departmentId: v })} options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect allLabel="Tất cả loại HĐ" value={filters.contractTypeId} onChange={(v) => set({ contractTypeId: v })} options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <FilterSelect allLabel="Tất cả nhân viên" value={filters.ownerId} onChange={(v) => set({ ownerId: v })} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} />
        {Object.values(filters).some(Boolean) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            Xóa lọc
          </Button>
        )}
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {!k
              ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-22 rounded-xl" />)
              : (
                <>
                  <Kpi icon={FileText} label="Tổng số hợp đồng" value={k.total} href="/contracts" />
                  <Kpi icon={FilePlus2} label="Mới trong tháng" value={k.newThisMonth} />
                  <Kpi icon={FilePen} label="Đang soạn thảo" value={k.draft} href="/contracts?view=draft" />
                  <Kpi icon={Hourglass} label="Chờ phê duyệt" value={k.pendingApproval} href="/contracts?view=pending_approval" tone="bg-amber-500/15 text-amber-600" />
                  <Kpi icon={PenLine} label="Chờ ký" value={k.pendingSignature} href="/contracts?view=pending_signature" tone="bg-violet-500/15 text-violet-600" />
                  <Kpi icon={FileSignature} label="Ký hoàn tất" value={k.signed} tone="bg-emerald-500/15 text-emerald-600" />
                  <Kpi icon={CheckCircle2} label="Đang hiệu lực" value={k.active} href="/contracts?view=active" tone="bg-emerald-500/15 text-emerald-600" />
                  <Kpi icon={AlarmClock} label="Sắp hết hạn" value={k.expiringSoon} href="/contracts?view=expiring" tone="bg-orange-500/15 text-orange-600" />
                  <Kpi icon={Clock} label="Quá hạn xử lý" value={k.overdue} tone="bg-rose-500/15 text-rose-600" />
                  <Kpi icon={Wallet} label="Tổng giá trị" value={formatCompact(Number(k.totalValue))} />
                  <Kpi icon={Wallet} label="Giá trị tháng này" value={formatCompact(Number(k.valueThisMonth))} />
                  <Kpi icon={Percent} label="Tỷ lệ ký thành công" value={k.signSuccessRate === null ? '—' : `${k.signSuccessRate}%`} />
                </>
              )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Số lượng hợp đồng theo tháng</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {summary.data ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.data.monthly}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5) + '/' + m.slice(2, 4)} fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} width={32} />
                      <Tooltip formatter={(v) => [v, 'Hợp đồng']} labelFormatter={(m) => `Tháng ${String(m).slice(5)}/${String(m).slice(0, 4)}`} />
                      <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Skeleton className="h-full" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Phân bố trạng thái</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {!summary.data ? (
                  <Skeleton className="h-full" />
                ) : summary.data.byStatus.length === 0 ? (
                  <EmptyState title="Chưa có dữ liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={summary.data.byStatus.map((s) => ({ name: CONTRACT_STATUS_LABELS[s.status], value: s.count }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {summary.data.byStatus.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Giá trị hợp đồng theo tháng</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {summary.data ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.data.monthly}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5) + '/' + m.slice(2, 4)} fontSize={12} />
                      <YAxis tickFormatter={(v: number) => formatCompact(v)} fontSize={12} width={48} />
                      <Tooltip formatter={(v) => [formatMoney(Number(v)), 'Giá trị']} />
                      <Line type="monotone" dataKey="value" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Skeleton className="h-full" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hợp đồng sắp hết hạn</CardTitle>
              </CardHeader>
              <CardContent>
                {!summary.data ? (
                  <Skeleton className="h-32" />
                ) : summary.data.expiringContracts.length === 0 ? (
                  <EmptyState title="Không có hợp đồng sắp hết hạn" />
                ) : (
                  <ul className="divide-y">
                    {summary.data.expiringContracts.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                        <Link href={`/contracts/${c.id}`} className="min-w-0 hover:underline">
                          <p className="truncate text-sm font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.code} · {c.owner?.fullName ?? '—'}
                          </p>
                        </Link>
                        <span className="shrink-0 text-xs font-medium text-orange-600">{formatDate(c.expiryDate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hoạt động gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                {!summary.data ? (
                  <Skeleton className="h-32" />
                ) : summary.data.recentActivity.length === 0 ? (
                  <EmptyState title="Chưa có hoạt động" />
                ) : (
                  <ul className="divide-y">
                    {summary.data.recentActivity.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{a.actorName}</span>{' '}
                          <span className="text-muted-foreground">{(AUDIT_ACTION_LABELS[a.action] ?? a.action).toLowerCase()}</span>{' '}
                          {a.entityId && (
                            <Link href={`/contracts/${a.entityId}`} className="font-medium hover:underline">
                              {String((a.data as { code?: string } | null)?.code ?? 'xem')}
                            </Link>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
