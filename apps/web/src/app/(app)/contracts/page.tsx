'use client';

import { CONTRACT_CATEGORIES, CONTRACT_CATEGORY_LABELS, CONTRACT_CATEGORY_SHORT, type ContractCategory, CONTRACT_STATUS_LABELS, CONTRACT_STATUSES, type ContractStatus, EXPIRING_SOON_DAYS } from '@saha/shared';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  History,
  ListChecks,
  MoreHorizontal,
  RotateCcw,
  Search,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { ContractStatusBadge, contractAccentColor, contractRowAccent } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, downloadFile, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ContractListItem, DashboardSummary, MyApprovalTask } from '@/lib/types';
import { cn } from '@/lib/utils';

const VIEWS = [
  { value: 'all', label: 'Tất cả hợp đồng' },
  { value: 'mine', label: 'Hợp đồng của tôi' },
  { value: 'draft', label: 'Hợp đồng nháp' },
  { value: 'pending_approval', label: 'Chờ phê duyệt' },
  { value: 'pending_signature', label: 'Chờ ký' },
  { value: 'active', label: 'Đang hiệu lực' },
  { value: 'expiring', label: 'Sắp hết hạn' },
  { value: 'expired', label: 'Hết hiệu lực' },
  { value: 'liquidated', label: 'Đã thanh lý' },
  { value: 'archived', label: 'Đã lưu trữ' },
  { value: 'trash', label: 'Thùng rác' },
] as const;
type View = (typeof VIEWS)[number]['value'];

/** Các tab chính (kèm số lượng); nhóm còn lại nằm trong menu "Khác". */
const TABS: { value: View; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'pending_approval', label: 'Chờ phê duyệt' },
  { value: 'pending_signature', label: 'Chờ ký' },
  { value: 'active', label: 'Đang hiệu lực' },
  { value: 'expired', label: 'Hết hạn' },
];
const MORE_VIEWS = VIEWS.filter((v) => !TABS.some((t) => t.value === v.value));
/** Nhóm cần đếm: các tab chính + "Sắp hết hạn" (thẻ số liệu, cảnh báo). */
const COUNTED: View[] = ['all', 'draft', 'pending_approval', 'pending_signature', 'active', 'expired', 'expiring'];

const SORTABLE = new Set(['contract', 'value', 'createdAt', 'signedDate', 'term']);
/** Cột → trường sắp xếp của API. */
const SORT_FIELD: Record<string, string> = { contract: 'title', value: 'value', createdAt: 'createdAt', signedDate: 'signedDate', term: 'expiryDate' };
const COLUMN_STORAGE_KEY = 'saha.contracts.columns.v2';
/** Cột phụ: ẩn mặc định, bật lại trong menu "Cột". */
const DEFAULT_HIDDEN: VisibilityState = { category: false, type: false, createdAt: false, signedDate: false, approval: false, signature: false };

const APPROVAL_LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'Chưa gửi',
  PENDING: 'Đang duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CHANGES_REQUESTED: 'Yêu cầu sửa',
};
const SIGNATURE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa ký',
  IN_PROGRESS: 'Đang ký',
  COMPLETED: 'Đã ký',
  REJECTED: 'Từ chối ký',
  EXPIRED: 'Hết hạn ký',
};
/** Màu chữ theo tình trạng phê duyệt / ký (cùng hệ màu với nhãn trạng thái hợp đồng). */
const APPROVAL_TONE: Record<string, string> = {
  NOT_SUBMITTED: 'text-slate-500 dark:text-slate-400',
  PENDING: 'text-amber-700 dark:text-amber-400',
  APPROVED: 'text-sky-700 dark:text-sky-400',
  REJECTED: 'text-red-700 dark:text-red-400',
  CHANGES_REQUESTED: 'text-orange-700 dark:text-orange-400',
};
const SIGNATURE_TONE: Record<string, string> = {
  NOT_STARTED: 'text-slate-500 dark:text-slate-400',
  IN_PROGRESS: 'text-violet-700 dark:text-violet-400',
  COMPLETED: 'text-green-700 dark:text-green-400',
  REJECTED: 'text-red-700 dark:text-red-400',
  EXPIRED: 'text-orange-700 dark:text-orange-400',
};

