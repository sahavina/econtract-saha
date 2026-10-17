'use client';

import { CONTRACT_STATUS_LABELS } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCompact, formatMoney } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ReportSummary } from '@/lib/types';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)'];

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

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function GroupTable({
  title,
  rows,
  file,
  extra,
}: {
  title: string;
  rows: { name: string; count: number; value: string; cells?: (string | number)[] }[];
  file: string;
  extra?: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={() => exportCsv(file, ['Nhóm', 'Số hợp đồng', 'Tổng giá trị', ...(extra ?? [])], rows.map((r) => [r.name, r.count, r.value, ...(r.cells ?? [])]))}
        >
          <Download /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="Không có dữ liệu" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhóm</TableHead>
                <TableHead className="text-right">Số HĐ</TableHead>
                <TableHead className="text-right">Tổng giá trị</TableHead>
                {extra?.map((h) => (
                  <TableHead key={h} className="text-right">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.value)}</TableCell>
                  {r.cells?.map((c, i) => (
                    <TableCell key={i} className="text-right tabular-nums">
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { can } = useAuth();
  const lookups = useLookups();
  const [f, setF] = useState<{ from?: string; to?: string; departmentId?: string; contractTypeId?: string }>({});
  const q = useQuery({ queryKey: ['reports', f], queryFn: () => api<ReportSummary>('/reports/summary', { query: { ...f } }), enabled: can('report.view') });
  if (!can('report.view')) return <p className="text-sm text-muted-foreground">Bạn không có quyền xem báo cáo.</p>;
  const r = q.data;

  return (
    <>
      <PageHeader title="Báo cáo" description="Lọc theo ngày tạo hợp đồng; chỉ tính các hợp đồng bạn được xem, không gồm hợp đồng đã hủy/xóa." crumbs={[{ label: 'Quản trị' }, { label: 'Báo cáo' }]} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" aria-label="Từ ngày" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
        <span className="text-sm text-muted-foreground">–</span>
        <Input type="date" className="w-40" aria-label="Đến ngày" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
        <FilterSelect allLabel="Tất cả phòng ban" value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect allLabel="Tất cả loại HĐ" value={f.contractTypeId} onChange={(v) => setF({ ...f, contractTypeId: v })} options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        {Object.values(f).some(Boolean) && (
          <Button variant="ghost" size="sm" onClick={() => setF({})}>
            Xóa lọc
          </Button>
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !r ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Số hợp đồng" value={r.totals.count} />
            <Kpi label="Tổng giá trị" value={formatCompact(Number(r.totals.value))} />
            <Kpi label="TG phê duyệt TB" value={duration(r.totals.avgApprovalHours)} />
            <Kpi label="TG ký TB" value={duration(r.totals.avgSigningHours)} />
            <Kpi label="Tỷ lệ ký thành công" value={r.totals.signSuccessRate === null ? '—' : `${r.totals.signSuccessRate}%`} />
            <Kpi label="Công nợ quá hạn" value={formatCompact(Number(r.payments.overdueAmount))} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Giá trị hợp đồng theo phòng ban</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Theo trạng thái</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {r.byStatus.length === 0 ? (
                  <EmptyState title="Không có dữ liệu" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={r.byStatus.map((s) => ({ name: CONTRACT_STATUS_LABELS[s.status], value: s.count }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {r.byStatus.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thanh toán</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
              <p>
                Theo lịch: <span className="font-semibold">{formatMoney(r.payments.scheduled)}</span>
              </p>
              <p>
                Đã thu: <span className="font-semibold">{formatMoney(r.payments.collected)}</span>
              </p>
              <p>
                Còn phải thu: <span className="font-semibold">{formatMoney(Number(r.payments.scheduled) - Number(r.payments.collected))}</span>
              </p>
              <p className={r.payments.overdueCount ? 'text-destructive' : ''}>
                Quá hạn: <span className="font-semibold">{r.payments.overdueCount} đợt · {formatMoney(r.payments.overdueAmount)}</span>
              </p>
            </CardContent>
          </Card>

          <GroupTable
            title="Hiệu suất theo phòng ban"
            file="bao-cao-phong-ban.csv"
            extra={['HĐ đã ký', 'Giá trị đã ký', 'TG phê duyệt TB', 'TG ký TB']}
            rows={r.byDepartment.map((d) => ({ ...d, cells: [d.signedCount, formatMoney(d.signedValue), duration(d.avgApprovalHours), duration(d.avgSigningHours)] }))}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <GroupTable title="Theo loại hợp đồng" file="bao-cao-loai-hop-dong.csv" rows={r.byType} />
            <GroupTable title="Top nhân viên phụ trách (theo giá trị)" file="bao-cao-nhan-vien.csv" rows={r.byOwner} />
          </div>
          <GroupTable title="Top đối tác (Bên B)" file="bao-cao-doi-tac.csv" rows={r.byPartner} />
        </div>
      )}
    </>
  );
}
