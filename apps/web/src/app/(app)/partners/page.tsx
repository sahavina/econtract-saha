'use client';

import { PARTNER_TYPE_LABELS, PARTNER_TYPES, type PartnerType } from '@saha/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CloudDownload, Link2, Loader2, Pencil, Plus, RefreshCw, Trash2, User } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { FilterSelect } from '@/components/filter-select';
import { OdooPartnerDialog } from '@/components/odoo-partner-dialog';
import { PartnerDialog } from '@/components/partner-dialog';
import { ListCard, ListState, MobileCard, SearchBox, StatusPill, Th, TitleCell, type Tone } from '@/components/list-ui';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isOdooPartner, odooReady, useOdooConfig } from '@/lib/odoo';
import type { Partner } from '@/lib/types';

const TYPE_TONE: Record<PartnerType, Tone> = { CUSTOMER: 'sky', SUPPLIER: 'violet', BOTH: 'teal', OTHER: 'gray' };
const typeTone = (t: PartnerType) => TYPE_TONE[t];

export default function PartnersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const qc = useQueryClient();
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
  const odoo = useOdooConfig();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['partners', { type, q: debounced, page }],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { type, q: debounced, page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success('Đã xóa đối tác');
    },
  });

  /** Nút thao tác trên một đối tác (bảng và thẻ điện thoại). */
  const partnerActions = (p: Partner) =>
    can('partner.manage') ? (
      <span className="inline-flex items-center whitespace-nowrap">
        <Button variant="ghost" size="icon-sm" aria-label="Sửa" onClick={() => setDialog({ partner: p })}><Pencil /></Button>
        {isOdooPartner(p) && odooReady(odoo.data) && (
          <Button variant="ghost" size="icon-sm" aria-label={`Cập nhật ${p.code} từ Odoo`} disabled={syncOdoo.isPending} onClick={() => syncOdoo.mutate(p.id)}>
            <RefreshCw className={syncOdoo.isPending && syncOdoo.variables === p.id ? 'animate-spin' : undefined} />
          </Button>
        )}
        {!isOdooPartner(p) && odooReady(odoo.data) && (
          <Button variant="ghost" size="icon-sm" aria-label={`Ánh xạ ${p.code} với Odoo`} title="Ánh xạ với đối tác Odoo" onClick={() => setLinking(p)}>
            <Link2 />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Xóa"
          onClick={() => setConfirm({ title: `Xóa đối tác ${p.name}?`, description: 'Hợp đồng đã tạo vẫn giữ thông tin các bên.', destructive: true, confirmLabel: 'Xóa', onConfirm: () => remove.mutateAsync(p.id).then(() => undefined) })}
        >
          <Trash2 />
        </Button>
      </span>
    ) : null;

  const title = type ? PARTNER_TYPE_LABELS[type] : 'Tất cả đối tác';
  const data = list.data;

  return (
    <>
      <PageHeader
        title={title}
        crumbs={[{ label: 'Đối tác', href: '/partners' }, { label: title }]}
        actions={
          can('partner.manage') && (
            <div className="flex gap-2">
              {odooReady(odoo.data) && (
                <>
                  <Button variant="outline" disabled={autoLink.isPending} onClick={() => autoLink.mutate()} title="Liên kết các đối tác chưa ánh xạ với đối tác Odoo trùng mã số thuế">
                    {autoLink.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Ánh xạ Odoo theo MST
                  </Button>
                  <Button variant="outline" onClick={() => setOdooOpen(true)}>
                    <CloudDownload /> Nhập từ Odoo
                  </Button>
                </>
              )}
              <Button onClick={() => setDialog({})}><Plus /> Thêm đối tác</Button>
            </div>
          )
        }
      />
      <ListCard
        toolbar={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Tìm theo tên, mã, MST, email…" ariaLabel="Tìm đối tác" />
            <FilterSelect className="h-9 w-44" allLabel="Mọi phân loại" value={type} onChange={(v) => { router.replace(v ? `${pathname}?type=${v}` : pathname); }} options={PARTNER_TYPES.map((t) => ({ value: t, label: PARTNER_TYPE_LABELS[t] }))} ariaLabel="Phân loại" />
          </>
        }
      >
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
                  status={<StatusPill tone={typeTone(p.type)}>{PARTNER_TYPE_LABELS[p.type]}</StatusPill>}
                  footer={partnerActions(p)}
                >
                  <span className="block text-xs text-muted-foreground">
                    {[p.representative, p.phone, p.email].filter(Boolean).join(' · ') || '—'} · {p._count?.contractParties ?? 0} hợp đồng
                  </span>
                </MobileCard>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Th className="pl-4">Đối tác</Th>
                    <Th>Phân loại</Th>
                    <Th>Mã số thuế</Th>
                    <Th>Người đại diện</Th>
                    <Th>Liên hệ</Th>
                    <Th className="text-right">Hợp đồng</Th>
                    <Th />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => {
                        // Đang bôi đen để sao chép (MST, tên…) thì không mở trang.
                        if (!window.getSelection()?.toString()) router.push(`/partners/${p.id}`);
                      }}
                    >
                      <TableCell className="pl-4">
                        <span className="flex items-center gap-2">
                          <TitleCell icon={p.entityType === 'INDIVIDUAL' ? User : Building2} title={p.name} sub={p.code} />
                          {isOdooPartner(p) && <Badge variant="outline" className="text-[10px]">Odoo</Badge>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={typeTone(p.type)}>{PARTNER_TYPE_LABELS[p.type]}</StatusPill>
                      </TableCell>
                      <TableCell className="tabular-nums">{p.taxCode ?? '—'}</TableCell>
                      <TableCell>
                        {p.representative ?? '—'}
                        {p.position && <div className="text-xs text-muted-foreground">{p.position}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.phone && <div>{p.phone}</div>}
                        {p.email && <div className="text-muted-foreground">{p.email}</div>}
                        {!p.phone && !p.email && '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p._count?.contractParties ?? 0}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {partnerActions(p)}
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
