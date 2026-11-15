'use client';

import { formatQtyVi, SHIPPING_NOTE_STATUS_LABELS, SHIPPING_NOTE_STATUSES, type ShippingNoteStatus } from '@saha/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FilterSelect } from '@/components/filter-select';
import { DateRange, ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { ShippingNoteListItem } from '@/lib/types';

const STATUS_TONE: Record<ShippingNoteStatus, Tone> = {
  DRAFT: 'gray',
  SENT: 'sky',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

/** Danh sách phiếu gửi hàng đã lưu: tìm theo người nhận, chành xe, mã vận đơn; lọc trạng thái và ngày gửi. */
export default function ShippingLabelsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const notes = useQuery({
    queryKey: ['shipping-notes', q, status, from, to, page],
    queryFn: () => api<Paginated<ShippingNoteListItem>>('/shipping-notes', { query: { q, status, from, to, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const freight = (n: ShippingNoteListItem) => (n.freight ? `${formatQtyVi(String(Math.round(Number(n.freight))))} đ` : '—');
  const when = (n: ShippingNoteListItem) => (n.deliveredAt ? `giao ${formatDate(n.deliveredAt)}` : n.sentAt ? `gửi ${formatDate(n.sentAt)}` : null);

  return (
    <>
      <PageHeader
        title="Phiếu gửi hàng"
        description="Phiếu dán thùng gửi chành xe đã lưu: in lại, theo dõi chành xe, mã vận đơn, cước và trạng thái giao"
        crumbs={[{ label: 'Đơn đặt hàng', href: '/orders' }, { label: 'Phiếu gửi hàng' }]}
        actions={
          <Button asChild className="h-9">
            <Link href="/shipping-labels/new">
              <Truck /> Tạo phiếu gửi hàng
            </Link>
          </Button>
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={q} onChange={reset(setQ)} placeholder="Tìm số phiếu, người nhận, chành xe, mã vận đơn…" ariaLabel="Tìm phiếu gửi hàng" />
            <FilterSelect className="h-9 w-40" allLabel="Mọi trạng thái" value={status} onChange={reset(setStatus)} options={SHIPPING_NOTE_STATUSES.map((s) => ({ value: s, label: SHIPPING_NOTE_STATUS_LABELS[s] }))} ariaLabel="Trạng thái" />
            <DateRange from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)} title="Lọc theo ngày gửi" />
          </>
        }
      >
        <ListState
          query={notes}
          empty={{
            title: 'Chưa có phiếu gửi hàng đã lưu',
            description: can('delivery.manage') ? 'Bấm “Tạo phiếu gửi hàng”, hoặc tạo từ đơn đặt hàng / phiếu xuất kho rồi bấm “Lưu phiếu”.' : undefined,
          }}
        />
        {!!notes.data?.items.length && (
          <>
            <ul className="divide-y md:hidden">
              {notes.data.items.map((n) => (
                <MobileCard
                  key={n.id}
                  href={`/shipping-labels/${n.id}`}
                  title={n.toCompany}
                  sub={`${n.code} · ${formatDate(n.sendDate)}`}
                  status={<StatusPill tone={STATUS_TONE[n.status]}>{SHIPPING_NOTE_STATUS_LABELS[n.status]}</StatusPill>}
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{n.boxes} thùng</span>
                    {n.carrier && <span>{n.carrier}</span>}
                    {n.trackingNo && <span>Vận đơn {n.trackingNo}</span>}
                    <span>Cước {freight(n)}</span>
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Phiếu gửi</Th>
                    <Th>Ngày gửi</Th>
                    <Th className="text-right">Số thùng</Th>
                    <Th>Chành xe</Th>
                    <Th>Mã vận đơn</Th>
                    <Th className="text-right">Cước</Th>
                    <Th>Đơn / phiếu xuất</Th>
                    <Th>Trạng thái</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.data.items.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="pl-4">
                        <TitleCell icon={Truck} href={`/shipping-labels/${n.id}`} title={n.toCompany} sub={n.code} />
                        {(n.toAddress || n.toPhones) && <div className="mt-0.5 line-clamp-1 max-w-72 pl-12 text-xs whitespace-normal text-muted-foreground">{[n.toAddress, n.toPhones].filter(Boolean).join(' · ')}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(n.sendDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.boxes}</TableCell>
                      <TableCell>
                        {n.carrier ?? '—'}
                        {n.vehicle && <div className="text-xs text-muted-foreground">{n.vehicle}</div>}
                      </TableCell>
                      <TableCell>{n.trackingNo ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{freight(n)}</TableCell>
                      <TableCell className="text-sm">
                        {n.order && (
                          <Link href={`/contracts/${n.order.id}`} className="block hover:text-primary hover:underline">
                            {n.order.code}
                          </Link>
                        )}
                        {n.stockIssue && (
                          <Link href={`/stock-issues/${n.stockIssue.id}`} className="block text-muted-foreground hover:text-primary hover:underline">
                            {n.stockIssue.code}
                          </Link>
                        )}
                        {!n.order && !n.stockIssue && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={STATUS_TONE[n.status]}>{SHIPPING_NOTE_STATUS_LABELS[n.status]}</StatusPill>
                        {when(n) && <div className="mt-1 text-xs text-muted-foreground">{when(n)}</div>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager className="mt-0 border-t px-4 py-3" page={notes.data.page} totalPages={notes.data.totalPages} total={notes.data.total} pageSize={20} unit="phiếu" onPage={setPage} />
          </>
        )}
      </ListCard>
    </>
  );
}
