'use client';

import { CONTRACT_STATUS_LABELS, CONTRACT_STATUSES, type ContractStatus } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  Eye,
  FilePlus2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { ContractStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
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
import { formatDate, formatMoney } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ContractListItem } from '@/lib/types';

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

const SORTABLE = new Set(['code', 'title', 'value', 'createdAt', 'signedDate', 'effectiveDate', 'expiryDate']);
const COLUMN_STORAGE_KEY = 'saha.contracts.columns';

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
    departmentId: params.get('departmentId') ?? undefined,
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

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  useEffect(() => setRowSelection({}), [params]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) ?? '{}');
    } catch {
      return {};
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
          <Eye /> Xem chi tiết
        </Link>
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

  const SortHeader = ({ id, label }: { id: string; label: string }) => {
    const active = query.sort === id;
    const Icon = !active ? ArrowUpDown : query.order === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setParams({ sort: id, order: active && query.order === 'desc' ? 'asc' : 'desc' })}
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
      { id: 'code', header: 'Mã hợp đồng', enableHiding: false, cell: ({ row }) => <Link href={`/contracts/${row.original.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">{row.original.code}</Link> },
      { id: 'title', header: 'Tên hợp đồng', enableHiding: false, cell: ({ row }) => <span className="line-clamp-2 min-w-48">{row.original.title}</span> },
      { id: 'type', header: 'Loại hợp đồng', cell: ({ row }) => row.original.contractType?.name ?? '—' },
      { id: 'partner', header: 'Đối tác', cell: ({ row }) => row.original.parties[0]?.name ?? '—' },
      { id: 'value', header: 'Giá trị', cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatMoney(row.original.value, row.original.currency)}</span> },
      { id: 'owner', header: 'Người phụ trách', cell: ({ row }) => row.original.owner?.fullName ?? '—' },
      { id: 'createdAt', header: 'Ngày tạo', cell: ({ row }) => formatDate(row.original.createdAt) },
      { id: 'signedDate', header: 'Ngày ký', cell: ({ row }) => formatDate(row.original.signedDate) },
      { id: 'effectiveDate', header: 'Ngày hiệu lực', cell: ({ row }) => formatDate(row.original.effectiveDate) },
      { id: 'expiryDate', header: 'Ngày hết hạn', cell: ({ row }) => formatDate(row.original.expiryDate) },
      { id: 'approval', header: 'Phê duyệt', cell: ({ row }) => APPROVAL_LABELS[row.original.approvalStatus] },
      { id: 'signature', header: 'Ký', cell: ({ row }) => SIGNATURE_LABELS[row.original.signatureStatus] },
      { id: 'status', header: 'Trạng thái', cell: ({ row }) => <ContractStatusBadge status={row.original.status} /> },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Xem nhanh" onClick={() => setQuickView(row.original)}>
              <Eye />
            </Button>
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
  const viewLabel = VIEWS.find((v) => v.value === view)?.label ?? 'Hợp đồng';
  const data = list.data;

  return (
    <>
      <PageHeader
        title={viewLabel}
        crumbs={[{ label: 'Quản lý hợp đồng', href: '/contracts' }, { label: viewLabel }]}
        actions={
          <>
            {can('contract.export') && (
              <Button variant="outline" onClick={() => downloadFile('/contracts/export', { ...query, page: undefined, pageSize: undefined }).catch((e: Error) => toast.error(e.message))}>
                <Download /> Xuất CSV
              </Button>
            )}
            {can('contract.create') && (
              <Button asChild>
                <Link href="/contracts/new">
                  <FilePlus2 /> Tạo hợp đồng
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect allLabel="Tất cả hợp đồng" className="w-48" value={view === 'all' ? undefined : view} onChange={(v) => setParams({ view: v })} options={VIEWS.filter((v) => v.value !== 'all').map((v) => ({ value: v.value, label: v.label }))} ariaLabel="Nhóm hợp đồng" />
        <Input className="w-64" placeholder="Tìm mã, tên, đối tác, tag…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm kiếm" />
        <FilterSelect allLabel="Mọi trạng thái" value={query.status} onChange={(v) => setParams({ status: v })} options={CONTRACT_STATUSES.map((s) => ({ value: s, label: CONTRACT_STATUS_LABELS[s] }))} />
        <FilterSelect allLabel="Mọi loại HĐ" value={query.contractTypeId} onChange={(v) => setParams({ contractTypeId: v })} options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <FilterSelect allLabel="Mọi phòng ban" value={query.departmentId} onChange={(v) => setParams({ departmentId: v })} options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <div className="ml-auto flex items-center gap-2">
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
              <Button variant="outline" size="sm">
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
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="whitespace-nowrap">
                      {SORTABLE.has(h.column.id) && typeof h.column.columnDef.header === 'string' ? (
                        <SortHeader id={h.column.id} label={h.column.columnDef.header} />
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
                      <Skeleton className="h-6" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-4">
                    <EmptyState
                      title="Không có hợp đồng phù hợp"
                      description={query.q ? `Không tìm thấy kết quả cho "${query.q}".` : 'Thử đổi bộ lọc hoặc tạo hợp đồng mới.'}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} / {data.total} hợp đồng
          </span>
          <div className="flex items-center gap-2">
            <FilterSelect
              allLabel="20 / trang"
              className="w-32"
              value={query.pageSize === 20 ? undefined : String(query.pageSize)}
              onChange={(v) => setParams({ pageSize: v })}
              options={[{ value: '50', label: '50 / trang' }, { value: '100', label: '100 / trang' }]}
              ariaLabel="Số dòng mỗi trang"
            />
            <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => setParams({ page: data.page - 1 }, false)}>
              <ChevronLeft />
            </Button>
            <span>
              Trang {data.page}/{data.totalPages}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={data.page >= data.totalPages} onClick={() => setParams({ page: data.page + 1 }, false)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

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
