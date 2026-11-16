'use client';

/**
 * Tab Tổng quan của trang chi tiết hợp đồng / đơn hàng:
 * cột trái – thông tin hợp đồng, các bên ký kết, tiến độ thanh toán, tài liệu đính kèm;
 * cột phải – tiến trình hợp đồng, hoạt động gần đây, nhắc việc sắp tới.
 */
import { CONTRACT_CATEGORY_LABELS, type ContractStatus } from '@saha/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileText,
  History,
  Network,
  Paperclip,
  Plus,
  Route,
  ShieldCheck,
  User,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { InitialsAvatar, StatusPill, type Tone } from '@/components/list-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { api, downloadFile } from '@/lib/api';
import { formatFileSize } from '@/lib/documents';
import { AUDIT_ACTION_LABELS, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { ContractDetail, ContractDocument, LifecycleOverview, Payment, SignatureRequestInfo, TimelineEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROLE_LABELS = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' } as const;
const CONF_LABELS = { PUBLIC: 'Công khai', INTERNAL: 'Nội bộ', CONFIDENTIAL: 'Mật', SECRET: 'Tối mật' } as const;
const DAY = 86_400_000;

function Section({ icon: Icon, title, action, children, className }: { icon: typeof FileText; title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <Icon className="size-5 text-muted-foreground" />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</CardContent>
    </Card>
  );
}

/** Một dòng thông tin: nhãn bên trái, giá trị bên phải (có thể kèm biểu tượng). */
function Row({ label, icon: Icon, children }: { label: string; icon?: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2 font-medium">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 break-words">{children || '—'}</span>
      </dd>
    </div>
  );
}

/** Trạng thái một đợt thanh toán: đã trả, một phần, quá hạn, chưa đến hạn. */
function paymentState(p: Payment): { label: string; tone: Tone } {
  if (p.status === 'PAID') return { label: 'Đã thanh toán', tone: 'green' };
  if (p.status === 'CANCELLED') return { label: 'Đã hủy', tone: 'gray' };
  if (p.overdue) return { label: 'Quá hạn', tone: 'red' };
  if (p.status === 'PARTIAL') return { label: 'Thanh toán một phần', tone: 'amber' };
  return { label: 'Chưa đến hạn', tone: 'amber' };
}

/** Bước của tiến trình theo trạng thái hợp đồng (-1: đã hủy / lưu trữ). */
const STEP_OF: Record<ContractStatus, number> = {
  DRAFT: 0, PENDING_APPROVAL: 1, APPROVED: 1, PENDING_SIGNATURE: 1, SIGNED: 2, ACTIVE: 3, EXPIRED: 4, LIQUIDATED: 4, CANCELLED: -1, ARCHIVED: -1,
};

export function ContractOverview({ contract: c, editInfo, onOpenTab }: { contract: ContractDetail; editInfo?: React.ReactNode; onOpenTab: (tab: string) => void }) {
  const isOrder = c.kind === 'ORDER';
  const now = useNow();
  const lifecycle = useQuery({
    queryKey: ['contract', c.id, 'lifecycle', c.updatedAt],
    queryFn: () => api<LifecycleOverview>(`/contracts/${c.id}/lifecycle`),
  });
  const docs = useQuery({ queryKey: ['contract', c.id, 'documents'], queryFn: () => api<ContractDocument[]>(`/contracts/${c.id}/documents`) });
  const signature = useQuery({
    queryKey: ['contract', c.id, 'signature', c.updatedAt],
    queryFn: () => api<SignatureRequestInfo[]>(`/contracts/${c.id}/signature`),
  });
  const timeline = useQuery({ queryKey: ['contract', c.id, 'timeline'], queryFn: () => api<TimelineEntry[]>(`/contracts/${c.id}/timeline`) });

  const partner = c.parties.find((p) => !p.isInternal);
  const signers = signature.data?.[0]?.signers ?? [];
  const signedRole = (role: string) => signers.some((s) => s.partyRole === role && s.status === 'SIGNED');
  const payments = (lifecycle.data?.payments ?? []).filter((p) => p.status !== 'CANCELLED');
  const total = Number(c.value) || 0;
  const daysLeft = (d: string) => (now ? Math.ceil((new Date(d).getTime() - now) / DAY) : null);

  // Tiến trình: lấy thời điểm và người thực hiện từ nhật ký.
  const entries = timeline.data ?? [];
  // Nhật ký trả về theo thứ tự cũ → mới: lấy lần gần nhất từ cuối danh sách.
  const lastOf = (...actions: string[]) => entries.findLast((e) => actions.includes(e.action));
  const approved = lastOf('contract.approval_approve', 'contract.self_approve', 'contract.approve_now');
  // Đang chờ duyệt: hiện lần gửi gần nhất và những người đã duyệt từ lần gửi đó.
  const submitted = lastOf('contract.submit_approval');
  const approvedBy = submitted
    ? [...new Set(entries.filter((e) => e.action === 'contract.approval_approve' && e.createdAt >= submitted.createdAt).map((e) => e.actorName ?? 'Hệ thống'))]
    : [];
  const recent = [...entries].reverse().slice(0, 4);
  const signedEntry = lastOf('contract.signature_completed', 'contract.signed');
  const cur = STEP_OF[c.status];
  const steps = [
    { label: isOrder ? 'Đã lập đơn' : 'Đã tạo', at: c.createdAt, by: c.createdBy.fullName, note: undefined as string | undefined },
    c.status === 'PENDING_APPROVAL'
      ? {
          label: 'Đang phê duyệt',
          at: submitted?.createdAt,
          by: undefined,
          note: [submitted?.actorName && `Gửi bởi ${submitted.actorName}`, approvedBy.length ? `Đã duyệt: ${approvedBy.join(', ')}` : 'Chờ người duyệt đầu tiên'].filter(Boolean).join(' · '),
        }
      : { label: 'Đã phê duyệt', at: approved?.createdAt, by: approved?.actorName ?? undefined, note: undefined },
    { label: 'Đã ký', at: signedEntry?.createdAt ?? c.signedDate ?? undefined, by: undefined, note: c.signedDate ? 'Các bên đã hoàn tất ký kết' : undefined },
    { label: isOrder ? 'Đang thực hiện' : 'Đang hiệu lực', at: c.effectiveDate ?? undefined, by: undefined, note: c.effectiveDate ? `Từ ${formatDate(c.effectiveDate)}` : undefined },
    { label: c.status === 'LIQUIDATED' ? 'Đã thanh lý' : 'Hoàn tất', at: undefined, by: undefined, note: c.expiryDate ? `${cur >= 4 ? 'Kết thúc' : 'Dự kiến'} ${formatDate(c.expiryDate)}` : undefined },
  ];

  // Nhắc việc: đợt thanh toán chưa xong và nghĩa vụ đang mở có hạn gần nhất.
  const reminders = [
    ...payments.filter((p) => p.status !== 'PAID' && p.dueDate).map((p) => ({ id: p.id, title: `Thanh toán ${p.title}`, due: p.dueDate!, overdue: p.overdue })),
    ...(lifecycle.data?.obligations ?? []).filter((o) => o.status !== 'DONE' && o.status !== 'CANCELLED' && o.dueDate).map((o) => ({ id: o.id, title: o.title, due: o.dueDate!, overdue: o.overdue })),
  ]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 3);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 space-y-4">
        <Section icon={FileText} title={isOrder ? 'Thông tin đơn hàng' : 'Thông tin hợp đồng'} action={editInfo}>
          <div className="grid gap-x-8 md:grid-cols-2 md:divide-x [&>dl:last-child]:md:pl-8">
            <dl>
              <Row label={isOrder ? 'Số đơn hàng' : 'Mã hợp đồng'}>{c.code}</Row>
              <Row label={isOrder ? 'Khách hàng' : 'Đối tác'}>
                {partner?.partnerId ? (
                  <Link href={`/partners/${partner.partnerId}`} className="text-primary hover:underline">
                    {partner.name}
                  </Link>
                ) : (
                  partner?.name
                )}
              </Row>
              <Row label={isOrder ? 'Loại đơn' : 'Loại hợp đồng'}>{c.contractType?.name}</Row>
              {isOrder ? (
                <Row label="HĐ nguyên tắc">
                  {c.parentContract && (
                    <Link href={`/contracts/${c.parentContract.id}`} className="text-primary hover:underline">
                      {c.parentContract.code}
                    </Link>
                  )}
                </Row>
              ) : (
                <Row label="Phân loại">{c.category ? CONTRACT_CATEGORY_LABELS[c.category] : 'Chưa phân loại'}</Row>
              )}
              {!isOrder && c.group && <Row label="Nhóm hợp đồng">{c.group}</Row>}
            </dl>
            <dl>
              <Row label="Phụ trách" icon={UserRound}>{c.owner?.fullName}</Row>
              <Row label="Phòng ban" icon={Network}>{c.department?.name}</Row>
              <Row label={isOrder ? 'Giá trị (chưa VAT)' : 'Tổng giá trị'} icon={Database}>
                <span className="font-semibold tabular-nums">{formatMoney(c.value, c.currency)}</span>
                {c.vatRate && <span className="ml-1.5 text-xs font-normal text-muted-foreground">VAT {Number(c.vatRate)}%</span>}
              </Row>
              <Row label={isOrder ? 'Ngày giao' : 'Thời hạn'} icon={CalendarDays}>
                {isOrder ? formatDate(c.deliveryDate) : c.effectiveDate || c.expiryDate ? `${formatDate(c.effectiveDate)} – ${formatDate(c.expiryDate)}` : null}
              </Row>
            </dl>
          </div>
          <dl className="mt-3 grid gap-x-8 gap-y-1 border-t pt-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Người tạo', `${c.createdBy.fullName} · ${formatDateTime(c.createdAt)}`],
              ['Cập nhật', formatDateTime(c.updatedAt)],
              ['Bảo mật', CONF_LABELS[c.confidentiality]],
              ...(isOrder ? ([['Địa điểm giao', c.deliveryAddress], ['Điều kiện thanh toán', c.paymentTerms]] as const) : []),
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words">{v || '—'}</dd>
              </div>
            ))}
            {(c.description || c.note) && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-muted-foreground">{c.description ? 'Mô tả' : 'Ghi chú'}</dt>
                <dd className="break-words whitespace-pre-line">{c.description || c.note}</dd>
              </div>
            )}
            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 sm:col-span-2 lg:col-span-3">
                {c.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </dl>
        </Section>

        <Section icon={Users} title="Các bên ký kết" action={<TabLink onClick={() => onOpenTab('parties')}>Chi tiết các bên</TabLink>}>
          {c.parties.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có bên tham gia.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {c.parties.map((p, i) => (
                <div key={p.id ?? i} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {ROLE_LABELS[p.role]}
                    </Badge>
                    {signedRole(p.role) && (
                      <StatusPill tone="green">
                        <Check className="size-3" /> Đã ký
                      </StatusPill>
                    )}
                  </div>
                  <div className="flex items-start gap-3">
                    <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', p.isInternal ? 'bg-primary text-primary-foreground' : 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300')}>
                      {p.entityType === 'INDIVIDUAL' ? <User className="size-5" /> : <Building2 className="size-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="leading-snug font-semibold">{p.name}</p>
                      {p.taxCode && <p className="text-xs text-muted-foreground">MST {p.taxCode}</p>}
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Đại diện</dt>
                      <dd className="font-medium">{p.representative || '—'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Chức vụ</dt>
                      <dd>{p.position || '—'}</dd>
                    </div>
                    {(p.phone || p.email) && (
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">Liên hệ</dt>
                        <dd className="min-w-0 break-words">{[p.phone, p.email].filter(Boolean).join(' · ')}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Wallet} title="Tiến độ thanh toán" action={<TabLink onClick={() => onOpenTab('lifecycle')}>Quản lý thanh toán</TabLink>}>
          {!lifecycle.data ? (
            <Skeleton className="h-24" />
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa lập lịch thanh toán. Thêm các đợt ở tab Vòng đời.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-[13px] text-foreground/80">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Đợt</th>
                    <th className="px-3 py-2.5 font-semibold">Nội dung</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Tỷ lệ</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Số tiền</th>
                    <th className="px-3 py-2.5 font-semibold">Thời hạn</th>
                    <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => {
                    const st = paymentState(p);
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-2.5 font-semibold whitespace-nowrap">Đợt {p.seq}</td>
                        <td className="min-w-40 px-3 py-2.5">{p.title}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{total ? `${Math.round((Number(p.amount) / total) * 100)}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatMoney(p.amount, c.currency)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatDate(p.dueDate)}</td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          icon={Paperclip}
          title={
            <>
              Tài liệu đính kèm <span className="font-normal text-muted-foreground">({docs.data?.length ?? 0})</span>
            </>
          }
          action={
            <Button variant="outline" size="sm" className="border-primary/40 text-primary" onClick={() => onOpenTab('documents')}>
              <Plus /> Thêm tài liệu
            </Button>
          }
        >
          {!docs.data ? (
            <Skeleton className="h-20" />
          ) : docs.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có tài liệu.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-[13px] text-foreground/80">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Tên tài liệu</th>
                    <th className="px-3 py-2.5 font-semibold">Loại</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Dung lượng</th>
                    <th className="px-3 py-2.5 font-semibold">Cập nhật</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Tải</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docs.data.slice(0, 6).map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2.5">
                        <span className="flex min-w-48 items-center gap-2.5">
                          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase', /pdf/.test(d.mimeType) ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300')}>
                            {d.fileName.split('.').pop()?.slice(0, 4)}
                          </span>
                          <span className="line-clamp-1 break-all">{d.fileName}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{d.kind === 'MAIN' ? 'Bản gốc' : 'Đính kèm'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatFileSize(d.size)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatDate(d.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Tải ${d.fileName}`}
                          onClick={() => downloadFile(`/contracts/${c.id}/documents/${d.id}/download`).catch((e: Error) => toast.error(e.message))}
                        >
                          <Download />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(docs.data?.length ?? 0) > 6 && (
            <div className="mt-2">
              <TabLink onClick={() => onOpenTab('documents')}>Xem tất cả {docs.data?.length} tài liệu</TabLink>
            </div>
          )}
        </Section>
      </div>

      <div className="min-w-0 space-y-4">
        <Section icon={Route} title={isOrder ? 'Tiến trình đơn hàng' : 'Tiến trình hợp đồng'}>
          {cur < 0 ? (
            <p className="text-sm text-muted-foreground">{c.status === 'CANCELLED' ? 'Hồ sơ đã hủy.' : 'Hồ sơ đã lưu trữ.'}</p>
          ) : (
            <ol className="relative">
              {steps.map((s, i) => {
                const done = i < cur || (i === cur && (i === steps.length - 1 || c.status === 'SIGNED' || c.status === 'APPROVED'));
                const current = i === cur && !done;
                return (
                  <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < steps.length - 1 && <span className={cn('absolute top-6 bottom-0 left-[11px] w-0.5', i < cur ? 'bg-green-500' : 'bg-border')} />}
                    <span
                      className={cn(
                        'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                        done ? 'border-green-500 bg-green-500 text-white' : current ? 'border-primary bg-card' : 'border-border bg-card',
                      )}
                    >
                      {done && <Check className="size-3.5" strokeWidth={3} />}
                      {current && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={cn('text-sm font-semibold', current && 'text-primary', !done && !current && 'text-muted-foreground')}>{s.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {[s.at && (done || current) ? formatDateTime(s.at) : null, s.by && (done || current) ? `Bởi ${s.by}` : null, s.note].filter(Boolean).join(' · ') || (done || current ? '' : 'Chưa đến bước này')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <Section icon={History} title="Hoạt động gần đây" action={<TabLink onClick={() => onOpenTab('history')}>Xem tất cả</TabLink>}>
          {!timeline.data ? (
            <Skeleton className="h-24" />
          ) : timeline.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((t) => (
                <li key={t.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <InitialsAvatar name={t.actorName ?? 'Hệ thống'} className="size-8 text-[11px]" />
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-semibold">{t.actorName ?? 'Hệ thống'}</span> <span className="text-xs text-muted-foreground">· {formatDateTime(t.createdAt)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {AUDIT_ACTION_LABELS[t.action] ?? t.action}
                      {typeof t.data?.fileName === 'string' && `: ${t.data.fileName}`}
                    </p>
                    {typeof t.data?.comment === 'string' && t.data.comment && <p className="mt-0.5 text-xs text-muted-foreground italic">“{t.data.comment}”</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Bell} title="Nhắc việc sắp tới">
          {!lifecycle.data ? (
            <Skeleton className="h-16" />
          ) : reminders.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-green-600" /> Không có khoản thanh toán hay nghĩa vụ sắp đến hạn.
            </p>
          ) : (
            <ul className="space-y-2">
              {reminders.map((r) => {
                const left = daysLeft(r.due);
                return (
                  <li key={r.id} className={cn('flex items-center gap-3 rounded-xl border p-3', r.overdue ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/40' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40')}>
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', r.overdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
                      <CalendarDays className="size-[18px]" />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="line-clamp-1 font-semibold">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Hạn {formatDate(r.due)}
                        {left !== null && (left < 0 ? ` (quá ${-left} ngày)` : left === 0 ? ' (hôm nay)' : ` (còn ${left} ngày)`)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3">
            <TabLink onClick={() => onOpenTab('lifecycle')}>Mở tab Vòng đời</TabLink>
          </div>
        </Section>

        {signature.data && signature.data.length > 0 && signers.length > 0 && (
          <Section icon={ShieldCheck} title="Người ký" action={<TabLink onClick={() => onOpenTab('signature')}>Ký điện tử</TabLink>}>
            <ul className="space-y-2 text-sm">
              {signers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{s.name}</span>
                    {s.partyRole && <span className="text-xs text-muted-foreground"> · {ROLE_LABELS[s.partyRole]}</span>}
                  </span>
                  <StatusPill tone={s.status === 'SIGNED' ? 'green' : s.status === 'REJECTED' ? 'red' : 'amber'}>
                    {s.status === 'SIGNED' ? 'Đã ký' : s.status === 'REJECTED' ? 'Từ chối' : 'Chờ ký'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

/** Liên kết chuyển sang tab khác trong trang chi tiết. */
function TabLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
      {children} <ArrowRight className="size-4" />
    </button>
  );
}
