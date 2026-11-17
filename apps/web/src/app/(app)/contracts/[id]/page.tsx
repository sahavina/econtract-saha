'use client';

import { type ContractStatus } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, CheckCircle2, ChevronRight, ClipboardCheck, Copy, FileText, FileX2, MoreHorizontal, Package, PackageMinus, Pencil, Receipt, RotateCcw, Trash2, Truck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { ContractApprovalTab } from '@/components/contract-approval-tab';
import { ContractContentTab } from '@/components/contract-content-tab';
import { ContractDocumentsTab } from '@/components/contract-documents-tab';
import { ContractFeedbackTab, useContractFeedback } from '@/components/contract-feedback-tab';
import { ContractLifecycleTab } from '@/components/contract-lifecycle-tab';
import { ContractOrdersTab, OrderItemsTab } from '@/components/contract-orders';
import { ContractOverview } from '@/components/contract-overview';
import { OrderDeliveries } from '@/components/order-deliveries';
import { ContractRevisionsTab } from '@/components/contract-revisions-tab';
import { ContractInspectionsTab, useContractInspections } from '@/components/contract-inspections';
import { InspectionRequestDialog } from '@/components/inspection-request-dialog';
import { LiquidateDialog } from '@/components/liquidate-dialog';
import { ContractSignatureTab } from '@/components/contract-signature-tab';
import { EmptyState, ErrorState } from '@/components/page-header';
import { ContractStatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { ContractDetail, TimelineEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROLE_LABELS = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' } as const;

const APPROVAL_LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'Chưa gửi duyệt',
  PENDING: 'Đang duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  CHANGES_REQUESTED: 'Yêu cầu sửa',
};
const SIGNATURE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa ký',
  IN_PROGRESS: 'Đang ký',
  COMPLETED: 'Đã ký',
  REJECTED: 'Từ chối ký',
  EXPIRED: 'Hết hạn ký',
};

/** Vị trí của trạng thái trên tiến trình Soạn thảo → Phê duyệt → Ký → Hiệu lực → Kết thúc (-1: đã hủy / lưu trữ). */
const STEP_OF: Record<ContractStatus, number> = {
  DRAFT: 0,
  PENDING_APPROVAL: 1,
  APPROVED: 2,
  PENDING_SIGNATURE: 2,
  SIGNED: 3,
  ACTIVE: 3,
  EXPIRED: 4,
  LIQUIDATED: 4,
  CANCELLED: -1,
  ARCHIVED: -1,
};