const AVATAR_TONES = ['bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function Avatar({ name }: { name: string }) {
  const tone = AVATAR_TONES[Array.from(name).reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', tone)}>{initials(name)}</span>;
}

/** Ngày ngắn dd/mm/yy cho cột thời hạn. */
const shortDate = (d: string | null) => (d ? formatDate(d).replace(/\/(\d{2})(\d{2})$/, '/$2') : '…');

/** Danh sách số trang có dấu "…" (1 … 4 5 6 … 42). */
function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

function Kpi({ icon: Icon, label, value, tone, dot, active, onClick }: { icon: typeof FileText; label: string; value: number | undefined; tone: string; dot?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card p-3 text-left sm:gap-4 sm:p-4 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] transition-all hover:-translate-y-0.5 hover:shadow-md',
        active && 'border-primary/40 ring-2 ring-primary/15',
      )}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12', tone)}>
        <Icon className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
          {dot && <span className={cn('size-2 rounded-full', dot)} />}
          {label}
        </span>
        <span className="mt-0.5 block text-2xl leading-tight font-bold tracking-tight tabular-nums sm:text-[1.75rem]">{value ?? '–'}</span>
      </span>
    </button>
  );
}

export default function ContractsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const lookups = useLookups();

  const view = (params.get('view') ?? 'all') as View;
  const query = {
    view,
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    contractTypeId: params.get('contractTypeId') ?? undefined,
    category: params.get('category') ?? undefined,
    departmentId: params.get('departmentId') ?? undefined,
    ownerId: params.get('ownerId') ?? undefined,
    createdFrom: params.get('createdFrom') ?? undefined,
    createdTo: params.get('createdTo') ?? undefined,
    sort: params.get('sort') ?? 'createdAt',
    order: (params.get('order') ?? 'desc') as 'asc' | 'desc',
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 20),
  };

  const setParams = (patch: Record<string, string | number | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || (k === 'view' && v === 'all')) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };

  const [search, setSearch] = useState(query.q ?? '');
  useEffect(() => setSearch(params.get('q') ?? ''), [params]);
  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) setParams({ q: search.trim() || undefined });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useQuery({
    queryKey: ['contracts', query],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query }),
    placeholderData: keepPreviousData,
  });

  // Số lượng từng nhóm (theo phân loại đang xem, không theo các bộ lọc khác) – lấy tổng của trang 1 dòng.
  const countResults = useQueries({
    queries: COUNTED.map((v) => ({
      queryKey: ['contracts', 'count', v, query.category],
      queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { view: v, category: query.category, pageSize: 1 } }),
      staleTime: 30_000,
    })),
  });
  const counts = Object.fromEntries(COUNTED.map((v, i) => [v, countResults[i].data?.total])) as Partial<Record<View, number>>;

  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<MyApprovalTask[]>('/approvals/my-tasks') });
  const activity = useQuery({
    queryKey: ['dashboard', 'contracts-activity'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
    enabled: can('dashboard.view'),
    staleTime: 30_000,
  });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  useEffect(() => setRowSelection({}), [params]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      return { ...DEFAULT_HIDDEN, ...JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) ?? '{}') };
    } catch {
      return DEFAULT_HIDDEN;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch {
      /* bỏ qua khi không có localStorage */
    }
  }, [columnVisibility]);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [quickView, setQuickView] = useState<ContractListItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const action = useMutation({
    mutationFn: ({ id, op }: { id: string; op: 'archive' | 'unarchive' | 'restore' | 'delete' | 'duplicate' }) =>
      op === 'delete' ? api<undefined>(`/contracts/${id}`, { method: 'DELETE' }) : api<{ id: string }>(`/contracts/${id}/${op}`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const runBulk = async (op: 'archive' | 'delete', ids: string[]) => {
    const results = await Promise.allSettled(ids.map((id) => action.mutateAsync({ id, op })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) toast.warning(`Hoàn tất ${ids.length - failed}/${ids.length} hợp đồng; ${failed} hợp đồng không thực hiện được`);
    else toast.success(`Đã ${op === 'archive' ? 'lưu trữ' : 'chuyển vào thùng rác'} ${ids.length} hợp đồng`);
    setRowSelection({});
  };

  const rowActions = (c: ContractListItem) => {
    const items: React.ReactNode[] = [
      <DropdownMenuItem key="view" asChild>
        <Link href={`/contracts/${c.id}`}>
          <FileText /> Xem chi tiết
        </Link>
      </DropdownMenuItem>,
      <DropdownMenuItem key="quick" onSelect={() => setQuickView(c)}>
        <Eye /> Xem nhanh
      </DropdownMenuItem>,
    ];
    if (c.deletedAt) {
      if (can('contract.delete'))
        items.push(
          <DropdownMenuItem key="restore" onSelect={() => action.mutate({ id: c.id, op: 'restore' }, { onSuccess: () => toast.success('Đã khôi phục hợp đồng') })}>
            <RotateCcw /> Khôi phục
          </DropdownMenuItem>,
        );
      if (can('contract.purge') && (c.status === 'DRAFT' || c.status === 'CANCELLED'))
        items.push(
          <DropdownMenuItem
            key="purge"
            variant="destructive"
            onSelect={() =>
              setConfirm({
                title: `Xóa vĩnh viễn hợp đồng ${c.code}?`,
                description:
                  'Hợp đồng cùng các bên, tài liệu đính kèm, lịch sử phê duyệt và ký sẽ bị xóa hẳn, KHÔNG khôi phục được. Mã hợp đồng được giải phóng để dùng lại. Nhật ký hoạt động vẫn ghi lại thao tác này.',
                confirmLabel: 'Xóa vĩnh viễn',
                destructive: true,
                typeToConfirm: c.code,
                onConfirm: () =>
                  api<undefined>(`/contracts/${c.id}/permanent`, { method: 'DELETE' })
                    .then(() => {
                      invalidate();
                      toast.success(`Đã xóa vĩnh viễn hợp đồng ${c.code}`);
                    })
                    .catch((e: unknown) => void toast.error(e instanceof Error ? e.message : 'Xóa vĩnh viễn thất bại')),
              })
            }
          >
            <Trash2 /> Xóa vĩnh viễn
          </DropdownMenuItem>,
        );
      return items;
    }
    if (can('contract.create'))
      items.push(
        <DropdownMenuItem
          key="dup"
          onSelect={() =>
            action.mutate(
              { id: c.id, op: 'duplicate' },
              { onSuccess: (r) => { toast.success('Đã tạo bản sao'); if (r) router.push(`/contracts/${r.id}`); } },
            )
          }
        >
          <Copy /> Sao chép
        </DropdownMenuItem>,
      );
    if (can('contract.archive'))
      items.push(
        c.archivedAt ? (
          <DropdownMenuItem key="unarch" onSelect={() => action.mutate({ id: c.id, op: 'unarchive' }, { onSuccess: () => toast.success('Đã bỏ lưu trữ') })}>
            <ArchiveRestore /> Bỏ lưu trữ
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem key="arch" onSelect={() => action.mutate({ id: c.id, op: 'archive' }, { onSuccess: () => toast.success('Đã lưu trữ hợp đồng') })}>
            <Archive /> Lưu trữ
          </DropdownMenuItem>
        ),
      );
    if (can('contract.delete') && (c.status === 'DRAFT' || c.status === 'CANCELLED'))
      items.push(
        <DropdownMenuSeparator key="sep" />,
        <DropdownMenuItem
          key="del"
          variant="destructive"
          onSelect={() =>
            setConfirm({
              title: 'Chuyển hợp đồng vào thùng rác?',
              description: `${c.code} – ${c.title}. Có thể khôi phục từ Thùng rác.`,
              confirmLabel: 'Xóa',
              destructive: true,
              onConfirm: () => action.mutateAsync({ id: c.id, op: 'delete' }).then(() => void toast.success('Đã chuyển vào thùng rác')),
            })
          }
        >
          <Trash2 /> Xóa
        </DropdownMenuItem>,
      );
    return items;
  };

  const SortHeader = ({ id, label, className }: { id: string; label: string; className?: string }) => {
    const field = SORT_FIELD[id];
    const active = query.sort === field;
    const Icon = !active ? ArrowUpDown : query.order === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground', className)}
        onClick={() => setParams({ sort: field, order: active && query.order === 'desc' ? 'asc' : 'desc' })}
      >
        {label}
        <Icon className="size-3.5 opacity-60" />
      </button>
    );
  };

  const columns = useMemo<ColumnDef<ContractListItem>[]>(
    () => [
      {
        id: 'select',
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Chọn tất cả"
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Chọn dòng" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} />,
      },
      {
        id: 'contract',
        header: 'Hợp đồng',
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={`/contracts/${row.original.id}`} className="group flex max-w-[21rem] min-w-64 items-center gap-3 whitespace-normal">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 leading-snug font-semibold text-foreground group-hover:text-primary">{row.original.title}</span>
              <span className="block text-xs whitespace-nowrap text-muted-foreground">{row.original.code}</span>
            </span>
          </Link>
        ),
      },
      { id: 'partner', header: 'Đối tác', cell: ({ row }) => <span className="line-clamp-2 block max-w-52 min-w-36 whitespace-normal" title={row.original.parties[0]?.name}>{row.original.parties[0]?.name ?? '—'}</span> },
      { id: 'category', header: 'Phân loại', cell: ({ row }) => (row.original.category ? <Badge variant="outline" className="whitespace-nowrap">{CONTRACT_CATEGORY_SHORT[row.original.category]}</Badge> : <span className="text-muted-foreground">—</span>) },
      { id: 'type', header: 'Loại hợp đồng', cell: ({ row }) => row.original.contractType?.name ?? '—' },
      { id: 'value', header: 'Giá trị', cell: ({ row }) => <span className="block text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(row.original.value, row.original.currency)}</span> },
      {
        id: 'term',
        header: 'Thời hạn',
        cell: ({ row }) =>
          row.original.effectiveDate || row.original.expiryDate ? (
            <span className="whitespace-nowrap tabular-nums">
              {shortDate(row.original.effectiveDate)} – {shortDate(row.original.expiryDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      { id: 'createdAt', header: 'Ngày tạo', cell: ({ row }) => formatDate(row.original.createdAt) },
      { id: 'signedDate', header: 'Ngày ký', cell: ({ row }) => formatDate(row.original.signedDate) },
      {
        id: 'approval',
        header: 'Phê duyệt',
        cell: ({ row }) => <span className={cn('font-medium whitespace-nowrap', APPROVAL_TONE[row.original.approvalStatus])}>{APPROVAL_LABELS[row.original.approvalStatus]}</span>,
      },
      {
        id: 'signature',
        header: 'Ký',
        cell: ({ row }) => <span className={cn('font-medium whitespace-nowrap', SIGNATURE_TONE[row.original.signatureStatus])}>{SIGNATURE_LABELS[row.original.signatureStatus]}</span>,
      },
      { id: 'status', header: 'Trạng thái', cell: ({ row }) => <ContractStatusBadge status={row.original.status} /> },
      {
        id: 'owner',
        header: 'Phụ trách',
        cell: ({ row }) =>
          row.original.owner ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Avatar name={row.original.owner.fullName} />
              {row.original.owner.fullName}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Thao tác">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">{rowActions(row.original)}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [can],
  );

  const table = useReactTable({
    data: list.data?.items ?? [],
    columns,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: list.data?.total ?? 0,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  // Lọc theo phân loại ⇒ tiêu đề nêu rõ loại hợp đồng (vd "Hợp đồng nhà cung cấp").
  const categoryName =
    query.category === 'NONE' ? 'Hợp đồng chưa phân loại' : query.category ? CONTRACT_CATEGORY_LABELS[query.category as ContractCategory] : undefined;
  const title = categoryName ?? 'Quản lý hợp đồng';
  const moreView = MORE_VIEWS.find((v) => v.value === view);
  const data = list.data;
  const hasFilters = !!(query.q || query.status || query.contractTypeId || query.departmentId || query.ownerId || query.createdFrom || query.createdTo);
  const pendingSign = counts.pending_approval !== undefined && counts.pending_signature !== undefined ? counts.pending_approval + counts.pending_signature : undefined;

  return (
    <>
      <PageHeader
        title={title}
        description="Theo dõi, phê duyệt và quản lý toàn bộ hợp đồng doanh nghiệp"
        crumbs={[{ label: 'Không gian làm việc', href: '/' }, { label: title }]}
        actions={
          <>
            {can('contract.export') && (
              <Button variant="outline" className="h-9" onClick={() => downloadFile('/contracts/export', { ...query, page: undefined, pageSize: undefined }).catch((e: Error) => toast.error(e.message))}>
                <Download /> Xuất CSV
              </Button>
            )}
            {can('contract.create') && (
              <Button asChild className="h-9">
                <Link href="/contracts/new">
                  <FilePlus2 /> Tạo hợp đồng
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={FileText} label="Tổng hợp đồng" value={counts.all} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" active={view === 'all'} onClick={() => setParams({ view: 'all' })} />
        <Kpi icon={FileCheck2} label="Đang hiệu lực" value={counts.active} dot="bg-green-500" tone="bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300" active={view === 'active'} onClick={() => setParams({ view: 'active' })} />
        <Kpi icon={Clock} label="Chờ duyệt / chờ ký" value={pendingSign} dot="bg-amber-500" tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" active={view === 'pending_approval' || view === 'pending_signature'} onClick={() => setParams({ view: 'pending_approval' })} />
        <Kpi icon={CalendarClock} label="Sắp hết hạn" value={counts.expiring} dot="bg-orange-500" tone="bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300" active={view === 'expiring'} onClick={() => setParams({ view: 'expiring' })} />
      </div>

      {!!counts.expiring && view !== 'expiring' && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/50">
          <AlertTriangle className="size-5 shrink-0 text-amber-500" />
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            {counts.expiring} hợp đồng sắp hết hạn trong {EXPIRING_SOON_DAYS} ngày tới
          </span>
          <button type="button" onClick={() => setParams({ view: 'expiring' })} className="ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            Xem danh sách <ArrowRight className="size-4" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05)]">
        {/* Tab nhóm hợp đồng kèm số lượng */}
        <div className="flex items-end gap-1 overflow-x-auto border-b px-3 [scrollbar-width:thin]">
          {TABS.map((t) => {
            const active = view === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setParams({ view: t.value })}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  active && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary hover:text-primary',
                )}
              >
                {t.label}
                <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{counts[t.value] ?? '·'}</span>
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'relative flex shrink-0 items-center gap-1 px-3 py-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground',
                  moreView && 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
                )}
              >
                {moreView ? moreView.label : 'Khác'} <ChevronDown className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {MORE_VIEWS.map((v) => (
                <DropdownMenuItem key={v.value} onSelect={() => setParams({ view: v.value })}>
                  {v.label}
                  {counts[v.value] !== undefined && <span className="ml-auto text-xs text-muted-foreground">{counts[v.value]}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Bộ lọc */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">
          <div className="relative min-w-0 flex-1 basis-48 md:min-w-56 md:basis-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Tìm mã, tên hợp đồng, đối tác, tag…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm kiếm" />
          </div>
          {/* Điện thoại: các bộ lọc thu gọn sau nút "Bộ lọc". */}
          <Button variant={showFilters || hasFilters ? 'secondary' : 'outline'} className="h-9 md:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal /> Bộ lọc{hasFilters && <span className="size-1.5 rounded-full bg-primary" />}
          </Button>
          <div className={cn('w-full flex-wrap items-center gap-2 *:max-md:w-[calc(50%-0.25rem)] md:contents', showFilters ? 'flex' : 'hidden')}>
          <FilterSelect allLabel="Loại hợp đồng" className="h-9 w-44" value={query.contractTypeId} onChange={(v) => setParams({ contractTypeId: v })} options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} ariaLabel="Loại hợp đồng" />
          <FilterSelect allLabel="Trạng thái" className="h-9 w-40" value={query.status} onChange={(v) => setParams({ status: v })} options={CONTRACT_STATUSES.map((s) => ({ value: s, label: CONTRACT_STATUS_LABELS[s] }))} ariaLabel="Trạng thái" />
          <FilterSelect allLabel="Người phụ trách" className="h-9 w-44" value={query.ownerId} onChange={(v) => setParams({ ownerId: v })} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} ariaLabel="Người phụ trách" />
          <FilterSelect allLabel="Phòng ban" className="h-9 w-40" value={query.departmentId} onChange={(v) => setParams({ departmentId: v })} options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} ariaLabel="Phòng ban" />
          <FilterSelect allLabel="Phân loại" className="h-9 w-48" value={query.category} onChange={(v) => setParams({ category: v })} options={[...CONTRACT_CATEGORIES.map((c) => ({ value: c, label: CONTRACT_CATEGORY_LABELS[c] })), { value: 'NONE', label: 'Hợp đồng chưa phân loại' }]} ariaLabel="Phân loại hợp đồng" />
          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 shadow-xs max-md:w-full!" title="Lọc theo ngày tạo">
            <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
            <input type="date" aria-label="Từ ngày" className="min-w-0 flex-1 bg-transparent text-sm outline-none md:w-[7.4rem] md:flex-none" value={query.createdFrom ?? ''} onChange={(e) => setParams({ createdFrom: e.target.value || undefined })} />
            <span className="text-muted-foreground">–</span>
            <input type="date" aria-label="Đến ngày" className="min-w-0 flex-1 bg-transparent text-sm outline-none md:w-[7.4rem] md:flex-none" value={query.createdTo ?? ''} onChange={(e) => setParams({ createdTo: e.target.value || undefined })} />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => setParams({ q: undefined, status: undefined, contractTypeId: undefined, departmentId: undefined, ownerId: undefined, createdFrom: undefined, createdTo: undefined })}>
              Xóa lọc
            </Button>
          )}
          </div>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {selectedIds.length > 0 && view !== 'trash' && (
              <>
                <span className="text-sm text-muted-foreground">Đã chọn {selectedIds.length}</span>
                {can('contract.archive') && view !== 'archived' && (
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ title: `Lưu trữ ${selectedIds.length} hợp đồng?`, onConfirm: () => runBulk('archive', selectedIds) })}>
                    <Archive /> Lưu trữ
                  </Button>
                )}
                {can('contract.delete') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      setConfirm({
                        title: `Xóa ${selectedIds.length} hợp đồng?`,
                        description: 'Chỉ hợp đồng Nháp hoặc Đã hủy được chuyển vào thùng rác; hợp đồng khác sẽ bị bỏ qua.',
                        destructive: true,
                        confirmLabel: 'Xóa',
                        onConfirm: () => runBulk('delete', selectedIds),
                      })
                    }
                  >
                    <Trash2 /> Xóa
                  </Button>
                )}
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Columns3 /> Cột
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Hiển thị cột</DropdownMenuLabel>
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                      {String(c.columnDef.header)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {list.isError ? (
          <div className="p-4">
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : (
          <>
          {/* Điện thoại: mỗi hợp đồng một thẻ */}
          <ul className="divide-y md:hidden">
            {list.isPending ? (
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="p-3">
                  <Skeleton className="h-20" />
                </li>
              ))
            ) : !list.data?.items.length ? (
              <li className="p-3">
                <EmptyState title="Không có hợp đồng phù hợp" description={query.q ? `Không tìm thấy kết quả cho "${query.q}".` : 'Thử đổi bộ lọc hoặc tạo hợp đồng mới.'} />
              </li>
            ) : (
              list.data.items.map((c) => (
                <li key={c.id} style={{ boxShadow: `inset 4px 0 0 ${contractAccentColor(c.status)}` }}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Link href={`/contracts/${c.id}`} className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="line-clamp-2 leading-snug font-semibold">{c.title}</span>
                          <span className="block text-xs text-muted-foreground">{c.code}</span>
                        </span>
                        <ContractStatusBadge status={c.status} className="shrink-0" />
                      </span>
                      {c.parties[0]?.name && <span className="line-clamp-1 block text-sm text-muted-foreground">{c.parties[0].name}</span>}
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-semibold tabular-nums">{formatMoney(c.value, c.currency)}</span>
                        {(c.effectiveDate || c.expiryDate) && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {shortDate(c.effectiveDate)} – {shortDate(c.expiryDate)}
                          </span>
                        )}
                        {c.owner && (
                          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Avatar name={c.owner.fullName} /> {c.owner.fullName}
                          </span>
                        )}
                      </span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Thao tác" className="-mr-2">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">{rowActions(c)}</DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className={cn('h-11 normal-case tracking-normal text-[13px] text-foreground/80', h.column.id === 'value' && 'text-right', h.column.id === 'select' && 'w-10 pl-4')}>
                      {SORTABLE.has(h.column.id) && typeof h.column.columnDef.header === 'string' ? (
                        <SortHeader id={h.column.id} label={h.column.columnDef.header} className={h.column.id === 'value' ? 'justify-end' : undefined} />
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={table.getVisibleLeafColumns().length}>
                      <Skeleton className="h-9" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-4">
                    <EmptyState
                      title="Không có hợp đồng phù hợp"
                      description={query.q ? `Không tìm thấy kết quả cho "${query.q}".` : 'Thử đổi bộ lọc hoặc tạo hợp đồng mới.'}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'} className={contractRowAccent(row.original.status)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cell.column.id === 'select' ? 'pl-4' : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
          </>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Hiển thị {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} trong {data.total} hợp đồng
            </span>
            <div className="flex items-center gap-1.5">
              <FilterSelect
                allLabel="20 / trang"
                className="mr-2 h-8 w-32"
                value={query.pageSize === 20 ? undefined : String(query.pageSize)}
                onChange={(v) => setParams({ pageSize: v })}
                options={[{ value: '50', label: '50 / trang' }, { value: '100', label: '100 / trang' }]}
                ariaLabel="Số dòng mỗi trang"
              />
              <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => setParams({ page: data.page - 1 }, false)}>
                <ChevronLeft />
              </Button>
              {pageList(data.page, data.totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="px-1">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === data.page ? 'default' : 'outline'}
                    size="icon-sm"
                    aria-label={`Trang ${p}`}
                    aria-current={p === data.page ? 'page' : undefined}
                    onClick={() => setParams({ page: p }, false)}
                    className="min-w-8 px-2 tabular-nums"
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={data.page >= data.totalPages} onClick={() => setParams({ page: data.page + 1 }, false)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Công việc cần xử lý & hoạt động gần đây */}
      <div className={cn('mt-4 grid gap-4', can('dashboard.view') && 'lg:grid-cols-2')}>
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between border-b py-3.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-5 text-primary" /> Công việc cần xử lý {tasks.data && `(${tasks.data.length})`}
            </CardTitle>
            <Link href="/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Xem tất cả <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            {!tasks.data ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : tasks.data.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-green-600" /> Không có hợp đồng nào chờ bạn phê duyệt.
              </p>
            ) : (
              <ul className="divide-y">
                {tasks.data.slice(0, 4).map((t) => (
                  <li key={t.id}>
                    <Link href={`/contracts/${t.request.contract.id}?tab=approval`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-sm">
                          Phê duyệt hợp đồng <span className="font-semibold">{t.request.contract.title}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t.request.contract.code} · {t.stepName}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">Chờ phê duyệt</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {can('dashboard.view') && (
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b py-3.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-5 text-primary" /> Hoạt động gần đây
              </CardTitle>
              {can('audit.view') && (
                <Link href="/audit-logs" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Xem tất cả <ArrowRight className="size-4" />
                </Link>
              )}
            </CardHeader>
            <CardContent className="px-0">
              {!activity.data ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : activity.data.recentActivity.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">Chưa có hoạt động.</p>
              ) : (
                <ul className="divide-y">
                  {activity.data.recentActivity.slice(0, 4).map((a) => {
                    const code = (a.data as { code?: string } | null)?.code;
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <History className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-sm">
                            {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                            {code &&
                              (a.entityId ? (
                                <>
                                  {' '}
                                  <Link href={`/contracts/${a.entityId}`} className="font-semibold hover:text-primary hover:underline">
                                    {code}
                                  </Link>
                                </>
                              ) : (
                                <span className="font-semibold"> {code}</span>
                              ))}
                          </span>
                          <span className="block text-xs text-muted-foreground">Bởi {a.actorName ?? 'Hệ thống'}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={!!quickView} onOpenChange={(o) => !o && setQuickView(null)}>
        <SheetContent className="data-[side=right]:sm:max-w-md">
          {quickView && (
            <>
              <SheetHeader>
                <SheetTitle>{quickView.title}</SheetTitle>
                <SheetDescription>{quickView.code}</SheetDescription>
              </SheetHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 text-sm">
                <dt className="text-muted-foreground">Trạng thái</dt>
                <dd><ContractStatusBadge status={quickView.status as ContractStatus} /></dd>
                <dt className="text-muted-foreground">Loại</dt>
                <dd>{quickView.contractType?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">Đối tác</dt>
                <dd>{quickView.parties[0]?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">Giá trị</dt>
                <dd>{formatMoney(quickView.value, quickView.currency)}</dd>
                <dt className="text-muted-foreground">Phụ trách</dt>
                <dd>{quickView.owner?.fullName ?? '—'}</dd>
                <dt className="text-muted-foreground">Phòng ban</dt>
                <dd>{quickView.department?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">Hiệu lực</dt>
                <dd>{formatDate(quickView.effectiveDate)} → {formatDate(quickView.expiryDate)}</dd>
              </dl>
              <div className="px-4">
                <Button asChild className="w-full">
                  <Link href={`/contracts/${quickView.id}`}>Mở chi tiết</Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
