'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Download, Loader2, Search, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/filter-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { importOdooPartner, type OdooKind, type OdooPartnerResult } from '@/lib/odoo';
import type { Partner } from '@/lib/types';

/**
 * Tìm khách hàng/nhà cung cấp trực tiếp trên Odoo (chỉ đọc) và nhập vào danh mục đối tác.
 * mode "import": nhập vào danh mục; mode "pick": nhập rồi trả đối tác cho form hợp đồng.
 */
export function OdooPartnerDialog({
  open,
  onOpenChange,
  mode,
  defaultKind,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'import' | 'pick';
  defaultKind?: OdooKind;
  onPicked?: (partner: Partner) => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<OdooKind | undefined>(defaultKind);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 400);
    return () => clearTimeout(t);
  }, [input]);

  const results = useQuery({
    queryKey: ['odoo', 'partners', { q, kind }],
    queryFn: () => api<OdooPartnerResult[]>('/integrations/odoo/partners', { query: { q, type: kind } }),
    enabled: open,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const importer = useMutation({
    meta: { silent: true },
    mutationFn: (r: OdooPartnerResult) => importOdooPartner(r.odooId, kind),
    onSuccess: (p, r) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      qc.invalidateQueries({ queryKey: ['odoo', 'partners'] });
      toast.success(r.imported ? `Đã cập nhật ${p.code} từ Odoo` : `Đã nhập ${p.code} – ${p.name}`);
      if (mode === 'pick') {
        onPicked?.(p);
        onOpenChange(false);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Không nhập được đối tác'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] flex-col sm:max-w-3xl"
        // Đặt con trỏ vào ô tìm kiếm thay vì nút đầu tiên của hộp thoại.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'pick' ? 'Chọn đối tác từ Odoo' : 'Nhập đối tác từ Odoo'}</DialogTitle>
          <DialogDescription>
            Tìm theo tên, mã số thuế, email hoặc mã tham chiếu. Dữ liệu được đọc trực tiếp từ Odoo; đối tác đã chọn được lưu vào danh mục để dùng lại.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input ref={searchRef} className="pl-8" placeholder="Nhập tên công ty, MST…" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Tìm trên Odoo" />
          </div>
          <FilterSelect
            allLabel="Khách hàng & nhà cung cấp"
            value={kind}
            onChange={(v) => setKind(v as OdooKind | undefined)}
            options={[
              { value: 'CUSTOMER', label: 'Khách hàng' },
              { value: 'SUPPLIER', label: 'Nhà cung cấp' },
            ]}
            className="w-56"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {results.isError ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              {results.error instanceof ApiError ? results.error.message : 'Không tìm được trên Odoo'}
            </p>
          ) : !results.data ? (
            <Skeleton className="m-3 h-40" />
          ) : results.data.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Không tìm thấy đối tác phù hợp trên Odoo.</p>
          ) : (
            <ul className={`divide-y ${results.isFetching ? 'opacity-60' : ''}`}>
              {results.data.map((r) => (
                <li key={r.odooId} className="flex items-start gap-3 px-3 py-2.5">
                  {r.isCompany ? <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[r.taxCode && `MST ${r.taxCode}`, r.isCustomer && 'Khách hàng', r.isSupplier && 'Nhà cung cấp', r.phone, r.email].filter(Boolean).join(' · ')}
                    </p>
                    {r.address && <p className="truncate text-xs text-muted-foreground" title={r.address}>{r.address}</p>}
                    {r.imported && <p className="text-xs text-emerald-700 dark:text-emerald-400">Đã có trong danh mục: {r.imported.code}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant={mode === 'pick' || !r.imported ? 'default' : 'outline'}
                    disabled={importer.isPending}
                    onClick={() => importer.mutate(r)}
                  >
                    {importer.isPending && importer.variables?.odooId === r.odooId ? <Loader2 className="animate-spin" /> : <Download />}
                    {mode === 'pick' ? 'Chọn' : r.imported ? 'Cập nhật' : 'Nhập'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {results.data && results.data.length >= 20 && (
          <p className="text-xs text-muted-foreground">Hiển thị 20 kết quả đầu – nhập thêm từ khóa để thu hẹp.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