function StatusStepper({ status, isOrder }: { status: ContractStatus; isOrder: boolean }) {
  const steps = ['Soạn thảo', 'Phê duyệt', 'Ký kết', isOrder ? 'Thực hiện' : 'Hiệu lực', status === 'LIQUIDATED' ? 'Thanh lý' : 'Kết thúc'];
  const cur = STEP_OF[status];
  if (cur < 0) return null;
  return (
    <ol className="flex items-center gap-1 overflow-x-auto border-t px-4 py-3 [scrollbar-width:none] sm:px-5">
      {steps.map((label, i) => {
        const done = i < cur || (i === cur && i === steps.length - 1);
        const current = i === cur && !done;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className={cn('h-0.5 w-6 rounded-full sm:w-10', i <= cur ? 'bg-primary' : 'bg-border')} />}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
                done && 'text-primary',
                current && 'bg-primary text-primary-foreground shadow-sm',
                !done && !current && 'text-muted-foreground',
              )}
            >
              {done ? <CheckCircle2 className="size-3.5" /> : <span className={cn('flex size-4 items-center justify-center rounded-full text-[10px]', current ? 'bg-white/25' : 'border')}>{i + 1}</span>}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  );
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const initialTab = useSearchParams().get('tab') ?? 'overview';
  const { can } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [liquidating, setLiquidating] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const inspections = useContractInspections(id);
  const [tab, setTab] = useState(initialTab);
  /** Mở một tab từ nút trong tab Tổng quan và cuộn tới thanh tab. */
  const openTab = (value: string) => {
    setTab(value);
    document.querySelector('[data-slot=tabs-list]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const q = useQuery({ queryKey: ['contract', id], queryFn: () => api<ContractDetail>(`/contracts/${id}`) });
  const timeline = useQuery({ queryKey: ['contract', id, 'timeline'], queryFn: () => api<TimelineEntry[]>(`/contracts/${id}/timeline`) });
  const feedbackNew = useContractFeedback(id).data?.newCount ?? 0;

  const op = useMutation({
    mutationFn: (action: 'archive' | 'unarchive' | 'restore' | 'delete' | 'duplicate') =>
      action === 'delete' ? api<undefined>(`/contracts/${id}`, { method: 'DELETE' }) : api<{ id: string }>(`/contracts/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['contract', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const c = q.data;
  const editable = c.status === 'DRAFT' && !c.archivedAt && !c.deletedAt;
  // Nút sửa ngay tại khung thông tin: hồ sơ Nháp mở trang sửa; hồ sơ đã duyệt (chưa gửi ký) phải mở lại ở tab Phê duyệt trước.
  const editInfo =
    editable && can('contract.update') ? (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/contracts/${c.id}/edit`}>
          <Pencil /> Sửa thông tin
        </Link>
      </Button>
    ) : c.status === 'APPROVED' && !c.archivedAt && !c.deletedAt && can('contract.reopen_approved') ? (
      <span className="text-xs text-muted-foreground">Đã phê duyệt – mở lại ở tab Phê duyệt để sửa</span>
    ) : null;
  const isOrder = c.kind === 'ORDER';
  const noun = isOrder ? 'đơn hàng' : 'hợp đồng';

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Không gian làm việc</Link>
        <ChevronRight className="size-3.5" />
        <Link href={isOrder ? '/orders' : '/contracts'} className="hover:text-foreground">{isOrder ? 'Đơn đặt hàng' : 'Quản lý hợp đồng'}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{c.code}</span>
      </nav>

      <div className="mb-5 overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-12">
              {isOrder ? <Package className="size-6" /> : <FileText className="size-6" />}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl leading-tight font-semibold tracking-tight break-words sm:text-2xl">{c.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <ContractStatusBadge status={c.status} />
                {c.archivedAt && <Badge variant="outline">Đã lưu trữ</Badge>}
                {c.deletedAt && <Badge variant="destructive">Thùng rác</Badge>}
                <span className="font-medium text-foreground/80">{c.code}</span>
                <span>· Phụ trách: {c.owner?.fullName ?? '—'}</span>
                {c.parentContract && (
                  <span>
                    · Thuộc hợp đồng{' '}
                    <Link href={`/contracts/${c.parentContract.id}?tab=orders`} className="text-primary hover:underline">
                      {c.parentContract.code}
                    </Link>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {c.deletedAt ? (
              can('contract.delete') && (
                <Button variant="outline" onClick={() => op.mutate('restore', { onSuccess: () => toast.success('Đã khôi phục') })}>
                  <RotateCcw /> Khôi phục
                </Button>
              )
            ) : (
              <>
                {editable && can('contract.update') && (
                  <Button asChild>
                    <Link href={`/contracts/${c.id}/edit`}>
                      <Pencil /> Sửa {noun}
                    </Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link href={`/payment-requests/new?contract=${c.id}`}>
                    <Receipt /> Đề nghị thanh toán
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <MoreHorizontal /> Thao tác
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    {can('inspection.create') && (
                      <DropdownMenuItem onSelect={() => setInspecting(true)}>
                        <ClipboardCheck /> Yêu cầu kiểm tra
                      </DropdownMenuItem>
                    )}
                    {isOrder && can('delivery.manage') && (
                      <DropdownMenuItem asChild>
                        <Link href={`/stock-issues/new?order=${c.id}`}>
                          <PackageMinus /> Lập phiếu xuất kho
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {isOrder && (
                      <DropdownMenuItem asChild>
                        <Link href={`/shipping-labels/new?order=${c.id}`}>
                          <Truck /> In phiếu gửi hàng
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {can('contract.liquidate') && ['SIGNED', 'ACTIVE', 'EXPIRED'].includes(c.status) && !c.archivedAt && (
                      <DropdownMenuItem onSelect={() => setLiquidating(true)}>
                        <FileX2 /> Thanh lý
                      </DropdownMenuItem>
                    )}
                    {can('contract.create') && (
                      <DropdownMenuItem onSelect={() => op.mutate('duplicate', { onSuccess: (r) => { toast.success('Đã tạo bản sao'); if (r) router.push(`/contracts/${r.id}`); } })}>
                        <Copy /> Sao chép
                      </DropdownMenuItem>
                    )}
                    {can('contract.archive') &&
                      (c.archivedAt ? (
                        <DropdownMenuItem onSelect={() => op.mutate('unarchive', { onSuccess: () => toast.success('Đã bỏ lưu trữ') })}>
                          <ArchiveRestore /> Bỏ lưu trữ
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setConfirm({ title: `Lưu trữ ${noun} này?`, onConfirm: () => op.mutateAsync('archive').then(() => void toast.success('Đã lưu trữ')) })}>
                          <Archive /> Lưu trữ
                        </DropdownMenuItem>
                      ))}
                    {can('contract.delete') && (c.status === 'DRAFT' || c.status === 'CANCELLED') && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            setConfirm({
                              title: `Chuyển ${noun} vào thùng rác?`,
                              description: 'Có thể khôi phục từ Thùng rác.',
                              destructive: true,
                              confirmLabel: 'Xóa',
                              onConfirm: () => op.mutateAsync('delete').then(() => { toast.success('Đã chuyển vào thùng rác'); router.push(isOrder ? '/orders' : '/contracts'); }),
                            })
                          }
                        >
                          <Trash2 /> Xóa
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <StatusStepper status={c.status} isOrder={isOrder} />

        <dl className="grid grid-cols-2 border-t lg:grid-cols-4 [&>div]:p-4 [&>div]:sm:px-5 [&>div:nth-child(odd)]:border-r lg:[&>div]:border-r lg:[&>div:last-child]:border-r-0 max-lg:[&>div:nth-child(-n+2)]:border-b">
          <div>
            <dt className="text-xs text-muted-foreground">{isOrder ? 'Giá trị đơn (chưa VAT)' : 'Giá trị hợp đồng'}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{formatMoney(c.value, c.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{isOrder ? 'Khách hàng' : 'Đối tác'}</dt>
            <dd className="mt-1 line-clamp-2 text-sm font-semibold">{c.parties.find((p) => !p.isInternal)?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{isOrder ? 'Ngày giao hàng' : 'Thời hạn'}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {isOrder ? formatDate(c.deliveryDate) : c.effectiveDate || c.expiryDate ? `${formatDate(c.effectiveDate)} → ${formatDate(c.expiryDate)}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Phê duyệt · Ký</dt>
            <dd className="mt-1 text-sm font-semibold">
              {APPROVAL_LABELS[c.approvalStatus] ?? c.approvalStatus} · {SIGNATURE_LABELS[c.signatureStatus] ?? c.signatureStatus}
            </dd>
          </div>
        </dl>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="h-auto w-full justify-start gap-0 overflow-x-auto [scrollbar-width:thin] rounded-none border-b p-0 pb-px **:data-[slot=tabs-trigger]:h-10 **:data-[slot=tabs-trigger]:flex-none **:data-[slot=tabs-trigger]:px-3 **:data-[slot=tabs-trigger]:after:bottom-0 **:data-[slot=tabs-trigger]:after:bg-primary">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          {(isOrder || c.items.length > 0) && <TabsTrigger value="items">{isOrder ? 'Hàng hóa & giao hàng' : 'Hàng hóa'} ({c.items.length})</TabsTrigger>}
          <TabsTrigger value="content">{isOrder ? 'Nội dung đơn hàng' : 'Nội dung hợp đồng'}</TabsTrigger>
          {!isOrder && <TabsTrigger value="orders">Đơn đặt hàng ({c._count?.orders ?? 0})</TabsTrigger>}
          <TabsTrigger value="inspections">Kiểm tra{inspections.data ? ` (${inspections.data.total})` : ''}</TabsTrigger>
          <TabsTrigger value="parties">Các bên tham gia ({c.parties.length})</TabsTrigger>
          <TabsTrigger value="approval">Phê duyệt</TabsTrigger>
          <TabsTrigger value="signature">Ký điện tử</TabsTrigger>
          <TabsTrigger value="lifecycle">Vòng đời</TabsTrigger>
          <TabsTrigger value="documents">Tài liệu</TabsTrigger>
          <TabsTrigger value="feedback">
            Khách hàng góp ý
            {feedbackNew > 0 && <Badge className="ml-1 h-5 min-w-5 px-1.5" aria-label={`${feedbackNew} yêu cầu mới`}>{feedbackNew}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="revisions">Lịch sử chỉnh sửa</TabsTrigger>
          <TabsTrigger value="history">Lịch sử hoạt động</TabsTrigger>
        </TabsList>

        <TabsContent value="inspections" className="mt-4">
          <ContractInspectionsTab contractId={c.id} onRequest={can('inspection.create') && !c.deletedAt ? () => setInspecting(true) : undefined} />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <ContractOverview contract={c} editInfo={editInfo} onOpenTab={openTab} />
        </TabsContent>

        {(isOrder || c.items.length > 0) && (
          <TabsContent value="items" className="mt-4">
            {/* key: dữ liệu giao hàng đổi (sau khi lưu) thì khởi tạo lại ô nhập. */}
            <OrderItemsTab key={c.items.map((i) => `${i.id}:${i.deliveredQty}`).join('|')} order={c} />
            {isOrder && <OrderDeliveries orderId={c.id} />}
          </TabsContent>
        )}
        {!isOrder && (
          <TabsContent value="orders" className="mt-4">
            <ContractOrdersTab contract={c} />
          </TabsContent>
        )}

        <TabsContent value="content" className="mt-4">
          <ContractContentTab key={c.id} contract={c} editable={editable && can('contract.update')} />
        </TabsContent>

        <TabsContent value="approval" className="mt-4">
          <ContractApprovalTab contract={c} />
        </TabsContent>

        <TabsContent value="lifecycle" className="mt-4">
          <ContractLifecycleTab contract={c} />
        </TabsContent>

        <TabsContent value="signature" className="mt-4">
          <ContractSignatureTab contract={c} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <ContractDocumentsTab
            contractId={c.id}
            contract={c}
            canSign={!c.deletedAt && !c.archivedAt}
            canManage={!c.deletedAt && !c.archivedAt && !['PENDING_APPROVAL', 'PENDING_SIGNATURE'].includes(c.status) && can('contract.update')}
            canDelete={!c.deletedAt && !c.archivedAt && !['PENDING_APPROVAL', 'PENDING_SIGNATURE'].includes(c.status) && c.signatureStatus !== 'COMPLETED' && can('contract.update')}
          />
        </TabsContent>

        <TabsContent value="feedback" className="mt-4">
          <ContractFeedbackTab contract={c} />
        </TabsContent>

        <TabsContent value="parties" className="mt-4 grid gap-4 md:grid-cols-2">
          {c.parties.length === 0 ? (
            <div className="md:col-span-2"><EmptyState title="Chưa có bên tham gia" /></div>
          ) : (
            c.parties.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge>{ROLE_LABELS[p.role]}</Badge> {p.name}
                    {p.isInternal && <Badge variant="outline">Nội bộ</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Info label="Mã số thuế / định danh">{p.taxCode}</Info>
                    <Info label="Loại chủ thể">{p.entityType === 'ORGANIZATION' ? 'Tổ chức' : 'Cá nhân'}</Info>
                    <div className="sm:col-span-2"><Info label="Địa chỉ">{p.address}</Info></div>
                    <Info label="Email">{p.email}</Info>
                    <Info label="Điện thoại">{p.phone}</Info>
                    <Info label="Người đại diện">{p.representative}</Info>
                    <Info label="Chức vụ">{p.position}</Info>
                    <div className="sm:col-span-2"><Info label="Căn cứ đại diện">{p.authorizationRef}</Info></div>
                    <div className="sm:col-span-2"><Info label="Số tài khoản">{p.bankAccount}</Info></div>
                  </dl>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="revisions" className="mt-4">
          <ContractRevisionsTab contractId={c.id} canRestore={editable && can('contract.update')} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent>
              {!timeline.data ? (
                <Skeleton className="h-32" />
              ) : timeline.data.length === 0 ? (
                <EmptyState title="Chưa có lịch sử" />
              ) : (
                <ol className="relative ml-2 border-l">
                  {timeline.data.map((t) => (
                    <li key={t.id} className="mb-5 ml-4 last:mb-0">
                      <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background bg-primary" />
                      <p className="text-sm">
                        <span className="font-medium">{t.actorName ?? 'Hệ thống'}</span> — {AUDIT_ACTION_LABELS[t.action] ?? t.action}
                        {typeof t.data?.fileName === 'string' && <span className="text-muted-foreground">: {t.data.fileName}</span>}
                        {typeof t.data?.step === 'string' && <span className="text-muted-foreground"> ({t.data.step})</span>}
                        {typeof t.data?.comment === 'string' && t.data.comment && <span className="block text-xs text-muted-foreground">“{t.data.comment}”</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <LiquidateDialog contractId={c.id} code={c.code} open={liquidating} onClose={() => setLiquidating(false)} />
      {inspecting && <InspectionRequestDialog open contract={c} onClose={() => setInspecting(false)} />}
    </>
  );
}
