'use client';

import { CLAUSE_CATEGORIES, CLAUSE_CATEGORY_LABELS, CLAUSE_STATUS_LABELS } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { ListCard, ListState, MobileCard, SearchBox, Th, TitleCell } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { ClauseStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
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
            <Button asChild className="h-9">
              <Link href="/clauses/new">
                <Plus /> Thêm điều khoản
              </Link>
            </Button>
          )
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Tìm tiêu đề, mã, nội dung…" ariaLabel="Tìm điều khoản" />
            <FilterSelect className="h-9 w-44" allLabel="Mọi nhóm" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={CLAUSE_CATEGORIES.map((c) => ({ value: c, label: CLAUSE_CATEGORY_LABELS[c] }))} ariaLabel="Nhóm điều khoản" />
            <FilterSelect className="h-9 w-40" allLabel="Mọi trạng thái" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(Object.keys(CLAUSE_STATUS_LABELS) as ClauseStatus[]).map((s) => ({ value: s, label: CLAUSE_STATUS_LABELS[s] }))} ariaLabel="Trạng thái" />
          </>
        }
      >
        <ListState query={list} empty={{ title: 'Không có điều khoản phù hợp' }} />
        {!!list.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {list.data.items.map((c) => (
                <MobileCard key={c.id} href={`/clauses/${c.id}`} title={c.title} sub={`${c.code} · v${c.version}`} status={<ClauseStatusBadge status={c.status} />}>
                  <span className="block text-xs text-muted-foreground">
                    {CLAUSE_CATEGORY_LABELS[c.category]} · {c.createdBy.fullName} · {formatDateTime(c.updatedAt)}
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Điều khoản</Th>
                    <Th>Nhóm</Th>
                    <Th>Phiên bản</Th>
                    <Th>Trạng thái</Th>
                    <Th>Người soạn</Th>
                    <Th>Người duyệt</Th>
                    <Th>Cập nhật</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={ScrollText} href={`/clauses/${c.id}`} title={c.title} sub={c.code} />
                      </TableCell>
                      <TableCell>{CLAUSE_CATEGORY_LABELS[c.category]}</TableCell>
                      <TableCell>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">v{c.version}</span>
                      </TableCell>
                      <TableCell>
                        <ClauseStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>{c.createdBy.fullName}</TableCell>
                      <TableCell>{c.approvedBy?.fullName ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(c.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={30} unit="điều khoản" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
