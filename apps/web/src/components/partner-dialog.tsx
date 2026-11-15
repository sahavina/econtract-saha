'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PARTNER_TYPE_LABELS, PARTNER_TYPES, type PartnerType } from '@saha/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import type { Partner } from '@/lib/types';

/** Thêm / sửa đối tác (dùng ở danh sách đối tác và trang chi tiết đối tác). */
const schema = z.object({
  code: z.string().trim().min(1, 'Nhập mã đối tác').max(50),
  type: z.enum(PARTNER_TYPES),
  entityType: z.enum(['ORGANIZATION', 'INDIVIDUAL']),
  name: z.string().trim().min(1, 'Nhập tên đối tác').max(255),
  shortName: z.string().trim().max(30).regex(/^[A-Za-z0-9_-]*$/, 'Chỉ gồm chữ không dấu, số, "-" hoặc "_"'),
  taxCode: z.string().max(20),
  address: z.string(),
  email: z.union([z.literal(''), z.email('Email không hợp lệ')]),
  phone: z.string().max(30),
  representative: z.string(),
  position: z.string(),
  note: z.string(),
});
type FormValues = z.infer<typeof schema>;

const toForm = (p?: Partner, type?: PartnerType): FormValues => ({
  code: p?.code ?? '',
  type: p?.type ?? type ?? 'CUSTOMER',
  entityType: p?.entityType ?? 'ORGANIZATION',
  name: p?.name ?? '',
  shortName: p?.shortName ?? '',
  taxCode: p?.taxCode ?? '',
  address: p?.address ?? '',
  email: p?.email ?? '',
  phone: p?.phone ?? '',
  representative: p?.representative ?? '',
  position: p?.position ?? '',
  note: p?.note ?? '',
});

export function PartnerDialog({ open, partner, defaultType, onClose }: { open: boolean; partner?: Partner; defaultType?: PartnerType; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(partner, defaultType) });
  useEffect(() => form.reset(toForm(partner, defaultType)), [open, partner, defaultType, form]);
  const errors = form.formState.errors;

  const save = useMutation({
    meta: { silent: true },
    mutationFn: (v: FormValues) => (partner ? api(`/partners/${partner.id}`, { method: 'PATCH', body: v }) : api('/partners', { method: 'POST', body: v })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success(partner ? 'Đã cập nhật đối tác' : 'Đã thêm đối tác');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) for (const e of err.errors) form.setError(e.field as keyof FormValues, { message: e.message });
      toast.error(err instanceof Error ? err.message : 'Lưu thất bại');
    },
  });

  const F = ({ name, label, className }: { name: keyof FormValues; label: string; className?: string }) => (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={`p-${name}`}>{label}</Label>
      <Input id={`p-${name}`} aria-invalid={!!errors[name]} {...form.register(name)} />
      {errors[name] && <p className="text-xs text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{partner ? `Sửa đối tác ${partner.code}` : 'Thêm đối tác'}</DialogTitle>
        </DialogHeader>
        <form id="partner-form" onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-3 sm:grid-cols-2" noValidate>
          {F({ name: "code", label: "Mã đối tác *" })}
          <div className="space-y-1.5">
            <Label>Phân loại</Label>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{PARTNER_TYPES.map((t) => <SelectItem key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              )}
            />
          </div>
          {F({ name: "name", label: "Tên đối tác *", className: "sm:col-span-2" })}
          {F({ name: "shortName", label: "Tên viết tắt (dùng trong mã hợp đồng, vd APOLLO)" })}
          <div className="space-y-1.5">
            <Label>Loại chủ thể</Label>
            <Controller
              control={form.control}
              name="entityType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORGANIZATION">Tổ chức</SelectItem>
                    <SelectItem value="INDIVIDUAL">Cá nhân</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {F({ name: "taxCode", label: "Mã số thuế" })}
          {F({ name: "address", label: "Địa chỉ", className: "sm:col-span-2" })}
          {F({ name: "email", label: "Email" })}
          {F({ name: "phone", label: "Điện thoại" })}
          {F({ name: "representative", label: "Người đại diện" })}
          {F({ name: "position", label: "Chức vụ" })}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-note">Ghi chú</Label>
            <Textarea id="p-note" rows={2} {...form.register('note')} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="partner-form" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
