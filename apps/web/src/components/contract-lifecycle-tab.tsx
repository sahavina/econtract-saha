'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Check, Loader2, Plus, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { ErrorState } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Appendix, ContractDetail, LifecycleOverview, Obligation, Payment } from '@/lib/types';

const APPENDIX_KIND = { AMENDMENT: 'Sửa đổi, bổ sung', EXTENSION: 'Gia hạn', OTHER: 'Khác' } as const;
const APPENDIX_STATUS = { DRAFT: 'Nháp', EFFECTIVE: 'Có hiệu lực', CANCELLED: 'Đã hủy' } as const;
const OBLIGATION_STATUS = { OPEN: 'Chưa thực hiện', IN_PROGRESS: 'Đang thực hiện', DONE: 'Hoàn thành', CANCELLED: 'Hủy' } as const;
const PAYMENT_STATUS = { PLANNED: 'Chưa thanh toán', PARTIAL: 'Thanh toán một phần', PAID: 'Đã thanh toán', CANCELLED: 'Đã hủy' } as const;
const ACCEPTANCE_RESULT = { PASSED: 'Đạt', CONDITIONAL: 'Đạt có điều kiện', FAILED: 'Không đạt' } as const;
const PARTY = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' } as const;

const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof ApiError ? e.errors.map((x) => x.message).join('; ') || e.message : 'Thao tác thất bại');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Hộp thoại form dùng chung cho các mục vòng đời. */
function FormDialog({
  title,
  open,
  onClose,
  onSubmit,
  pending,
  error,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useAction(contractId: string) {
  const qc = useQueryClient();
  return (onDone?: () => void) => ({
    meta: { silent: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract', contractId] });
      onDone?.();
    },
  });
}

// ───────────────────────── Phụ lục ─────────────────────────

function AppendixSection({ c, data, editable }: { c: ContractDetail; data: Appendix[]; editable: boolean }) {
  const after = useAction(c.id);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [f, setF] = useState({ title: '', kind: 'EXTENSION' as Appendix['kind'], newExpiryDate: '', valueChange: '', effectiveDate: today(), contentHtml: '' });
  const signed = ['SIGNED', 'ACTIVE', 'EXPIRED'].includes(c.status);

  const create = useMutation({
    ...after(() => {
      setOpen(false);
      toast.success('Đã lập phụ lục nháp');
    }),
    mutationFn: () =>
      api(`/contracts/${c.id}/appendices`, {
        method: 'POST',
        body: { ...f, contentHtml: f.contentHtml ? `<p>${f.contentHtml.replace(/[<>&]/g, '')}</p>` : null, valueChange: f.valueChange || null },
      }),
    onError: (e: unknown) => setError(errText(e)),
  });
  const act = useMutation({
    ...after(),
    mutationFn: ({ id, op }: { id: string; op: 'apply' | 'cancel' }) => api(`/contracts/${c.id}/appendices/${id}/${op}`, { method: 'POST' }),
    onError: (e: unknown) => toast.error(errText(e)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Phụ lục & gia hạn</CardTitle>
          <CardDescription>Phụ lục có hiệu lực sẽ cập nhật ngày hết hạn / giá trị hợp đồng. Áp dụng sau khi các bên đã ký phụ lục.</CardDescription>
        </div>
        {editable && signed && (
          <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>
            <Plus /> Lập phụ lục
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{signed ? 'Chưa có phụ lục.' : 'Phụ lục chỉ lập được cho hợp đồng đã ký.'}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số phụ lục</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Hết hạn mới</TableHead>
                <TableHead>Điều chỉnh giá trị</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium whitespace-nowrap">{a.code}</TableCell>
                  <TableCell>{a.title}</TableCell>
                  <TableCell>{APPENDIX_KIND[a.kind]}</TableCell>
                  <TableCell>{formatDate(a.newExpiryDate)}</TableCell>
                  <TableCell className="tabular-nums">{a.valueChange ? formatMoney(a.valueChange, c.currency) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'EFFECTIVE' ? 'default' : 'outline'}>{APPENDIX_STATUS[a.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {editable && a.status === 'DRAFT' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirm({
                              title: `Cho phụ lục ${a.code} có hiệu lực?`,
                              description: 'Ngày hết hạn và giá trị hợp đồng sẽ được cập nhật theo phụ lục. Thao tác không hoàn tác được.',
                              confirmLabel: 'Áp dụng',
                              onConfirm: () => act.mutateAsync({ id: a.id, op: 'apply' }).then(() => void toast.success('Phụ lục đã có hiệu lực')),
                            })
                          }
                        >
                          <Check /> Có hiệu lực
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Hủy phụ lục" onClick={() => act.mutate({ id: a.id, op: 'cancel' })}>
                          <Ban />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <FormDialog title="Lập phụ lục" open={open} onClose={() => setOpen(false)} onSubmit={() => create.mutate()} pending={create.isPending} error={error}>
        <Field label="Tiêu đề *">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Tiêu đề phụ lục" />
        </Field>
        <Field label="Loại phụ lục">
          <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as Appendix['kind'] })}>
            <SelectTrigger className="w-full" aria-label="Loại phụ lục">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(APPENDIX_KIND) as Appendix['kind'][]).map((k) => (
                <SelectItem key={k} value={k}>
                  {APPENDIX_KIND[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f.kind === 'EXTENSION' ? 'Ngày hết hạn mới *' : 'Ngày hết hạn mới'}>
            <Input type="date" value={f.newExpiryDate} onChange={(e) => setF({ ...f, newExpiryDate: e.target.value })} aria-label="Ngày hết hạn mới" />
          </Field>
          <Field label="Điều chỉnh giá trị (+/−)">
            <Input inputMode="decimal" placeholder="vd: 5000000 hoặc -2000000" value={f.valueChange} onChange={(e) => setF({ ...f, valueChange: e.target.value })} aria-label="Điều chỉnh giá trị" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Hết hạn hiện tại: {formatDate(c.expiryDate)} · Giá trị hiện tại: {formatMoney(c.value, c.currency)}</p>
        <Field label="Ngày hiệu lực của phụ lục">
          <Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} aria-label="Ngày hiệu lực phụ lục" />
        </Field>
        <Field label="Nội dung tóm tắt">
          <Textarea rows={3} value={f.contentHtml} onChange={(e) => setF({ ...f, contentHtml: e.target.value })} aria-label="Nội dung phụ lục" />
        </Field>
      </FormDialog>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}

// ───────────────────────── Nghĩa vụ & nghiệm thu ─────────────────────────

function ObligationSection({ c, data, editable }: { c: ContractDetail; data: LifecycleOverview; editable: boolean }) {
  const after = useAction(c.id);
  const lookups = useLookups();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', partyRole: 'PARTY_A', assigneeId: '', dueDate: '', description: '' });
  const [acc, setAcc] = useState<{ title: string; acceptedDate: string; result: 'PASSED' | 'CONDITIONAL' | 'FAILED'; note: string } | null>(null);

  const create = useMutation({
    ...after(() => {
      setOpen(false);
      toast.success('Đã thêm nghĩa vụ');
    }),
    mutationFn: () => api(`/contracts/${c.id}/obligations`, { method: 'POST', body: f }),
    onError: (e: unknown) => setError(errText(e)),
  });
  const update = useMutation({
    ...after(),
    mutationFn: ({ id, body }: { id: string; body: Partial<Obligation> }) => api(`/contracts/${c.id}/obligations/${id}`, { method: 'PATCH', body }),
    onError: (e: unknown) => toast.error(errText(e)),
  });
  const remove = useMutation({ ...after(), mutationFn: (id: string) => api(`/contracts/${c.id}/obligations/${id}`, { method: 'DELETE' }) });
  const createAcc = useMutation({
    ...after(() => {
      setAcc(null);
      toast.success('Đã lập biên bản nghiệm thu');
    }),
    mutationFn: () => api(`/contracts/${c.id}/acceptances`, { method: 'POST', body: acc }),
    onError: (e: unknown) => setError(errText(e)),
  });
  const removeAcc = useMutation({ ...after(), mutationFn: (id: string) => api(`/contracts/${c.id}/acceptances/${id}`, { method: 'DELETE' }) });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Nghĩa vụ & tiến độ thực hiện</CardTitle>
          <CardDescription>
            {data.summary.progress === null ? 'Chưa có nghĩa vụ.' : `Tiến độ chung ${data.summary.progress}% · ${data.summary.openObligations} nghĩa vụ đang mở`}
            {data.summary.overdueObligations > 0 && <span className="text-destructive"> · {data.summary.overdueObligations} quá hạn</span>}
          </CardDescription>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setError(null); setAcc({ title: '', acceptedDate: today(), result: 'PASSED', note: '' }); }}>
              <Check /> Lập biên bản nghiệm thu
            </Button>
            <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>
              <Plus /> Thêm nghĩa vụ
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {data.obligations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nghĩa vụ</TableHead>
                <TableHead>Bên thực hiện</TableHead>
                <TableHead>Phụ trách</TableHead>
                <TableHead>Hạn</TableHead>
                <TableHead>Tiến độ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.obligations.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.title}</TableCell>
                  <TableCell>{o.partyRole ? PARTY[o.partyRole] : '—'}</TableCell>
                  <TableCell>{o.assignee?.fullName ?? '—'}</TableCell>
                  <TableCell className={cn('whitespace-nowrap', o.overdue && 'font-medium text-destructive')}>
                    {formatDate(o.dueDate)} {o.overdue && '(quá hạn)'}
                  </TableCell>
                  <TableCell className="w-40">
                    {editable && o.status !== 'DONE' && o.status !== 'CANCELLED' ? (
                      <Select value={String(o.progress)} onValueChange={(v) => update.mutate({ id: o.id, body: { progress: Number(v) } })}>
                        <SelectTrigger size="sm" className="w-full" aria-label={`Tiến độ ${o.title}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 10, 25, 50, 75, 90, 100].map((p) => (
                            <SelectItem key={p} value={String(p)}>
                              {p}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${o.progress}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{o.progress}%</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={o.status === 'DONE' ? 'default' : 'outline'}>{OBLIGATION_STATUS[o.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {editable && o.status !== 'DONE' && (
                      <Button size="icon-sm" variant="ghost" aria-label="Đánh dấu hoàn thành" onClick={() => update.mutate({ id: o.id, body: { status: 'DONE' } })}>
                        <Check />
                      </Button>
                    )}
                    {editable && (
                      <Button size="icon-sm" variant="ghost" aria-label="Xóa nghĩa vụ" onClick={() => remove.mutate(o.id)}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div>
          <p className="mb-2 text-sm font-medium">Biên bản nghiệm thu</p>
          {data.acceptances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có biên bản nghiệm thu.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.acceptances.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground">{formatDate(a.acceptedDate)}</span>
                  <Badge variant={a.result === 'FAILED' ? 'destructive' : a.result === 'PASSED' ? 'default' : 'secondary'}>{ACCEPTANCE_RESULT[a.result]}</Badge>
                  {a.note && <span className="text-xs text-muted-foreground">{a.note}</span>}
                  {editable && (
                    <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Xóa biên bản" onClick={() => removeAcc.mutate(a.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      <FormDialog title="Thêm nghĩa vụ" open={open} onClose={() => setOpen(false)} onSubmit={() => create.mutate()} pending={create.isPending} error={error}>
        <Field label="Nội dung nghĩa vụ *">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Nội dung nghĩa vụ" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bên thực hiện">
            <Select value={f.partyRole} onValueChange={(v) => setF({ ...f, partyRole: v })}>
              <SelectTrigger className="w-full" aria-label="Bên thực hiện">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PARTY) as (keyof typeof PARTY)[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PARTY[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Hạn hoàn thành">
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-label="Hạn hoàn thành" />
          </Field>
        </div>
        <Field label="Người phụ trách theo dõi">
          <FilterSelect className="w-full" allLabel="— Chưa giao —" value={f.assigneeId || undefined} onChange={(v) => setF({ ...f, assigneeId: v ?? '' })} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} ariaLabel="Người phụ trách" />
        </Field>
        <Field label="Mô tả">
          <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} aria-label="Mô tả nghĩa vụ" />
        </Field>
      </FormDialog>
      <FormDialog title="Lập biên bản nghiệm thu" open={!!acc} onClose={() => setAcc(null)} onSubmit={() => createAcc.mutate()} pending={createAcc.isPending} error={error}>
        {acc && (
          <>
            <Field label="Nội dung nghiệm thu *">
              <Input value={acc.title} onChange={(e) => setAcc({ ...acc, title: e.target.value })} aria-label="Nội dung nghiệm thu" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ngày nghiệm thu">
                <Input type="date" value={acc.acceptedDate} onChange={(e) => setAcc({ ...acc, acceptedDate: e.target.value })} aria-label="Ngày nghiệm thu" />
              </Field>
              <Field label="Kết quả">
                <Select value={acc.result} onValueChange={(v) => setAcc({ ...acc, result: v as typeof acc.result })}>
                  <SelectTrigger className="w-full" aria-label="Kết quả nghiệm thu">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACCEPTANCE_RESULT) as (keyof typeof ACCEPTANCE_RESULT)[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ACCEPTANCE_RESULT[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Ghi chú / tồn tại">
              <Textarea rows={2} value={acc.note} onChange={(e) => setAcc({ ...acc, note: e.target.value })} aria-label="Ghi chú nghiệm thu" />
            </Field>
          </>
        )}
      </FormDialog>
    </Card>
  );
}

// ───────────────────────── Thanh toán ─────────────────────────

function PaymentSection({ c, data, editable }: { c: ContractDetail; data: LifecycleOverview; editable: boolean }) {
  const after = useAction(c.id);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', amount: '', dueDate: '' });
  const [rec, setRec] = useState<{ p: Payment; amount: string; paidDate: string; invoiceNo: string } | null>(null);
  const s = data.summary;

  const create = useMutation({
    ...after(() => {
      setOpen(false);
      toast.success('Đã thêm đợt thanh toán');
    }),
    mutationFn: () => api(`/contracts/${c.id}/payments`, { method: 'POST', body: f }),
    onError: (e: unknown) => setError(errText(e)),
  });
  const record = useMutation({
    ...after(() => {
      setRec(null);
      toast.success('Đã ghi nhận thanh toán');
    }),
    mutationFn: () =>
      api(`/contracts/${c.id}/payments/${rec!.p.id}/record`, {
        method: 'POST',
        body: { amount: rec!.amount, paidDate: rec!.paidDate, invoiceNo: rec!.invoiceNo },
      }),
    onError: (e: unknown) => setError(errText(e)),
  });
  const cancel = useMutation({
    ...after(),
    mutationFn: (id: string) => api(`/contracts/${c.id}/payments/${id}`, { method: 'PATCH', body: { cancelled: true } }),
    onError: (e: unknown) => toast.error(errText(e)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Lịch thanh toán</CardTitle>
          <CardDescription>
            Đã thu {formatMoney(s.paid, c.currency)} / {formatMoney(s.scheduled, c.currency)} · còn {formatMoney(s.remaining, c.currency)}
            {s.overduePayments > 0 && <span className="text-destructive"> · {s.overduePayments} đợt quá hạn</span>}
          </CardDescription>
        </div>
        {editable && (
          <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>
            <Plus /> Thêm đợt
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {s.scheduleMismatch && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4" /> Tổng lịch thanh toán ({formatMoney(s.scheduled, c.currency)}) khác giá trị hợp đồng ({formatMoney(c.value, c.currency)}).
          </p>
        )}
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lịch thanh toán.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đợt</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead className="text-right">Đã thu</TableHead>
                <TableHead>Hạn</TableHead>
                <TableHead>Hóa đơn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.map((p) => (
                <TableRow key={p.id} className={p.status === 'CANCELLED' ? 'opacity-50' : ''}>
                  <TableCell>{p.seq}</TableCell>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.amount, c.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.paidAmount, c.currency)}</TableCell>
                  <TableCell className={cn('whitespace-nowrap', p.overdue && 'font-medium text-destructive')}>
                    {formatDate(p.dueDate)} {p.overdue && '(quá hạn)'}
                  </TableCell>
                  <TableCell>{p.invoiceNo ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'PAID' ? 'default' : p.status === 'PARTIAL' ? 'secondary' : 'outline'}>{PAYMENT_STATUS[p.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {editable && (p.status === 'PLANNED' || p.status === 'PARTIAL') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setError(null);
                            setRec({ p, amount: String(Number(p.amount) - Number(p.paidAmount)), paidDate: today(), invoiceNo: p.invoiceNo ?? '' });
                          }}
                        >
                          <Wallet /> Ghi nhận
                        </Button>
                        {p.status === 'PLANNED' && (
                          <Button size="icon-sm" variant="ghost" aria-label="Hủy đợt" onClick={() => cancel.mutate(p.id)}>
                            <Ban />
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <FormDialog title="Thêm đợt thanh toán" open={open} onClose={() => setOpen(false)} onSubmit={() => create.mutate()} pending={create.isPending} error={error}>
        <Field label="Nội dung *">
          <Input placeholder="vd: Đợt 1 – tạm ứng 30%" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Nội dung đợt" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Số tiền (${c.currency}) *`}>
            <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Số tiền" />
          </Field>
          <Field label="Hạn thanh toán">
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-label="Hạn thanh toán" />
          </Field>
        </div>
      </FormDialog>
      <FormDialog title={`Ghi nhận thanh toán – ${rec?.p.title ?? ''}`} open={!!rec} onClose={() => setRec(null)} onSubmit={() => record.mutate()} pending={record.isPending} error={error}>
        {rec && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Số tiền nhận">
                <Input inputMode="decimal" value={rec.amount} onChange={(e) => setRec({ ...rec, amount: e.target.value })} aria-label="Số tiền nhận" />
              </Field>
              <Field label="Ngày nhận">
                <Input type="date" value={rec.paidDate} onChange={(e) => setRec({ ...rec, paidDate: e.target.value })} aria-label="Ngày nhận" />
              </Field>
            </div>
            <Field label="Số hóa đơn">
              <Input value={rec.invoiceNo} onChange={(e) => setRec({ ...rec, invoiceNo: e.target.value })} aria-label="Số hóa đơn" />
            </Field>
            <p className="text-xs text-muted-foreground">Còn phải thu của đợt: {formatMoney(Number(rec.p.amount) - Number(rec.p.paidAmount), c.currency)}</p>
          </>
        )}
      </FormDialog>
    </Card>
  );
}

export function ContractLifecycleTab({ contract }: { contract: ContractDetail }) {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['contract', contract.id, 'lifecycle', contract.updatedAt],
    queryFn: () => api<LifecycleOverview>(`/contracts/${contract.id}/lifecycle`),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-64" />;
  const editable = can('contract.update') && !contract.deletedAt && !contract.archivedAt && !['LIQUIDATED', 'CANCELLED'].includes(contract.status);

  return (
    <div className="space-y-4">
      {contract.status === 'LIQUIDATED' && (
        <p className="rounded-md bg-muted px-4 py-3 text-sm">
          Hợp đồng đã thanh lý ngày {formatDate(q.data.contract.liquidatedAt)}. {q.data.contract.liquidationNote}
        </p>
      )}
      <PaymentSection c={contract} data={q.data} editable={editable} />
      <ObligationSection c={contract} data={q.data} editable={editable} />
      <AppendixSection c={contract} data={q.data.appendices} editable={editable} />
    </div>
  );
}

