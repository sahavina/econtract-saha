'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleCheck, Plus, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { ListCard, ListState, MobileCard, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { CreateInvoiceDialog } from '@/components/platform-invoices';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, type Paginated } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { errorList, FormErrors, type Invoice, invoiceState, type TenantRow, usePlatformGate } from '@/lib/platform';

const STATUS_OPTIONS = [
  { value: 'ISSUED', label: 'Chờ thanh toán' },
  { value: 'OVERDUE', label: 'Quá hạn' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'VOID', label: 'Đã hủy' },
];

/** Màu nhãn trạng thái hóa đơn (cùng quy tắc với invoiceState). */
const invoiceTone = (inv: Pick<Invoice, 'status' | 'overdue'>): Tone => (inv.status === 'PAID' ? 'green' : inv.status === 'VOID' ? 'gray' : inv.overdue ? 'red' : 'amber');

function InvoiceStatus({ inv }: { inv: Invoice }) {
  return <StatusPill tone={invoiceTone(inv)}>{invoiceState(inv).label}</StatusPill>;
}

function VoidInvoiceDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const run = useMutation({
    meta: { silent: true },
    mutationFn: () => api(`/platform/invoices/${invoice!.id}/void`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Đã hủy hóa đơn');
      qc.invalidateQueries({ queryKey: ['platform'] });
      setReason('');
      onClose();
    },
    onError: (err) => setErrors(errorList(err)),
  });
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy hóa đơn {invoice?.number}</DialogTitle>
          <DialogDescription>Hóa đơn đã hủy không thể khôi phục; phát hành hóa đơn mới nếu cần.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Lý do *</Label>
          <Textarea id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <FormErrors errors={errors} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="destructive" disabled={run.isPending || !reason.trim()} onClick={() => run.mutate()}>
            Hủy hóa đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformInvoicesPage() {
  const { allowed, denied } = usePlatformGate();
  const search = useSearchParams();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string | undefined>(search.get('status') ?? undefined);
  const [tenantId, setTenantId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);

  const list = useQuery({
    queryKey: ['platform', 'invoices', { status, tenantId, page }],
    queryFn: () => api<Paginated<Invoice>>('/platform/invoices', { query: { status, tenantId, page, pageSize: 30 } }),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', 'all'],
    queryFn: () => api<Paginated<TenantRow>>('/platform/tenants', { query: { pageSize: 100 } }),
    enabled: allowed,
  });
  const pay = useMutation({
    mutationFn: (id: string) => api(`/platform/invoices/${id}/pay`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Đã ghi nhận thanh toán');
      qc.invalidateQueries({ queryKey: ['platform'] });
    },
  });
  if (!allowed) return denied;

  /** Nút ghi nhận thanh toán / hủy – chỉ với hóa đơn đang chờ thanh toán. */
  const actions = (inv: Invoice) =>
    inv.status === 'ISSUED' && (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ghi nhận thanh toán ${inv.number}`}
          title="Ghi nhận đã thanh toán"
          disabled={pay.isPending}
          onClick={() =>
            setConfirm({
              title: `Ghi nhận đã thanh toán ${inv.number}?`,
              description: `Số tiền ${formatMoney(inv.amount)}. Thao tác không thể hoàn tác.`,
              confirmLabel: 'Đã thanh toán',
              onConfirm: () => pay.mutateAsync(inv.id).then(() => undefined),
            })
          }
        >
          <CircleCheck />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Hủy hóa đơn ${inv.number}`} title="Hủy hóa đơn" onClick={() => setVoiding(inv)}>
          <Ban />
        </Button>
      </>
    );

  return (
    <>
      <PageHeader
        title="Hóa đơn thuê bao"
        description="Hóa đơn thu phí thuê bao của các doanh nghiệp."
        crumbs={[{ label: 'Super Admin' }, { label: 'Hóa đơn' }]}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!tenants.data}>
            <Plus /> Phát hành hóa đơn
          </Button>
        }
      />
      <ListCard
        toolbar={
          <>
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-44 sm:flex-none" allLabel="Mọi trạng thái" ariaLabel="Trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
            <FilterSelect className="h-9 min-w-0 flex-1 sm:w-64 sm:flex-none" allLabel="Mọi doanh nghiệp" ariaLabel="Doanh nghiệp" value={tenantId} onChange={(v) => { setTenantId(v); setPage(1); }} options={(tenants.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </>
        }
      >
        <ListState query={list} empty={{ title: 'Chưa có hóa đơn' }} />
        {!!list.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {list.data.items.map((inv) => (
                <MobileCard
                  key={inv.id}
                  title={inv.number}
                  sub={inv.tenant?.name}
                  status={<InvoiceStatus inv={inv} />}
                  footer={inv.status === 'ISSUED' ? <span className="flex gap-1">{actions(inv)}</span> : undefined}
                >
                  <span className="line-clamp-2 block text-muted-foreground">{inv.description}</span>
                  {inv.note && <span className="line-clamp-2 block text-xs text-muted-foreground">{inv.note}</span>}
                  <span className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold tabular-nums">{formatMoney(inv.amount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {inv.paidAt ? `Đã thu ${formatDate(inv.paidAt)}` : `Hạn ${formatDate(inv.dueDate)}`}
                    </span>
                  </span>
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
                    <Th className="pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="pl-4">
                        <TitleCell
                          icon={Receipt}
                          title={inv.number}
                          sub={
                            inv.tenant && (
                              <Link href={`/platform/tenants/${inv.tenant.id}`} className="hover:text-primary hover:underline">
                                {inv.tenant.name}
                              </Link>
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="max-w-80 min-w-56 text-sm whitespace-normal">
                        <span className="line-clamp-2">{inv.description}</span>
                        {inv.note && <p className="line-clamp-2 text-xs text-muted-foreground">{inv.note}</p>}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(inv.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell>
                        <InvoiceStatus inv={inv} />
                        {inv.paidAt && <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(inv.paidAt)}</p>}
                      </TableCell>
                      <TableCell className="pr-4 text-right whitespace-nowrap">{actions(inv)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={30} unit="hóa đơn" onPage={setPage} />
          </>
        )}
      </ListCard>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <VoidInvoiceDialog invoice={voiding} onClose={() => setVoiding(null)} />
      {creating && tenants.data && <CreateInvoiceDialog tenants={tenants.data.items} onClose={() => setCreating(false)} />}
    </>
  );
}
