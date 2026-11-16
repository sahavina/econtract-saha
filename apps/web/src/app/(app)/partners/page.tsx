'use client';

import { PARTNER_TYPE_LABELS, type PartnerType } from '@saha/shared';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  CloudDownload,
  Eye,
  FilePlus2,
  FileText,
  IdCard,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { InitialsAvatar, ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, type Tone } from '@/components/list-ui';
import { OdooPartnerDialog } from '@/components/odoo-partner-dialog';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { PartnerDialog } from '@/components/partner-dialog';
import { ContractStatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { isOdooPartner, odooReady, useOdooConfig } from '@/lib/odoo';
import { useLookups } from '@/lib/queries';
import type { ContractListItem, Partner, PartnerCooperation } from '@/lib/types';
import { cn } from '@/lib/utils';

const TYPE_TONE: Record<PartnerType, Tone> = { CUSTOMER: 'sky', SUPPLIER: 'violet', BOTH: 'teal', OTHER: 'gray' };
const TABS: { value: PartnerType | undefined; label: string }[] = [
  { value: undefined, label: 'Tất cả' },
  { value: 'CUSTOMER', label: 'Khách hàng' },
  { value: 'SUPPLIER', label: 'Nhà cung cấp' },
  { value: 'BOTH', label: 'KH & NCC' },
  { value: 'OTHER', label: 'Khác' },
];
/** Tình trạng hợp tác (suy ra từ hợp đồng người dùng được xem). */
const COOPERATION: Record<PartnerCooperation, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Đang hợp tác', tone: 'green' },
  NEGOTIATING: { label: 'Đang đàm phán', tone: 'amber' },
  ENDED: { label: 'Đã kết thúc', tone: 'gray' },
  NONE: { label: 'Chưa có hợp đồng', tone: 'gray' },
};
const contractCountOf = (p: Partner) => p.contractCount ?? p._count?.contractParties ?? 0;
const AVATAR_TONES = ['bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];

/** Chữ viết tắt tên công ty: bỏ "Công ty", "TNHH", "Cổ phần"… lấy 2 chữ đầu của tên riêng. */
function partnerInitials(name: string) {
  const words = name
    .replace(/\b(công ty|cty|tnhh|cổ phần|cp|mtv|một thành viên|thương mại|dịch vụ|tm|dv|và)\b/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const pick = words.length >= 2 ? words[words.length - 2][0] + words[words.length - 1][0] : (words[0] ?? name).slice(0, 2);
  return pick.toUpperCase();
}
function PartnerAvatar({ name, className }: { name: string; className?: string }) {
  const tone = AVATAR_TONES[Array.from(name).reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold', tone, className)}>{partnerInitials(name)}</span>;
}

/** Màn hình rộng (≥ 1280px): bảng chi tiết đặt cạnh danh sách; hẹp hơn thì mở dạng ngăn trượt. */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(min-width: 1280px)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 1280px)').matches,
    () => true,
  );
}

function Kpi({ icon: Icon, label, value, tone, active, onClick }: { icon: typeof Users; label: string; value: number | undefined; tone: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-4 sm:p-4', active && 'border-primary/40 ring-2 ring-primary/15')}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-5 sm:size-6" />
      </span>
      <span>
        <span className="block text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className="block text-2xl leading-tight font-bold tabular-nums sm:text-[1.75rem]">{value ?? '–'}</span>
      </span>
    </button>
  );
}

