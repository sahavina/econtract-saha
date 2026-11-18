'use client';

import { renderCode, validateCodePattern } from '@saha/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FileCode2, Hash, Loader2, type LucideIcon, Mail, Pencil, PenLine, Plug, Plus, Type } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CompanyProfileCard } from '@/components/company-profile-card';
import { DocumentFontCard } from '@/components/document-font-card';
import { EmailSettingsCard } from '@/components/email-settings-card';
import { MobileCard, StatusPill, TitleCell, Th } from '@/components/list-ui';
import { MisaEsignSettingsCard } from '@/components/misa-esign-settings-card';
import { OdooSettingsCard } from '@/components/odoo-settings-card';
import { QuoteCodeSettingsCard } from '@/components/quote-code-settings-card';
import { SettingsSection } from '@/components/settings-section';
import { EmptyState, ErrorState, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminContractType } from '@/lib/types';

interface Draft {
  id?: string;
  code: string;
  name: string;
  codePattern: string;
  isActive: boolean;
  /** Chỉ chọn khi tạo loại mới. */
  kind: 'CONTRACT' | 'ORDER';
}

const TOKENS = ['{TYPE}', '{DEPT}', '{BRANCH}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{PARTNER}', '{SEQUENCE:4}'];

function TypeDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const patternError = validateCodePattern(d.codePattern);
  // Xem trước với ngày hiện tại, phòng ban KD, chi nhánh HN, số thứ tự 1.
  const example = patternError ? null : renderCode(d.codePattern, { date: new Date(), typeCode: d.code.toUpperCase() || 'HD', departmentCode: 'KD', branchCode: 'HN', partnerCode: 'APOLLO' }, 1);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const body = { name: d.name, codePattern: d.codePattern, isActive: d.isActive };
      return d.id ? api(`/contract-types/${d.id}`, { method: 'PATCH', body }) : api('/contract-types', { method: 'POST', body: { ...body, code: d.code, kind: d.kind } });
    },
    onSuccess: () => {
      toast.success('Đã lưu loại hợp đồng');
      qc.invalidateQueries({ queryKey: ['admin-contract-types'] });
      qc.invalidateQueries({ queryKey: ['contract-lookups'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? (e.status === 409 ? 'Mã loại đã tồn tại' : e.errors.map((x) => x.message).join('; ') || e.message) : 'Lưu thất bại'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{d.id ? `Sửa loại ${draft.name}` : 'Thêm loại hợp đồng'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="t-code">Mã loại *</Label>
            <Input id="t-code" disabled={!!d.id} value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Tên loại *</Label>
            <Input id="t-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-pattern">Mẫu mã hợp đồng *</Label>
          <Input id="t-pattern" className="font-mono" value={d.codePattern} onChange={(e) => set({ codePattern: e.target.value })} aria-invalid={!!patternError} />
          <div className="flex flex-wrap gap-1">
            {TOKENS.map((t) => (
              <Button key={t} type="button" variant="outline" size="xs" onClick={() => set({ codePattern: d.codePattern + t })}>
                {t}
              </Button>
            ))}
          </div>
          {patternError ? (
            <p className="text-xs text-destructive">{patternError}</p>
          ) : (
            <p className="text-sm">
              Ví dụ: <code className="font-semibold">{example}</code>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {'{DD}{MM}{YYYY}'}: ngày dự kiến ký (chưa có thì ngày tạo). {'{PARTNER}'}: tên viết tắt của đối tác (khai báo ở danh mục Đối tác; chưa có thì dùng mã đối tác). Số
            thứ tự {'{SEQUENCE:n}'} không bắt buộc – tự đếm lại khi phần tiền tố thay đổi (có {'{YYYY}'} thì mỗi năm đếm lại từ 1); mẫu không có số thứ tự mà bị trùng mã
            thì tự thêm -2, -3… Đổi mẫu chỉ áp dụng cho hợp đồng tạo sau.
          </p>
        </div>
        {d.id ? (
          <p className="text-sm text-muted-foreground">Dùng cho: {d.kind === 'ORDER' ? 'đơn đặt hàng' : 'hợp đồng'}</p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={d.kind === 'ORDER'} onCheckedChange={(v) => set({ kind: v ? 'ORDER' : 'CONTRACT' })} /> Dùng cho đơn đặt hàng (không đổi được sau khi tạo)
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={d.isActive} onCheckedChange={(v) => set({ isActive: !!v })} /> Đang sử dụng
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} disabled={!!patternError || !d.code || !d.name || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mục điều hướng nhanh trong trang (liên kết neo tới từng khối cấu hình). */
const SECTIONS: { id: string; icon: LucideIcon; label: string }[] = [
  { id: 'company', icon: Building2, label: 'Thông tin doanh nghiệp' },
  { id: 'contract-types', icon: FileCode2, label: 'Loại hợp đồng & mẫu mã' },
  { id: 'quote-code', icon: Hash, label: 'Mã báo giá' },
  { id: 'document-font', icon: Type, label: 'Phông chữ văn bản' },
  { id: 'email', icon: Mail, label: 'Email gửi đi (SMTP)' },
  { id: 'odoo', icon: Plug, label: 'Tích hợp Odoo' },
  { id: 'misa', icon: PenLine, label: 'Chữ ký số MISA eSign' },
];

export default function AdminSettingsPage() {
  const { can } = useAuth();
  const allowed = can('settings.manage');
  const types = useQuery({ queryKey: ['admin-contract-types'], queryFn: () => api<AdminContractType[]>('/contract-types'), enabled: allowed });
  const [editing, setEditing] = useState<Draft | null>(null);

  if (!allowed) return <p className="text-sm text-muted-foreground">Bạn không có quyền quản lý cấu hình.</p>;

  const edit = (t: AdminContractType) => setEditing({ id: t.id, code: t.code, name: t.name, codePattern: t.codePattern, isActive: t.isActive, kind: t.kind });
  const editBtn = (t: AdminContractType) => (
    <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${t.name}`} onClick={() => edit(t)}>
      <Pencil />
    </Button>
  );
  const kindPill = (t: AdminContractType) => (t.kind === 'ORDER' ? <StatusPill tone="teal">Đơn đặt hàng</StatusPill> : <StatusPill tone="indigo">Hợp đồng</StatusPill>);
  const activePill = (t: AdminContractType) => (t.isActive ? <StatusPill tone="green">Đang dùng</StatusPill> : <StatusPill tone="gray">Ngừng</StatusPill>);

  return (
    <>
      <PageHeader title="Cấu hình" description="Thông tin doanh nghiệp, mẫu mã hợp đồng và các kết nối bên ngoài." crumbs={[{ label: 'Quản trị' }, { label: 'Cấu hình' }]} />
      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Các mục cấu hình" className="hidden overflow-hidden rounded-xl border bg-card p-2 shadow-[0_1px_3px_0_rgb(15_23_42/0.05)] lg:sticky lg:top-4 lg:block">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <s.icon className="size-4 shrink-0" aria-hidden />
              {s.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <CompanyProfileCard id="company" />
          <SettingsSection
            id="contract-types"
            icon={FileCode2}
            title="Loại hợp đồng & mẫu mã"
            description={<>Mã hợp đồng tự sinh theo mẫu của từng loại; hợp đồng không chọn loại dùng mẫu HD-{'{YYYY}'}-{'{SEQUENCE:5}'}.</>}
            action={
              <Button className="h-9" onClick={() => setEditing({ code: '', name: '', codePattern: '{TYPE}-{YYYY}-{SEQUENCE:4}', isActive: true, kind: 'CONTRACT' })}>
                <Plus /> Thêm loại
              </Button>
            }
          >
            {types.isError ? (
              <div className="p-5">
                <ErrorState error={types.error} onRetry={() => types.refetch()} />
              </div>
            ) : !types.data ? (
              <div className="p-5">
                <Skeleton className="h-40" />
              </div>
            ) : types.data.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Chưa có loại hợp đồng" />
              </div>
            ) : (
              <>
                <ul className="divide-y md:hidden">
                  {types.data.map((t) => (
                    <MobileCard key={t.id} title={t.name} sub={t.code} status={activePill(t)} actions={editBtn(t)}>
                      <span className="mb-1 flex flex-wrap items-center gap-2">
                        {kindPill(t)}
                        <span className="text-xs text-muted-foreground">{t._count.contracts} hợp đồng</span>
                      </span>
                      <code className="block text-xs break-all">{t.codePattern}</code>
                      <span className="block text-xs text-muted-foreground">
                        Ví dụ: <code className="break-all text-foreground">{t.example}</code>
                      </span>
                    </MobileCard>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <Th className="pl-5">Loại</Th>
                        <Th>Dùng cho</Th>
                        <Th>Mẫu mã</Th>
                        <Th>Ví dụ</Th>
                        <Th className="text-right">Hợp đồng</Th>
                        <Th>Trạng thái</Th>
                        <Th />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {types.data.map((t) => (
                        <TableRow key={t.id} className={t.isActive ? '' : 'opacity-60'}>
                          <TableCell className="pl-5">
                            <TitleCell icon={FileCode2} title={t.name} sub={t.code} />
                          </TableCell>
                          <TableCell>{kindPill(t)}</TableCell>
                          <TableCell className="max-w-64 whitespace-normal">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{t.codePattern}</code>
                          </TableCell>
                          <TableCell className="max-w-56 whitespace-normal">
                            <code className="text-xs font-semibold break-all">{t.example}</code>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{t._count.contracts}</TableCell>
                          <TableCell>{activePill(t)}</TableCell>
                          <TableCell className="pr-5 text-right">{editBtn(t)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </SettingsSection>
          <QuoteCodeSettingsCard id="quote-code" />
          <DocumentFontCard id="document-font" />
          <EmailSettingsCard id="email" />
          <OdooSettingsCard id="odoo" />
          <MisaEsignSettingsCard id="misa" />
        </div>
      </div>
      {editing && <TypeDialog draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
