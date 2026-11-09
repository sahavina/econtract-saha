'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useCompanyProfile } from '@/lib/company';
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, formatFileSize, uploadContractDocument } from '@/lib/documents';
import { useLookups } from '@/lib/queries';
import type { ContractDetail, ContractKind, Partner } from '@/lib/types';

const extOf = (name: string) => name.match(/\.[^.]+$/)?.[0] ?? '';
const baseOf = (name: string) => name.replace(/\.[^.]+$/, '');
/** Tên tệp theo mã: mã có thể chứa "/" (vd 01/HĐMB/SAHA) nên thay các ký tự không dùng được trong tên tệp. */
const codedFileName = (code: string, original: string) => `${code.trim().replace(/[\\/:*?"<>|]+/g, '-')}${extOf(original)}`;

const TEXT = {
  ORDER: { button: 'Lưu file đơn', noun: 'đơn đặt hàng', short: 'đơn', code: 'Mã đơn đặt hàng', date: 'Ngày đặt hàng', title: 'Đơn đặt hàng' },
  CONTRACT: { button: 'Lưu file hợp đồng', noun: 'hợp đồng', short: 'hợp đồng', code: 'Mã hợp đồng', date: 'Ngày ký', title: 'Hợp đồng' },
} as const;

/** Lưu nhanh hợp đồng/đơn đã có sẵn file: tạo hồ sơ nháp của đối tác theo mã, tệp chính đặt tên theo mã, kèm các tệp đính kèm. */
export function FileArchiveButton({ kind, partner }: { kind: ContractKind; partner: Partner }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Archive /> {TEXT[kind].button}
      </Button>
      {open && <FileArchiveDialog kind={kind} partner={partner} onClose={() => setOpen(false)} />}
    </>
  );
}

function FileArchiveDialog({ kind, partner, onClose }: { kind: ContractKind; partner: Partner; onClose: () => void }) {
  const text = TEXT[kind];
  const qc = useQueryClient();
  const lookups = useLookups();
  const company = useCompanyProfile();
  const mainInput = useRef<HTMLInputElement>(null);
  const extraInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [date, setDate] = useState('');
  const [main, setMain] = useState<File | null>(null);
  const [extras, setExtras] = useState<File[]>([]);
  const [codeError, setCodeError] = useState('');

  const accepted = (f: File) => {
    if (f.size <= DOCUMENT_MAX_BYTES) return true;
    toast.error(`${f.name} vượt quá ${formatFileSize(DOCUMENT_MAX_BYTES)}`);
    return false;
  };
  const pickMain = (f: File | undefined) => {
    if (!f || !accepted(f)) return;
    setMain(f);
    // Mã gợi ý theo tên tệp nếu chưa nhập.
    if (!code.trim()) setCode(baseOf(f.name).slice(0, 60));
  };

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      const c = company.data;
      const partnerType = partner.type === 'CUSTOMER' || partner.type === 'SUPPLIER' ? partner.type : null;
      const record = await api<ContractDetail>('/contracts', {
        method: 'POST',
        body: {
          kind,
          code: code.trim(),
          title: `${text.title} ${code.trim()}`,
          // Đơn cần loại "Đơn đặt hàng" để nằm đúng danh sách; hợp đồng phân loại theo đối tác.
          ...(kind === 'ORDER' ? { contractTypeId: lookups.data?.contractTypes.find((t) => t.kind === 'ORDER')?.id ?? null } : { category: partnerType }),
          expectedSignDate: date || null,
          parties: [
            {
              role: 'PARTY_A',
              partnerId: partner.id,
              entityType: partner.entityType,
              name: partner.name,
              taxCode: partner.taxCode,
              address: partner.address,
              email: partner.email,
              phone: partner.phone,
              representative: partner.representative,
              position: partner.position,
              partnerType,
            },
            ...(c
              ? [{ role: 'PARTY_B', isInternal: true, name: c.name, taxCode: c.taxCode, address: c.address, email: c.email, phone: c.phone, representative: c.representative, position: c.position, bankAccount: c.bankAccount }]
              : []),
          ],
        },
      });
      // Hồ sơ đã tạo thì giữ lại dù có tệp lỗi; người dùng tải lại bằng nút đính kèm trên dòng của hồ sơ.
      const uploads = [new File([main!], codedFileName(code, main!.name), { type: main!.type }), ...extras];
      const failed: string[] = [];
      for (const file of uploads) await uploadContractDocument(record.id, file).catch(() => failed.push(file.name));
      return { record, failed, uploaded: uploads.length - failed.length };
    },
    onSuccess: ({ record, failed, uploaded }) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Đã lưu ${text.short} ${record.code} kèm ${uploaded} tệp`);
      if (failed.length) toast.error(`Chưa tải lên được: ${failed.join(', ')}. Tải lại bằng nút đính kèm trên dòng của ${text.short}.`, { duration: 10_000 });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setCodeError(`${text.code} "${code.trim()}" đã tồn tại`);
      else toast.error(e instanceof Error ? e.message : `Không lưu được ${text.noun}`);
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lưu file {text.noun}</DialogTitle>
          <DialogDescription>
            {text.title} của {partner.name} được lưu ở trạng thái nháp. Tệp {text.short} đặt tên theo mã, tệp đính kèm giữ nguyên tên.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tệp {text.noun} *</Label>
            <input ref={mainInput} type="file" accept={DOCUMENT_ACCEPT} className="hidden" aria-label={`Chọn tệp ${text.noun}`} onChange={(e) => { pickMain(e.target.files?.[0]); e.target.value = ''; }} />
            {main ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={main.name}>{code.trim() ? codedFileName(code, main.name) : main.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(main.size)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bỏ tệp ${text.short}`} onClick={() => setMain(null)}><X /></Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full" onClick={() => mainInput.current?.click()}>
                <FileText /> Chọn tệp (PDF, Word, Excel, ảnh)
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="archive-code">{text.code} *</Label>
              <Input id="archive-code" maxLength={60} aria-invalid={!!codeError} value={code} onChange={(e) => { setCode(e.target.value); setCodeError(''); }} />
              {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive-date">{text.date}</Label>
              <Input id="archive-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tệp đính kèm</Label>
            <input
              ref={extraInput}
              type="file"
              multiple
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              aria-label="Chọn tệp đính kèm"
              onChange={(e) => {
                // Đọc tệp trước khi xóa giá trị ô chọn: hàm cập nhật state chạy sau.
                const added = Array.from(e.target.files ?? []).filter(accepted);
                setExtras((x) => [...x, ...added]);
                e.target.value = '';
              }}
            />
            {extras.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(f.size)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bỏ ${f.name}`} onClick={() => setExtras((x) => x.filter((_, k) => k !== i))}><X /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => extraInput.current?.click()}>
              <Paperclip /> Thêm tệp đính kèm
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>Hủy</Button>
          <Button disabled={!main || !code.trim() || !lookups.data || company.isPending || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} {kind === 'ORDER' ? 'Lưu đơn' : 'Lưu hợp đồng'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
