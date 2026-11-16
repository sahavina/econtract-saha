'use client';

import { CONTRACT_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  Download,
  FileText,
  Handshake,
  Layers,
  type LucideIcon,
  PenLine,
  PieChart as PieChartIcon,
  SlidersHorizontal,
  Timer,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilterSelect } from '@/components/filter-select';
import { DateRange, MobileCard, PersonCell, Th, TitleCell } from '@/components/list-ui';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCompact, formatMoney } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ReportSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)'];
const SHADOW = 'shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]';

function duration(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} phút`;
  if (hours < 48) return `${hours.toFixed(1)} giờ`;
  return `${(hours / 24).toFixed(1)} ngày`;
}

/** Xuất bảng ra CSV (UTF-8 BOM để Excel hiển thị tiếng Việt), chống công thức độc hại. */
function exportCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Thẻ số liệu: biểu tượng trong ô màu, số lớn, nhãn nhỏ (giống bảng điều khiển). */
function Kpi({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 sm:gap-4 sm:p-4', SHADOW)}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-5 sm:size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className="block truncate text-xl leading-tight font-bold tabular-nums sm:text-2xl">{value}</span>
      </span>
    </div>
  );
}

/** Khung có tiêu đề kèm biểu tượng, đường kẻ dưới tiêu đề. */
function Section({
  icon: Icon,
  title,
  action,
  bodyClassName,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border bg-card', SHADOW, className)}>
      <header className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5 sm:px-5">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </header>
      <div className={bodyClassName ?? 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

/** Ô số liệu nhỏ trong khung Thanh toán. */
function MiniStat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-semibold break-words tabular-nums', className)}>{value}</p>
    </div>
  );
}

function GroupTable({
  icon,
  title,
  rows,
  file,
  extra,
  person,
}: {
  icon: LucideIcon;
  title: string;
  rows: { name: string; count: number; value: string; cells?: (string | number)[] }[];
  file: string;
  extra?: string[];
  /** Nhóm là người (hiện ảnh chữ viết tắt). */
  person?: boolean;
}) {
  const nameCell = (n: string) => (person ? <PersonCell name={n} /> : <TitleCell icon={icon} title={n} />);
  return (
    <Section
      icon={icon}
      title={title}
      bodyClassName=""
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={() => exportCsv(file, ['Nhóm', 'Số hợp đồng', 'Tổng giá trị', ...(extra ?? [])], rows.map((r) => [r.name, r.count, r.value, ...(r.cells ?? [])]))}
        >
          <Download /> CSV
        </Button>
      }
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Không có dữ liệu" />
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <Th className="pl-5">Nhóm</Th>
                  <Th className="text-right">Số HĐ</Th>
                  <Th className={cn('text-right', !extra?.length && 'pr-5')}>Tổng giá trị</Th>
                  {extra?.map((h) => (
                    <Th key={h} className="text-right last:pr-5">
                      {h}
                    </Th>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="py-2.5 pl-5">{nameCell(r.name)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', !extra?.length && 'pr-5')}>{formatMoney(r.value)}</TableCell>
                    {r.cells?.map((c, i) => (
                      <TableCell key={i} className="text-right tabular-nums last:pr-5">
                        {c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y md:hidden">
            {rows.map((r) => (
              <MobileCard key={r.name} title={r.name} status={<span className="text-sm font-semibold tabular-nums">{formatMoney(r.value)}</span>}>
                <span className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Số HĐ</span>
                  <span className="text-right tabular-nums">{r.count}</span>
                  {extra?.map((h, i) => (
                    <Fragment key={h}>
                      <span className="text-muted-foreground">{h}</span>
                      <span className="text-right tabular-nums">{r.cells?.[i]}</span>
                    </Fragment>
                  ))}
                </span>
              </MobileCard>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

const KPI_GRID = 'grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6';

export default function ReportsPage() {
  const { can } = useAuth();
  const lookups = useLookups();
  const [f, setF] = useState<{ from?: string; to?: string; departmentId?: string; contractTypeId?: string }>({});
  const q = useQuery({ queryKey: ['reports', f], queryFn: () => api<ReportSummary>('/reports/summary', { query: { ...f } }), enabled: can('report.view') });
  if (!can('report.view')) return <p className="text-sm text-muted-foreground">Bạn không có quyền xem báo cáo.</p>;
  const r = q.data;
  const collectedPct = r && Number(r.payments.scheduled) > 0 ? (Number(r.payments.collected) / Number(r.payments.scheduled)) * 100 : null;

  return (
    <>
      <PageHeader title="Báo cáo" description="Lọc theo ngày tạo hợp đồng; chỉ tính các hợp đồng bạn được xem, không gồm hợp đồng đã hủy/xóa." crumbs={[{ label: 'Quản trị' }, { label: 'Báo cáo' }]} />
      <div className={cn('mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-3', SHADOW)}>
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground max-md:w-full">
          <SlidersHorizontal className="size-4" /> Bộ lọc
        </span>
        <DateRange
          title="Lọc theo ngày tạo hợp đồng"
          from={f.from ?? ''}
          to={f.to ?? ''}
          onFrom={(v) => setF({ ...f, from: v || undefined })}
          onTo={(v) => setF({ ...f, to: v || undefined })}
        />
        <FilterSelect
          className="w-44 max-sm:min-w-0 max-sm:flex-1"
          allLabel="Tất cả phòng ban"
          value={f.departmentId}
          onChange={(v) => setF({ ...f, departmentId: v })}
          options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
        />
        <FilterSelect
          className="w-44 max-sm:min-w-0 max-sm:flex-1"
          allLabel="Tất cả loại HĐ"
          value={f.contractTypeId}
          onChange={(v) => setF({ ...f, contractTypeId: v })}
          options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
        {Object.values(f).some(Boolean) && (
          <Button variant="ghost" size="sm" onClick={() => setF({})}>
            <X /> Xóa lọc
          </Button>
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !r ? (
        <div className="space-y-4">
          <div className={KPI_GRID}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className={KPI_GRID}>
            <Kpi icon={FileText} label="Số hợp đồng" value={r.totals.count} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" />
            <Kpi icon={Wallet} label="Tổng giá trị" value={formatCompact(Number(r.totals.value))} tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" />
            <Kpi icon={Timer} label="TG phê duyệt TB" value={duration(r.totals.avgApprovalHours)} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
            <Kpi icon={PenLine} label="TG ký TB" value={duration(r.totals.avgSigningHours)} tone="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300" />
            <Kpi
              icon={BadgeCheck}
              label="Tỷ lệ ký thành công"
              value={r.totals.signSuccessRate === null ? '—' : `${r.totals.signSuccessRate}%`}
              tone="bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300"
            />
            <Kpi icon={AlertTriangle} label="Công nợ quá hạn" value={formatCompact(Number(r.payments.overdueAmount))} tone="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section icon={BarChart3} title="Giá trị hợp đồng theo phòng ban" className="lg:col-span-2" bodyClassName="h-80 p-3 sm:p-5">
              {r.byDepartment.length === 0 ? (
                <EmptyState title="Không có dữ liệu" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.byDepartment.map((d) => ({ name: d.name, value: Number(d.value), signed: Number(d.signedValue) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis tickFormatter={(v: number) => formatCompact(v)} fontSize={12} width={48} />
                    <Tooltip formatter={(v, n) => [formatMoney(Number(v)), n === 'value' ? 'Tổng giá trị' : 'Đã ký']} />
                    <Legend formatter={(v) => (v === 'value' ? 'Tổng giá trị' : 'Đã ký')} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="signed" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
            <Section icon={PieChartIcon} title="Theo trạng thái" bodyClassName="h-80 p-3 sm:p-5">
              {r.byStatus.length === 0 ? (
                <EmptyState title="Không có dữ liệu" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={r.byStatus.map((s) => ({ name: CONTRACT_STATUS_LABELS[s.status], value: s.count }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {r.byStatus.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>
          </div>

          <Section icon={Banknote} title="Thanh toán">
            <div className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Theo lịch" value={formatMoney(r.payments.scheduled)} />
              <MiniStat label="Đã thu" value={formatMoney(r.payments.collected)} className="text-green-700 dark:text-green-400" />
              <MiniStat label="Còn phải thu" value={formatMoney(Number(r.payments.scheduled) - Number(r.payments.collected))} />
              <MiniStat
                label="Quá hạn"
                value={`${r.payments.overdueCount} đợt · ${formatMoney(r.payments.overdueAmount)}`}
                className={r.payments.overdueCount ? 'text-destructive' : ''}
              />
            </div>
            {collectedPct !== null && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>Đã thu so với theo lịch</span>
                  <span className="font-medium text-foreground tabular-nums">{Math.round(collectedPct)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, collectedPct)}%` }} />
                </div>
              </div>
            )}
          </Section>

          <GroupTable
            icon={Building2}
            title="Hiệu suất theo phòng ban"
            file="bao-cao-phong-ban.csv"
            extra={['HĐ đã ký', 'Giá trị đã ký', 'TG phê duyệt TB', 'TG ký TB']}
            rows={r.byDepartment.map((d) => ({ ...d, cells: [d.signedCount, formatMoney(d.signedValue), duration(d.avgApprovalHours), duration(d.avgSigningHours)] }))}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <GroupTable icon={Layers} title="Theo loại hợp đồng" file="bao-cao-loai-hop-dong.csv" rows={r.byType} />
            <GroupTable icon={Users} person title="Top nhân viên phụ trách (theo giá trị)" file="bao-cao-nhan-vien.csv" rows={r.byOwner} />
          </div>
          <GroupTable icon={Handshake} title="Top đối tác (Bên B)" file="bao-cao-doi-tac.csv" rows={r.byPartner} />
        </div>
      )}
    </>
  );
}
