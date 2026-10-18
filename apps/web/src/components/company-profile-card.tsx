'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { type CompanyProfile, useCompanyProfile } from '@/lib/company';

type Draft = Record<Exclude<keyof CompanyProfile, 'configured'>, string>;

const FIELDS: { key: keyof Draft; label: string; span?: boolean; type?: string }[] = [
  { key: 'name', label: 'Tên doanh nghiệp *', span: true },
  { key: 'taxCode', label: 'Mã số thuế' },
  { key: 'address', label: 'Địa chỉ', span: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'representative', label: 'Người đại diện' },
  { key: 'position', label: 'Chức vụ' },
  { key: 'bankAccount', label: 'Số tài khoản (kèm ngân hàng, chi nhánh)', span: true },
];

const toDraft = (p: CompanyProfile): Draft => ({
  name: p.name,
  taxCode: p.taxCode ?? '',
  address: p.address ?? '',
  email: p.email ?? '',
  phone: p.phone ?? '',
  representative: p.representative ?? '',
  position: p.position ?? '',
  bankAccount: p.bankAccount ?? '',
});

/** Khai báo thông tin pháp nhân – dùng để tự điền khi đánh dấu "Bên nội bộ" trong hợp đồng. */
export function CompanyProfileCard() {
  const profile = useCompanyProfile();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thông tin doanh nghiệp</CardTitle>
        <CardDescription>
          Thông tin pháp nhân của doanh nghiệp mình. Khi lập hợp đồng, tích “Bên nội bộ (doanh nghiệp mình)” ở một bên tham gia sẽ tự điền các thông tin này.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* key: nạp lại form sau khi lưu (không đồng bộ state trong effect). */}
        {!profile.data ? <Skeleton className="h-56" /> : <CompanyProfileForm key={JSON.stringify(profile.data)} profile={profile.data} />}
      </CardContent>
    </Card>
  );
}

function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(profile));
  const [errors, setErrors] = useState<string[]>([]);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api<CompanyProfile>('/company-profile', { method: 'PUT', body: d }),
    onSuccess: (p) => {
      toast.success('Đã lưu thông tin doanh nghiệp');
      setErrors([]);
      qc.setQueryData(['company-profile'], p);
    },
    onError: (e) => setErrors(e instanceof ApiError && e.errors.length ? e.errors.map((x) => x.message) : [e instanceof Error ? e.message : 'Lưu thất bại']),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {!profile.configured && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Chưa khai báo – đang hiển thị thông tin lúc đăng ký. Bổ sung người đại diện, chức vụ, số tài khoản rồi bấm Lưu.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={`space-y-1.5 ${f.span ? 'md:col-span-2' : ''}`}>
            <Label htmlFor={`company-${f.key}`}>{f.label}</Label>
            <Input id={`company-${f.key}`} type={f.type} value={d[f.key]} onChange={(e) => setD({ ...d, [f.key]: e.target.value })} />
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" />} Lưu
      </Button>
    </form>
  );
}