/** Thông tin một đối tác + hợp đồng liên quan (bảng bên phải / ngăn trượt). */
function PartnerPanel({ partner: p, onClose, onEdit, canCreate }: { partner: Partner; onClose: () => void; onEdit?: () => void; canCreate: boolean }) {
  const contracts = useQuery({
    queryKey: ['contracts', 'by-partner-panel', p.id],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { partnerId: p.id, pageSize: 3 } }),
  });
  const rows: { icon: typeof Users; label: string; value: React.ReactNode }[] = [
    { icon: IdCard, label: 'Mã số thuế', value: p.taxCode },
    { icon: UserCheck, label: 'Người phụ trách', value: p.owner?.fullName },
    { icon: User, label: 'Người đại diện', value: p.representative && `${p.representative}${p.position ? ` · ${p.position}` : ''}` },
    { icon: Mail, label: 'Email', value: p.email },
    { icon: Phone, label: 'Điện thoại', value: p.phone },
    { icon: MapPin, label: 'Địa chỉ', value: p.address },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-2 border-b p-5">
        <div className="flex min-w-0 items-start gap-3">
          <PartnerAvatar name={p.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <p className="text-lg leading-snug font-semibold">{p.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusPill tone={TYPE_TONE[p.type]}>{PARTNER_TYPE_LABELS[p.type]}</StatusPill>
              {p.cooperation && <StatusPill tone={COOPERATION[p.cooperation].tone}>{COOPERATION[p.cooperation].label}</StatusPill>}
              <span className="text-xs text-muted-foreground">{p.code}</span>
              {isOdooPartner(p) && (
                <Badge variant="outline" className="text-[10px]">
                  Odoo
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Đóng" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {p.totalValue !== undefined && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Tổng giá trị hợp đồng</p>
              <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(p.totalValue)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Số hợp đồng</p>
              <p className="mt-0.5 font-semibold tabular-nums">{contractCountOf(p)}</p>
            </div>
          </div>
        )}
        <dl className="space-y-3 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[1.25rem_7rem_1fr] items-start gap-2">
              <r.icon className="mt-0.5 size-4 text-muted-foreground" />
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 font-medium break-words">{r.value || '—'}</dd>
            </div>
          ))}
        </dl>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold">
              Hợp đồng liên quan <span className="font-normal text-muted-foreground">({contracts.data?.total ?? p._count?.contractParties ?? 0})</span>
            </p>
            <Link href={`/partners/${p.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Xem tất cả <ArrowRight className="size-4" />
            </Link>
          </div>
          {!contracts.data ? (
            <Skeleton className="h-24" />
          ) : contracts.data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa có hợp đồng với đối tác này.</p>
          ) : (
            <ul className="space-y-2">
              {contracts.data.items.map((c) => (
                <li key={c.id}>
                  <Link href={`/contracts/${c.id}`} className="flex items-start gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold">{c.code}</span>
                        <span className="text-sm font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.value, c.currency)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="line-clamp-1 text-xs text-muted-foreground">{c.title}</span>
                        <ContractStatusBadge status={c.status} className="shrink-0" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t p-4">
        <Button variant="outline" asChild>
          <Link href={`/partners/${p.id}`}>
            <Eye /> Xem hồ sơ
          </Link>
        </Button>
        {canCreate ? (
          <Button asChild>
            <Link href={`/contracts/new?partner=${p.id}`}>
              <FilePlus2 /> Tạo hợp đồng
            </Link>
          </Button>
        ) : (
          onEdit && (
            <Button onClick={onEdit}>
              <Pencil /> Sửa thông tin
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export default function PartnersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const wide = useWide();
  const type = (params.get('type') ?? undefined) as PartnerType | undefined;
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [paging, setPaging] = useState({ type, page: 1 });
  // Trang reset về 1 khi đổi phân loại (kể cả qua menu sidebar).
  const page = paging.type === type ? paging.page : 1;
  const setPage = (p: number) => setPaging({ type, page: p });
  const [dialog, setDialog] = useState<{ partner?: Partner } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [odooOpen, setOdooOpen] = useState(false);
  /** Đối tác đang ánh xạ với Odoo (mở hộp thoại tìm trên Odoo). */
  const [linking, setLinking] = useState<Partner | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const users = useLookups().data?.users ?? [];
  const odoo = useOdooConfig();
  const setType = (v: PartnerType | undefined) => router.replace(v ? `${pathname}?type=${v}` : pathname);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useQuery({
    queryKey: ['partners', { type, q: debounced, ownerId, page }],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { type, q: debounced, ownerId, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  // Số đối tác theo từng phân loại (thẻ số liệu, tab).
  const countResults = useQueries({
    queries: TABS.map((t) => ({
      queryKey: ['partners', 'count', t.value ?? 'ALL'],
      queryFn: () => api<Paginated<Partner>>('/partners', { query: { type: t.value, pageSize: 1 } }),
      staleTime: 30_000,
    })),
  });
  const counts = Object.fromEntries(TABS.map((t, i) => [t.value ?? 'ALL', countResults[i].data?.total])) as Record<string, number | undefined>;
  const others = counts.BOTH !== undefined && counts.OTHER !== undefined ? counts.BOTH + counts.OTHER : undefined;

  const syncOdoo = useMutation({
    mutationFn: (id: string) => api<Partner>(`/integrations/odoo/partners/${id}/sync`, { method: 'POST' }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success(`Đã cập nhật ${p.code} từ Odoo`);
    },
  });

  /** Ánh xạ tự động theo MST các đối tác chưa liên kết Odoo. */
  const autoLink = useMutation({
    mutationFn: () =>
      api<{ linked: { code: string; odooName: string }[]; ambiguous: string[]; notFound: string[]; failed: { code: string; error: string }[] }>(
        '/integrations/odoo/partners/auto-link',
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      const lines = [
        r.linked.length ? `Đã ánh xạ: ${r.linked.map((x) => `${x.code} → ${x.odooName}`).join('; ')}` : '',
        r.ambiguous.length ? `Nhiều kết quả trùng MST (ánh xạ tay): ${r.ambiguous.join(', ')}` : '',
        r.notFound.length ? `Không thấy trên Odoo: ${r.notFound.join(', ')}` : '',
        r.failed.length ? `Lỗi: ${r.failed.map((x) => `${x.code} (${x.error})`).join('; ')}` : '',
      ].filter(Boolean);
      const fn = r.linked.length ? toast.success : toast.info;
      fn(r.linked.length ? `Đã ánh xạ ${r.linked.length} đối tác với Odoo` : 'Không có đối tác nào ánh xạ được theo MST', {
        description: lines.join('\n') || 'Mọi đối tác có MST đều đã liên kết Odoo.',
        duration: 15_000,
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/partners/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      if (selectedId === id) setSelectedId(null);
      toast.success('Đã xóa đối tác');
    },
  });

  /** Menu "…" trên một đối tác. */
  const partnerMenu = (p: Partner) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${p.name}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/partners/${p.id}`}>
            <Eye /> Xem hồ sơ
          </Link>
        </DropdownMenuItem>
        {can('contract.create') && (
          <DropdownMenuItem asChild>
            <Link href={`/contracts/new?partner=${p.id}`}>
              <FilePlus2 /> Tạo hợp đồng
            </Link>
          </DropdownMenuItem>
        )}
        {can('partner.manage') && (
          <>
            <DropdownMenuItem onSelect={() => setDialog({ partner: p })}>
              <Pencil /> Sửa thông tin
            </DropdownMenuItem>
            {isOdooPartner(p) && odooReady(odoo.data) && (
              <DropdownMenuItem disabled={syncOdoo.isPending} onSelect={() => syncOdoo.mutate(p.id)}>
                <RefreshCw /> Cập nhật từ Odoo
              </DropdownMenuItem>
            )}
            {!isOdooPartner(p) && odooReady(odoo.data) && (
              <DropdownMenuItem onSelect={() => setLinking(p)}>
                <Link2 /> Ánh xạ với Odoo
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                setConfirm({ title: `Xóa đối tác ${p.name}?`, description: 'Hợp đồng đã tạo vẫn giữ thông tin các bên.', destructive: true, confirmLabel: 'Xóa', onConfirm: () => remove.mutateAsync(p.id).then(() => undefined) })
              }
            >
              <Trash2 /> Xóa
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const data = list.data;
  const selected = data?.items.find((p) => p.id === selectedId) ?? null;
  /** Bảng bên phải đang mở cạnh danh sách ⇒ bỏ bớt cột cho vừa. */
  const compact = !!selected && wide;
  const panel = selected && (
    <PartnerPanel
      key={selected.id}
      partner={selected}
      onClose={() => setSelectedId(null)}
      onEdit={can('partner.manage') ? () => setDialog({ partner: selected }) : undefined}
      canCreate={can('contract.create')}
    />
  );

  return (
    <>
      <PageHeader
        title="Quản lý đối tác"
        description="Quản lý thông tin đối tác, phân loại và theo dõi hợp đồng với từng đối tác"
        crumbs={[{ label: 'Đối tác', href: '/partners' }, { label: 'Quản lý đối tác' }]}
        actions={
          can('partner.manage') && (
            <>
              {odooReady(odoo.data) && (
                <>
                  <Button variant="outline" className="h-9" disabled={autoLink.isPending} onClick={() => autoLink.mutate()} title="Liên kết các đối tác chưa ánh xạ với đối tác Odoo trùng mã số thuế">
                    {autoLink.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Ánh xạ Odoo theo MST
                  </Button>
                  <Button variant="outline" className="h-9" onClick={() => setOdooOpen(true)}>
                    <CloudDownload /> Nhập từ Odoo
                  </Button>
                </>
              )}
              <Button className="h-9" onClick={() => setDialog({})}>
                <Plus /> Thêm đối tác
              </Button>
            </>
          )
        }
      />

      <div className={cn('grid gap-4', selected && wide && 'xl:grid-cols-[minmax(0,1fr)_24rem]')}>
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Users} label="Tổng đối tác" value={counts.ALL} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" active={!type} onClick={() => setType(undefined)} />
            <Kpi icon={Users} label="Khách hàng" value={counts.CUSTOMER} tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" active={type === 'CUSTOMER'} onClick={() => setType('CUSTOMER')} />
            <Kpi icon={Truck} label="Nhà cung cấp" value={counts.SUPPLIER} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" active={type === 'SUPPLIER'} onClick={() => setType('SUPPLIER')} />
            <Kpi icon={Building2} label="Đối tác khác" value={others} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" active={type === 'BOTH' || type === 'OTHER'} onClick={() => setType('OTHER')} />
          </div>

          <ListCard>
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">
              <SearchBox value={search} onChange={setSearch} placeholder="Tìm đối tác theo tên, mã, mã số thuế, email…" ariaLabel="Tìm đối tác" />
              <FilterSelect
                value={ownerId}
                onChange={(v) => {
                  setOwnerId(v);
                  setPage(1);
                }}
                options={users.map((u) => ({ value: u.id, label: u.fullName }))}
                allLabel="Tất cả người phụ trách"
                ariaLabel="Lọc theo người phụ trách"
                className="w-full sm:w-56"
              />
            </div>
            <div className="flex items-end gap-1 overflow-x-auto border-b px-3 [scrollbar-width:thin]">
              {TABS.map((t) => {
                const active = type === t.value;
                const n = counts[t.value ?? 'ALL'];
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      'relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                      active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
                    )}
                  >
                    {t.label}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{n ?? '·'}</span>
                  </button>
                );
              })}
            </div>

            <ListState query={list} empty={{ title: 'Chưa có đối tác', description: 'Thêm khách hàng, nhà cung cấp để dùng khi tạo hợp đồng.' }} />
            {!!data?.items.length && (
              <>
                <ul className="divide-y md:hidden">
                  {data.items.map((p) => (
                    <MobileCard
                      key={p.id}
                      href={`/partners/${p.id}`}
                      title={p.name}
                      sub={[p.code, p.taxCode && `MST ${p.taxCode}`].filter(Boolean).join(' · ')}
                      status={p.cooperation ? <StatusPill tone={COOPERATION[p.cooperation].tone}>{COOPERATION[p.cooperation].label}</StatusPill> : <StatusPill tone={TYPE_TONE[p.type]}>{PARTNER_TYPE_LABELS[p.type]}</StatusPill>}
                      actions={partnerMenu(p)}
                    >
                      <span className="block text-xs text-muted-foreground">
                        {[p.representative, p.phone, p.email].filter(Boolean).join(' · ') || '—'} · {contractCountOf(p)} hợp đồng
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {PARTNER_TYPE_LABELS[p.type]} · <span className="font-medium text-foreground tabular-nums">{formatMoney(p.totalValue ?? '0')}</span>
                        {p.owner && <> · Phụ trách: {p.owner.fullName}</>}
                      </span>
                    </MobileCard>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <Th className="pl-4">Tên đối tác</Th>
                        <Th className={cn(compact && 'hidden')}>Người liên hệ</Th>
                        <Th className={cn('hidden', !compact && '2xl:table-cell')}>Email / Điện thoại</Th>
                        <Th>Phân loại</Th>
                        <Th className="text-right">Tổng giá trị</Th>
                        <Th>Trạng thái hợp tác</Th>
                        <Th className={cn(compact && 'hidden')}>Người phụ trách</Th>
                        <Th className="text-right">Thao tác</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((p) => (
                        <TableRow
                          key={p.id}
                          data-state={p.id === selectedId ? 'selected' : undefined}
                          className="cursor-pointer data-[state=selected]:bg-primary/[0.06]"
                          onClick={() => {
                            // Đang bôi đen để sao chép (MST, tên…) thì không mở.
                            if (!window.getSelection()?.toString()) setSelectedId(p.id === selectedId ? null : p.id);
                          }}
                        >
                          <TableCell className="pl-4">
                            <span className="flex max-w-[20rem] min-w-52 items-center gap-3 whitespace-normal">
                              <PartnerAvatar name={p.name} />
                              <span className="min-w-0">
                                <Link href={`/partners/${p.id}`} onClick={(e) => e.stopPropagation()} className="line-clamp-2 leading-snug font-semibold hover:text-primary">
                                  {p.name}
                                </Link>
                                <span className="block text-xs text-muted-foreground">
                                  {p.taxCode ? `MST: ${p.taxCode}` : p.code}
                                  {isOdooPartner(p) && <span className="ml-1.5 rounded border px-1 text-[10px]">Odoo</span>}
                                </span>
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className={cn(compact && 'hidden')}>
                            <span className="block font-medium">{p.representative ?? '—'}</span>
                            {p.position && <span className="block text-xs text-muted-foreground">{p.position}</span>}
                          </TableCell>
                          <TableCell className={cn('hidden text-sm', !compact && '2xl:table-cell')}>
                            {p.email && (
                              <span className="flex items-center gap-1.5">
                                <Mail className="size-3.5 text-muted-foreground" /> {p.email}
                              </span>
                            )}
                            {p.phone && (
                              <span className="flex items-center gap-1.5">
                                <Phone className="size-3.5 text-muted-foreground" /> {p.phone}
                              </span>
                            )}
                            {!p.phone && !p.email && <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <StatusPill tone={TYPE_TONE[p.type]}>{PARTNER_TYPE_LABELS[p.type]}</StatusPill>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <span className="block font-semibold tabular-nums">{formatMoney(p.totalValue ?? '0')}</span>
                            <span className="block text-xs text-muted-foreground">{contractCountOf(p)} hợp đồng</span>
                          </TableCell>
                          <TableCell>{p.cooperation && <StatusPill tone={COOPERATION[p.cooperation].tone}>{COOPERATION[p.cooperation].label}</StatusPill>}</TableCell>
                          <TableCell className={cn(compact && 'hidden')}>
                            {p.owner ? (
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <InitialsAvatar name={p.owner.fullName} className="size-7 text-[10px]" />
                                <span className="text-sm font-medium">{p.owner.fullName}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {partnerMenu(p)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pager className="mt-0 border-t px-4 py-3" page={data.page} totalPages={data.totalPages} total={data.total} pageSize={20} unit="đối tác" onPage={setPage} />
              </>
            )}
          </ListCard>
        </div>

        {selected && wide && (
          <aside className="hidden xl:block">
            <div className="sticky top-20 flex max-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">{panel}</div>
          </aside>
        )}
      </div>

      <Sheet open={!!selected && !wide} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-md [&>button:last-child]:hidden">
          <SheetTitle className="sr-only">{selected?.name ?? 'Đối tác'}</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>

      <PartnerDialog open={!!dialog} partner={dialog?.partner} defaultType={type} onClose={() => setDialog(null)} />
      {linking && (
        <OdooPartnerDialog
          key={linking.id}
          open
          onOpenChange={(o) => !o && setLinking(null)}
          mode="link"
          linkPartner={{ id: linking.id, code: linking.code }}
          initialQuery={linking.taxCode || linking.name}
        />
      )}
      <OdooPartnerDialog open={odooOpen} onOpenChange={setOdooOpen} mode="import" defaultKind={type === 'CUSTOMER' || type === 'SUPPLIER' ? type : undefined} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
