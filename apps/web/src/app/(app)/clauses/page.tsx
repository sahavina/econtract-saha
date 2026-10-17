'use client';

import { CLAUSE_CATEGORIES, CLAUSE_CATEGORY_LABELS, CLAUSE_STATUS_LABELS } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { ClauseStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { Clause, ClauseStatus } from '@/lib/types';

export default function ClausesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['clauses', { q, category, status, page }],
    queryFn: () => api<Paginated<Clause>>('/clauses', { query: { q, category, status, page, pageSize: 30 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Thư viện điều khoản"
        description="Điều khoản chuẩn có phiên bản và phê duyệt. Chỉ điều khoản Đã duyệt mới chèn được vào hợp đồng, mẫu."
        crumbs={[{ label: 'Soạn thảo' }, { label: 'Thư viện điều khoản' }]}
        actions={
          can('template.manage') && (
            <Button asChild>
              <Link href="/clauses/new">
                <Plus /> Thêm điều khoản
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Tìm tiêu đề, mã, nội dung…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm điều khoản" />
        <FilterSelect allLabel="Mọi nhóm" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={CLAUSE_CATEGORIES.map((c) => ({ value: c, label: CLAUSE_CATEGORY_LABELS[c] }))} />
        <FilterSelect allLabel="Mọi trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(Object.keys(CLAUSE_STATUS_LABELS) as ClauseStatus[]).map((s) => ({ value: s, label: CLAUSE_STATUS_LABELS[s] }))} />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tiêu đề</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Phiên bản</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Người soạn</TableHead>
                <TableHead>Người duyệt</TableHead>
                <TableHead>Cập nhật</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-24" />
                  </TableCell>
                </TableRow>
              ) : !list.data.items.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-4">
                    <EmptyState title="Không có điều khoản phù hợp" />
                  </TableCell>
                </TableRow>
              ) : (
                list.data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/clauses/${c.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">
                        {c.code}
                      </Link>
                    </TableCell>
                    <TableCell>{c.title}</TableCell>
                    <TableCell>{CLAUSE_CATEGORY_LABELS[c.category]}</TableCell>
                    <TableCell>v{c.version}</TableCell>
                    <TableCell>
                      <ClauseStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell>{c.createdBy.fullName}</TableCell>
                    <TableCell>{c.approvedBy?.fullName ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(c.updatedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {list.data && list.data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </Button>
          Trang {list.data.page}/{list.data.totalPages}
          <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}
