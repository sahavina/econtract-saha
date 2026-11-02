'use client';

import { CONTRACT_CATEGORY_LABELS } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Copy, FileX2, PackageMinus, Pencil, Receipt, RotateCcw, Trash2, Truck } from 'lucide-react';
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
import { OrderDeliveries } from '@/components/order-deliveries';
import { ContractRevisionsTab } from '@/components/contract-revisions-tab';
import { LiquidateDialog } from '@/components/liquidate-dialog';
import { ContractSignatureTab } from '@/components/contract-signature-tab';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { ContractStatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { ContractDetail, TimelineEntry } from '@/lib/types';

const ROLE_LABELS = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' } as const;
const CONF_LABELS = { PUBLIC: 'Công khai', INTERNAL: 'Nội bộ', CONFIDENTIAL: 'Mật', SECRET: 'Tối mật' } as const;

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
  const isOrder = c.kind === 'ORDER';
  const noun = isOrder ? 'đơn hàng' : 'hợp đồng';

  return (
    <>
      <PageHeader
        crumbs={[isOrder ? { label: 'Đơn đặt hàng', href: '/orders' } : { label: 'Quản lý hợp đồng', href: '/contracts' }, { label: c.code }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.title} <ContractStatusBadge status={c.status} />
            {c.archivedAt && <Badge variant="outline">Đã lưu trữ</Badge>}
            {c.deletedAt && <Badge variant="destructive">Thùng rác</Badge>}
          </span>
        }
        description={
          <>
            {c.code} · Phụ trách: {c.owner?.fullName ?? '—'}
            {c.parentContract && (
              <>
                {' · Thuộc hợp đồng '}
                <Link href={`/contracts/${c.parentContract.id}?tab=orders`} className="text-primary hover:underline">
                  {c.parentContract.code}
                </Link>
              </>
            )}
          </>
        }
        actions={
          c.deletedAt ? (
            can('contract.delete') && (
              <Button variant="outline" onClick={() => op.mutate('restore', { onSuccess: () => toast.success('Đã khôi phục') })}>
                <RotateCcw /> Khôi phục
              </Button>
            )
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link href={`/payment-requests/new?contract=${c.id}`}>
                  <Receipt /> Đề nghị thanh toán
                </Link>
              </Button>
              {isOrder && can('delivery.manage') && (
                <Button variant="outline" asChild>
                  <Link href={`/stock-issues/new?order=${c.id}`}>
                    <PackageMinus /> Lập phiếu xuất kho
                  </Link>
                </Button>
              )}
              {isOrder && (
                <Button variant="outline" asChild>
                  <Link href={`/shipping-labels/new?order=${c.id}`}>
                    <Truck /> In phiếu gửi hàng
                  </Link>
                </Button>
              )}
              {editable && can('contract.update') && (
                <Button variant="outline" asChild>
                  <Link href={`/contracts/${c.id}/edit`}>
                    <Pencil /> Sửa
                  </Link>
                </Button>
              )}
              {can('contract.liquidate') && ['SIGNED', 'ACTIVE', 'EXPIRED'].includes(c.status) && !c.archivedAt && (
                <Button variant="outline" onClick={() => setLiquidating(true)}>
                  <FileX2 /> Thanh lý
                </Button>
              )}
              {can('contract.create') && (
                <Button variant="outline" onClick={() => op.mutate('duplicate', { onSuccess: (r) => { toast.success('Đã tạo bản sao'); if (r) router.push(`/contracts/${r.id}`); } })}>
                  <Copy /> Sao chép
                </Button>
              )}
              {can('contract.archive') && (
                c.archivedAt ? (
                  <Button variant="outline" onClick={() => op.mutate('unarchive', { onSuccess: () => toast.success('Đã bỏ lưu trữ') })}>
                    <ArchiveRestore /> Bỏ lưu trữ
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setConfirm({ title: `Lưu trữ ${noun} này?`, onConfirm: () => op.mutateAsync('archive').then(() => void toast.success('Đã lưu trữ')) })}>
                    <Archive /> Lưu trữ
                  </Button>
                )
              )}
              {can('contract.delete') && (c.status === 'DRAFT' || c.status === 'CANCELLED') && (
                <Button
                  variant="destructive"
                  onClick={() =>
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
                </Button>
              )}
            </>
          )
        }
      />

      <Tabs defaultValue={initialTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          {isOrder && <TabsTrigger value="items">Hàng hóa & giao hàng ({c.items.length})</TabsTrigger>}
          <TabsTrigger value="content">{isOrder ? 'Nội dung đơn hàng' : 'Nội dung hợp đồng'}</TabsTrigger>
          {!isOrder && <TabsTrigger value="orders">Đơn đặt hàng ({c._count?.orders ?? 0})</TabsTrigger>}
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

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Thông tin chung</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info label={isOrder ? 'Số đơn hàng' : 'Mã hợp đồng'}>{c.code}</Info>
                <Info label={isOrder ? 'Loại đơn' : 'Loại hợp đồng'}>{c.contractType?.name}</Info>
                {isOrder ? (
                  <Info label="Hợp đồng nguyên tắc">
                    {c.parentContract && (
                      <Link href={`/contracts/${c.parentContract.id}`} className="text-primary hover:underline">
                        {c.parentContract.code}
                      </Link>
                    )}
                  </Info>
                ) : (
                  <>
                    <Info label="Phân loại">{c.category ? CONTRACT_CATEGORY_LABELS[c.category] : 'Chưa phân loại'}</Info>
                    <Info label="Nhóm hợp đồng">{c.group}</Info>
                  </>
                )}
                <Info label="Phòng ban">{c.department?.name}</Info>
                <Info label="Người phụ trách">{c.owner?.fullName}</Info>
                <Info label="Người tạo">{c.createdBy.fullName}</Info>
                <Info label="Mức độ bảo mật">{CONF_LABELS[c.confidentiality]}</Info>
                <Info label="Ngày tạo">{formatDateTime(c.createdAt)}</Info>
                <Info label="Cập nhật lần cuối">{formatDateTime(c.updatedAt)}</Info>
                <div className="sm:col-span-2 lg:col-span-3"><Info label="Mô tả">{c.description}</Info></div>
                <div className="sm:col-span-2 lg:col-span-3"><Info label="Ghi chú">{c.note}</Info></div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Info label="Tags">
                    {c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</span> : null}
                  </Info>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Giá trị & thời hạn</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Info label={isOrder ? 'Giá trị đơn (chưa VAT)' : 'Giá trị hợp đồng'}><span className="text-lg font-semibold">{formatMoney(c.value, c.currency)}</span></Info>
                <Info label="Thuế VAT">{c.vatRate ? `${Number(c.vatRate)}%` : null}</Info>
                <Info label={isOrder ? 'Ngày đặt hàng' : 'Ngày dự kiến ký'}>{formatDate(c.expectedSignDate)}</Info>
                <Info label="Ngày ký">{formatDate(c.signedDate)}</Info>
                {isOrder ? (
                  <>
                    <Info label="Ngày giao hàng">{formatDate(c.deliveryDate)}</Info>
                    <Info label="Địa điểm giao hàng">{c.deliveryAddress}</Info>
                    <Info label="Điều kiện thanh toán">{c.paymentTerms}</Info>
                  </>
                ) : (
                  <Info label="Hiệu lực">{formatDate(c.effectiveDate)} → {formatDate(c.expiryDate)}</Info>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {isOrder && (
          <TabsContent value="items" className="mt-4">
            {/* key: dữ liệu giao hàng đổi (sau khi lưu) thì khởi tạo lại ô nhập. */}
            <OrderItemsTab key={c.items.map((i) => `${i.id}:${i.deliveredQty}`).join('|')} order={c} />
            <OrderDeliveries orderId={c.id} />
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
    </>
  );
}
