'use client';

import { formatQtyVi, INSPECTION_STATUS_LABELS, type InspectionItemResult } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, CheckCircle2, ClipboardCheck, Loader2, Play, Printer, RotateCcw, Save, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { DetailHeader } from '@/components/detail-header';
import { StatusPill } from '@/components/list-ui';
import { ErrorState } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCompanyProfile } from '@/lib/company';
import { formatDate, formatDateTime } from '@/lib/format';
import { INSPECTION_TONE, type InspectionDetail, inspectionSlipPdf, isOverdue, targetOf } from '@/lib/inspection';
import { cn } from '@/lib/utils';

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['inspection', id], queryFn: () => api<InspectionDetail>(`/inspections/${id}`) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  // key: nạp lại ô nhập khi dữ liệu đã lưu thay đổi (không đồng bộ state trong effect).
  return <InspectionView key={`${q.data.status}|${q.data.result ?? ''}|${JSON.stringify(q.data.itemResults)}`} r={q.data} />;
}

function InspectionView({ r }: { r: InspectionDetail }) {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const company = useCompanyProfile();
  const manager = can('inspection.manage');
  const isAssignee = user?.id === r.assigneeId;
  const isRequester = user?.id === r.requestedById;
  const open = r.status === 'PENDING' || r.status === 'IN_PROGRESS';
  const canProcess = open && (isAssignee || manager);
  const c = r.contract;
  const target = targetOf(r);
  const items = c?.items ?? [];

  const [result, setResult] = useState(r.result ?? '');
  const [checks, setChecks] = useState<Record<string, InspectionItemResult>>(() => Object.fromEntries(r.itemResults.map((x) => [x.itemId, x])));
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [printing, setPrinting] = useState(false);
  const dirty = result !== (r.result ?? '') || JSON.stringify(Object.values(checks)) !== JSON.stringify(r.itemResults);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inspection', r.id] });
    qc.invalidateQueries({ queryKey: ['inspections'] });
  };
  const err = (e: unknown) => toast.error(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message).join('; ') : e instanceof Error ? e.message : 'Thao tác thất bại');
  const action = useMutation({
    meta: { silent: true },
    mutationFn: (path: 'start' | 'reopen' | 'cancel') => api(`/inspections/${r.id}/${path}`, { method: 'POST' }),
    onSuccess: (_d, path) => {
      toast.success(path === 'start' ? 'Đã nhận xử lý' : path === 'reopen' ? 'Đã mở lại yêu cầu' : 'Đã hủy yêu cầu');
      refresh();
    },
    onError: err,
  });
  const save = useMutation({
    meta: { silent: true },
    mutationFn: (finish?: 'DONE' | 'ISSUE') =>
      api(`/inspections/${r.id}/result`, { method: 'POST', body: { result, itemResults: Object.values(checks), ...(finish && { finish }) } }),
    onSuccess: (_d, finish) => {
      toast.success(finish === 'DONE' ? 'Đã hoàn tất – Đạt' : finish === 'ISSUE' ? 'Đã báo có vấn đề' : 'Đã lưu kết quả');
      refresh();
    },
    onError: err,
  });

  const setCheck = (itemId: string, patch: Partial<InspectionItemResult>) =>
    setChecks((x) => ({ ...x, [itemId]: { itemId, ok: x[itemId]?.ok ?? null, note: x[itemId]?.note ?? null, ...patch } }));
  const failed = Object.values(checks).filter((x) => x.ok === false).length;
  const checked = items.filter((i) => checks[i.id]?.ok != null).length;

  const print = async () => {
    setPrinting(true);
    try {
      const pdf = await inspectionSlipPdf(r, company.data, `${window.location.origin}/inspections/${r.id}`);
      const url = URL.createObjectURL(await pdf.getBlob());
      // Mở tab mới để in; trình duyệt chặn cửa sổ bật lên thì tải tệp về.
      if (!window.open(url, '_blank')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Phieu kiem tra ${r.code}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      // Ghi nhận đã in (nhãn "Đã in" trên hàng chờ); lỗi ghi nhận không chặn việc in.
      await api(`/inspections/${r.id}/printed`, { method: 'POST' }).then(refresh).catch(() => undefined);
    } catch (e) {
      err(e);
    } finally {
      setPrinting(false);
    }
  };

  const busy = action.isPending || save.isPending;
  return (
    <>
      <DetailHeader
        crumbs={[{ label: 'Yêu cầu kiểm tra', href: '/inspections' }, { label: r.code }]}
        icon={ClipboardCheck}
        title={`Kiểm tra ${target.code}`}
        status={
          <span className="flex flex-wrap gap-1.5">
            <StatusPill tone={INSPECTION_TONE[r.status]}>{INSPECTION_STATUS_LABELS[r.status]}</StatusPill>
            {isOverdue(r) && <StatusPill tone="red">Quá hạn</StatusPill>}
            {r.printedAt ? <StatusPill tone="teal">Đã in{r.printCount > 1 ? ` ${r.printCount} lần` : ''}</StatusPill> : <StatusPill tone="gray">Chưa in phiếu</StatusPill>}
          </span>
        }
        meta={`${r.code} · ${target.title}`}
        actions={
          <>
            {r.status === 'PENDING' && (isAssignee || manager) && (
              <Button disabled={busy} onClick={() => action.mutate('start')}>
                <Play /> Nhận xử lý
              </Button>
            )}
            <Button variant="outline" disabled={printing} onClick={print}>
              {printing ? <Loader2 className="animate-spin" /> : <Printer />} In phiếu
            </Button>
            {!open && (isAssignee || isRequester || manager) && (
              <Button variant="outline" disabled={busy} onClick={() => action.mutate('reopen')}>
                <RotateCcw /> Mở lại
              </Button>
            )}
            {open && (isRequester || manager) && (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => setConfirm({ title: `Hủy yêu cầu ${r.code}?`, description: 'Người phụ trách sẽ không còn thấy yêu cầu này trên hàng chờ.', destructive: true, confirmLabel: 'Hủy yêu cầu', onConfirm: () => action.mutateAsync('cancel').then(() => undefined) })}
              >
                <Ban /> Hủy
              </Button>
            )}
          </>
        }
        facts={[
          { label: 'Người phụ trách', value: r.assignee.fullName },
          { label: 'Người yêu cầu', value: r.requestedBy.fullName },
          { label: 'Hạn xử lý', value: r.dueDate ? formatDate(r.dueDate) : '—' },
          { label: c ? 'Khách hàng / đối tác' : 'Kính gửi', value: target.party || '—' },
        ]}
      >
        <p className="text-xs text-muted-foreground">
          Gửi lúc {formatDateTime(r.createdAt)}
          {r.startedAt && ` · Nhận xử lý ${formatDateTime(r.startedAt)}`}
          {r.completedAt && ` · Kết thúc ${formatDateTime(r.completedAt)}`}
          {r.printedAt && ` · In phiếu lần cuối ${formatDateTime(r.printedAt)}${r.printedBy ? ` bởi ${r.printedBy.fullName}` : ''}`} ·{' '}
          <Link href={target.href} className="text-primary hover:underline">
            Mở {target.kind.toLowerCase()} {target.code}
          </Link>
          {c && r.paymentRequest && (
            <>
              {' · '}
              <Link href={`/payment-requests/${r.paymentRequest.id}`} className="text-primary hover:underline">
                Đề nghị thanh toán {r.paymentRequest.number}
              </Link>
            </>
          )}
        </p>
      </DetailHeader>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nội dung cần kiểm tra</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{r.content}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hàng hóa</CardTitle>
              <CardDescription>
                {items.length ? `Đã kiểm ${checked}/${items.length} dòng${failed ? ` · ${failed} dòng không đạt` : ''}.` : 'Hồ sơ không có dòng hàng – kiểm tra theo nội dung yêu cầu.'}
              </CardDescription>
            </CardHeader>
            {items.length > 0 && (
              <CardContent className="space-y-2 px-3 sm:px-6">
                {items.map((i, k) => {
                  const res = checks[i.id];
                  return (
                    <div key={i.id} className={cn('rounded-lg border p-3', res?.ok === false && 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30', res?.ok === true && 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20')}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium break-words">
                            <span className="text-muted-foreground">{k + 1}. </span>
                            {i.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[i.code, `SL ${formatQtyVi(i.quantity)}${i.unit ? ` ${i.unit}` : ''}`].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="flex gap-1.5" role="group" aria-label={`Kết quả dòng ${k + 1}`}>
                          <Button type="button" size="sm" variant={res?.ok === true ? 'default' : 'outline'} disabled={!canProcess} className={cn(res?.ok === true && 'bg-emerald-600 hover:bg-emerald-600/90')} aria-pressed={res?.ok === true} onClick={() => setCheck(i.id, { ok: res?.ok === true ? null : true })}>
                            <Check /> Đạt
                          </Button>
                          <Button type="button" size="sm" variant={res?.ok === false ? 'destructive' : 'outline'} disabled={!canProcess} aria-pressed={res?.ok === false} onClick={() => setCheck(i.id, { ok: res?.ok === false ? null : false })}>
                            <X /> Không đạt
                          </Button>
                        </div>
                      </div>
                      {(canProcess || res?.note) && (
                        <Input
                          className="mt-2 h-8 text-sm"
                          placeholder="Ghi chú dòng hàng (nếu có)"
                          value={res?.note ?? ''}
                          disabled={!canProcess}
                          onChange={(e) => setCheck(i.id, { note: e.target.value })}
                          aria-label={`Ghi chú dòng ${k + 1}`}
                        />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        </div>

        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle className="text-base">Kết quả kiểm tra</CardTitle>
            <CardDescription>{canProcess ? 'Ghi nhận xét rồi chọn Hoàn tất – Đạt hoặc Có vấn đề. Lưu tạm để làm tiếp sau.' : open ? 'Chỉ người phụ trách hoặc quản lý mới ghi kết quả.' : 'Yêu cầu đã kết thúc.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={6} value={result} disabled={!canProcess} onChange={(e) => setResult(e.target.value)} placeholder="Nhận xét, vấn đề phát hiện, đề xuất xử lý…" aria-label="Kết quả kiểm tra" />
            {canProcess && (
              <div className="grid gap-2">
                <Button disabled={busy || failed > 0} onClick={() => save.mutate('DONE')} className="bg-emerald-600 hover:bg-emerald-600/90" title={failed ? 'Còn dòng không đạt' : undefined}>
                  {save.isPending && save.variables === 'DONE' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Hoàn tất – Đạt
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => save.mutate('ISSUE')}>
                  {save.isPending && save.variables === 'ISSUE' ? <Loader2 className="animate-spin" /> : <TriangleAlert />} Có vấn đề
                </Button>
                <Button variant="outline" disabled={busy || !dirty} onClick={() => save.mutate(undefined)}>
                  {save.isPending && !save.variables ? <Loader2 className="animate-spin" /> : <Save />} Lưu tạm
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
