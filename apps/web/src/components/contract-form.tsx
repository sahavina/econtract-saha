'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FileUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cloneElement, isValidElement, useId, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FilterSelect } from '@/components/filter-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Paginated } from '@/lib/api';
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, formatFileSize, uploadContractDocument } from '@/lib/documents';
import { toDateInput } from '@/lib/format';
import { useLookups } from '@/lib/queries';
import type { ContractDetail, Partner, TemplateListItem } from '@/lib/types';

const PARTY_ROLES = [
  { value: 'PARTY_A', label: 'Bên A' },
  { value: 'PARTY_B', label: 'Bên B' },
  { value: 'PARTY_C', label: 'Bên C' },
  { value: 'RELATED', label: 'Bên liên quan' },
] as const;

const CONFIDENTIALITY = [
  { value: 'PUBLIC', label: 'Công khai' },
  { value: 'INTERNAL', label: 'Nội bộ' },
  { value: 'CONFIDENTIAL', label: 'Mật' },
  { value: 'SECRET', label: 'Tối mật' },
] as const;

const optionalEmail = z.union([z.literal(''), z.email('Email không hợp lệ')]);

const partySchema = z.object({
  role: z.enum(['PARTY_A', 'PARTY_B', 'PARTY_C', 'RELATED']),
  partnerId: z.string(),
  isInternal: z.boolean(),
  entityType: z.enum(['ORGANIZATION', 'INDIVIDUAL']),
  name: z.string().trim().min(1, 'Nhập tên bên tham gia'),
  taxCode: z.string(),
  address: z.string(),
  email: optionalEmail,
  phone: z.string(),
  representative: z.string(),
  position: z.string(),
  authorizationRef: z.string(),
});

const schema = z
  .object({
    code: z.string().trim().max(60),
    templateId: z.string(),
    title: z.string().trim().min(1, 'Vui lòng nhập tên hợp đồng').max(500),
    contractTypeId: z.string(),
    group: z.string(),
    description: z.string(),
    value: z.string().regex(/^\d{1,18}(\.\d{1,2})?$/, 'Giá trị không hợp lệ'),
    currency: z.string().length(3),
    vatRate: z.union([z.literal(''), z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'VAT không hợp lệ')]),
    expectedSignDate: z.string(),
    effectiveDate: z.string(),
    expiryDate: z.string(),
    departmentId: z.string(),
    ownerId: z.string(),
    confidentiality: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET']),
    tags: z.string(),
    note: z.string(),
    parties: z.array(partySchema),
  })
  .refine((v) => !v.effectiveDate || !v.expiryDate || v.effectiveDate <= v.expiryDate, {
    message: 'Ngày hết hạn phải sau ngày hiệu lực',
    path: ['expiryDate'],
  });
type FormValues = z.infer<typeof schema>;

const emptyParty = (role: FormValues['parties'][number]['role']): FormValues['parties'][number] => ({
  role,
  partnerId: '',
  isInternal: false,
  entityType: 'ORGANIZATION',
  name: '',
  taxCode: '',
  address: '',
  email: '',
  phone: '',
  representative: '',
  position: '',
  authorizationRef: '',
});

function toForm(c?: ContractDetail): FormValues {
  if (!c) {
    return {
      code: '', templateId: '', title: '', contractTypeId: '', group: '', description: '', value: '0', currency: 'VND', vatRate: '',
      expectedSignDate: '', effectiveDate: '', expiryDate: '', departmentId: '', ownerId: '', confidentiality: 'INTERNAL',
      tags: '', note: '', parties: [emptyParty('PARTY_A'), emptyParty('PARTY_B')],
    };
  }
  return {
    code: c.code,
    templateId: c.template?.id ?? '',
    title: c.title,
    contractTypeId: c.contractTypeId ?? '',
    group: c.group ?? '',
    description: c.description ?? '',
    value: String(Number(c.value)),
    currency: c.currency,
    vatRate: c.vatRate ? String(Number(c.vatRate)) : '',
    expectedSignDate: toDateInput(c.expectedSignDate),
    effectiveDate: toDateInput(c.effectiveDate),
    expiryDate: toDateInput(c.expiryDate),
    departmentId: c.departmentId ?? '',
    ownerId: c.ownerId ?? '',
    confidentiality: c.confidentiality,
    tags: c.tags.join(', '),
    note: c.note ?? '',
    parties: c.parties.map((p) => ({
      role: p.role,
      partnerId: p.partnerId ?? '',
      isInternal: p.isInternal,
      entityType: p.entityType,
      name: p.name,
      taxCode: p.taxCode ?? '',
      address: p.address ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      representative: p.representative ?? '',
      position: p.position ?? '',
      authorizationRef: p.authorizationRef ?? '',
    })),
  };
}

const nul = (v: string) => (v.trim() === '' ? null : v.trim());

function toPayload(v: FormValues, isEdit: boolean) {
  const payload = {
    title: v.title,
    contractTypeId: nul(v.contractTypeId),
    group: nul(v.group),
    description: nul(v.description),
    value: v.value,
    currency: v.currency,
    vatRate: v.vatRate === '' ? null : Number(v.vatRate),
    expectedSignDate: nul(v.expectedSignDate),
    effectiveDate: nul(v.effectiveDate),
    expiryDate: nul(v.expiryDate),
    departmentId: nul(v.departmentId),
    ownerId: nul(v.ownerId),
    confidentiality: v.confidentiality,
    tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
    note: nul(v.note),
    parties: v.parties.map((p) => ({
      ...p,
      partnerId: nul(p.partnerId),
      taxCode: nul(p.taxCode),
      address: nul(p.address),
      email: nul(p.email),
      phone: nul(p.phone),
      representative: nul(p.representative),
      position: nul(p.position),
      authorizationRef: nul(p.authorizationRef),
    })),
  };
  return isEdit ? payload : { ...payload, code: nul(v.code), templateId: nul(v.templateId) };
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  // Gắn id cho input con để label liên kết đúng (hỗ trợ trình đọc màn hình).
  const isInput = isValidElement<{ id?: string }>(children) && (children.type === Input || children.type === Textarea);
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={isInput ? id : undefined}>{label}</Label>
      {isInput ? cloneElement(children, { id }) : children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Chọn tệp hợp đồng (PDF/DOCX/…) để tải lên ngay sau khi tạo hợp đồng. */
function ContractFilesPicker({
  files,
  onChange,
  required,
}: {
  files: File[];
  onChange: (files: File[], added: File[]) => void;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const tooBig = picked.filter((f) => f.size > DOCUMENT_MAX_BYTES);
    if (tooBig.length) toast.error(`Vượt quá 20 MB: ${tooBig.map((f) => f.name).join(', ')}`);
    const added = picked.filter((f) => f.size <= DOCUMENT_MAX_BYTES && !files.some((x) => x.name === f.name && x.size === f.size));
    if (added.length) onChange([...files, ...added], added);
    if (input.current) input.current.value = '';
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tệp hợp đồng{required && ' *'}</CardTitle>
        <CardDescription>
          {required
            ? 'Tải lên bản hợp đồng đã soạn sẵn (PDF khuyến nghị để đối tác xem trực tiếp khi ký). Không cần soạn nội dung trong hệ thống.'
            : 'Tùy chọn: đính kèm luôn bản hợp đồng hoặc phụ lục có sẵn. Có thể bổ sung sau ở tab Tài liệu.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input ref={input} type="file" accept={DOCUMENT_ACCEPT} multiple className="hidden" onChange={(e) => add(e.target.files)} aria-label="Chọn tệp hợp đồng" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <FileUp className="size-6" />
          <span className="font-medium text-foreground">Chọn hoặc kéo thả tệp vào đây</span>
          <span>PDF, DOCX, XLSX, PNG, JPG · tối đa 20 MB mỗi tệp</span>
        </button>
        {files.length > 0 && (
          <ul className="divide-y rounded-md border">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(f.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Bỏ ${f.name}`}
                  onClick={() => onChange(files.filter((x) => x !== f), [])}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ContractForm({ contract, fromFile = false }: { contract?: ContractDetail; fromFile?: boolean }) {
  const isEdit = !!contract;
  const router = useRouter();
  const qc = useQueryClient();
  const lookups = useLookups();
  const [partnerSearch, setPartnerSearch] = useState('');
  const partners = useQuery({
    queryKey: ['partners', 'picker', partnerSearch],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { q: partnerSearch, pageSize: 50 } }),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(contract) });
  const { register, control, formState, setError, setValue } = form;
  const errors = formState.errors;
  const parties = useFieldArray({ control, name: 'parties' });

  const [files, setFiles] = useState<File[]>([]);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (v: FormValues) => {
      if (isEdit) {
        const c = await api<ContractDetail>(`/contracts/${contract.id}`, { method: 'PATCH', body: toPayload(v, true) });
        return { c, uploaded: 0, failed: [] as string[] };
      }
      const c = await api<ContractDetail>('/contracts', { method: 'POST', body: toPayload(v, false) });
      // Hợp đồng đã tạo thì giữ lại dù có tệp tải lên lỗi; người dùng tải lại ở tab Tài liệu.
      const failed: string[] = [];
      for (const f of files) {
        try {
          await uploadContractDocument(c.id, f);
        } catch (err) {
          failed.push(`${f.name}: ${err instanceof Error ? err.message : 'tải lên thất bại'}`);
        }
      }
      return { c, uploaded: files.length - failed.length, failed };
    },
    onSuccess: ({ c, uploaded, failed }) => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['contract', c.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (isEdit) toast.success('Đã lưu thay đổi');
      else toast.success(`Đã tạo hợp đồng nháp ${c.code}${uploaded ? ` kèm ${uploaded} tệp` : ''}`);
      if (failed.length) toast.error(`Chưa tải lên được ${failed.length} tệp – thử lại ở tab Tài liệu`, { description: failed.join('\n'), duration: 15_000 });
      router.push(files.length ? `/contracts/${c.id}?tab=documents` : `/contracts/${c.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.errors.length) {
        for (const e of err.errors) setError(e.field as keyof FormValues, { message: e.message });
      }
      toast.error(err instanceof Error ? err.message : 'Lưu thất bại');
    },
  });

  const applyPartner = (index: number, partnerId: string | undefined) => {
    const p = partners.data?.items.find((x) => x.id === partnerId);
    setValue(`parties.${index}.partnerId`, partnerId ?? '');
    if (!p) return;
    setValue(`parties.${index}.name`, p.name);
    setValue(`parties.${index}.entityType`, p.entityType);
    setValue(`parties.${index}.taxCode`, p.taxCode ?? '');
    setValue(`parties.${index}.address`, p.address ?? '');
    setValue(`parties.${index}.email`, p.email ?? '');
    setValue(`parties.${index}.phone`, p.phone ?? '');
    setValue(`parties.${index}.representative`, p.representative ?? '');
    setValue(`parties.${index}.position`, p.position ?? '');
  };

  const contractTypeId = useWatch({ control, name: 'contractTypeId' });
  const templateId = useWatch({ control, name: 'templateId' });
  const templates = useQuery({
    queryKey: ['templates', 'usable'],
    queryFn: () => api<Paginated<TemplateListItem>>('/templates', { query: { usable: true, pageSize: 100 } }),
    enabled: !isEdit,
  });
  const selectedTemplate = templates.data?.items.find((t) => t.id === templateId);
  const selectedType =
    lookups.data?.contractTypes.find((t) => t.id === contractTypeId) ??
    (selectedTemplate?.contractType ? lookups.data?.contractTypes.find((t) => t.id === selectedTemplate.contractType?.id) : undefined);

  const filesPicker = (
    <ContractFilesPicker
      files={files}
      required={fromFile}
      onChange={(next, added) => {
        setFiles(next);
        // Gợi ý tên hợp đồng từ tên tệp đầu tiên nếu chưa nhập.
        if (added[0] && !form.getValues('title').trim()) {
          setValue('title', added[0].name.replace(/\.[^.]+$/, '').slice(0, 500), { shouldValidate: true });
        }
      }}
    />
  );

  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        if (fromFile && !files.length) return toast.error('Chọn ít nhất một tệp hợp đồng');
        save.mutate(v);
      })}
      className="space-y-4"
      noValidate
    >
      {!isEdit && fromFile && filesPicker}
      {!isEdit && !fromFile && (
        <Card>
          <CardHeader>
            <CardTitle>Mẫu hợp đồng</CardTitle>
            <CardDescription>Chọn mẫu để sao chép sẵn nội dung và loại hợp đồng; có thể soạn lại sau khi tạo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Controller
              control={control}
              name="templateId"
              render={({ field }) => (
                <FilterSelect
                  className="w-full md:w-96"
                  allLabel="— Không dùng mẫu (soạn từ đầu) —"
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  options={(templates.data?.items ?? []).map((t) => ({ value: t.id, label: `${t.name} · v${t.version}` }))}
                  ariaLabel="Mẫu hợp đồng"
                />
              )}
            />
            {selectedTemplate && (
              <p className="text-sm text-muted-foreground">
                {selectedTemplate.description ?? selectedTemplate.name}
                {selectedTemplate.requiredVariables.length > 0 &&
                  ` · Dữ liệu bắt buộc: ${selectedTemplate.requiredVariables.map((k) => `{{${k}}}`).join(', ')}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
          <CardDescription>Các trường có dấu * là bắt buộc.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Mã hợp đồng" error={errors.code?.message}>
            <Input
              disabled={isEdit}
              placeholder={selectedType ? `Tự sinh theo mẫu ${selectedType.codePattern}` : 'Để trống để tự sinh (HD-{YYYY}-{SEQUENCE:5})'}
              {...register('code')}
            />
          </Field>
          <Field label="Tên hợp đồng *" error={errors.title?.message} className="md:col-span-2">
            <Input aria-invalid={!!errors.title} {...register('title')} />
          </Field>
          <Field label="Loại hợp đồng">
            <Controller
              control={control}
              name="contractTypeId"
              render={({ field }) => (
                <FilterSelect className="w-full" allLabel="— Chưa chọn —" value={field.value} onChange={(v) => field.onChange(v ?? '')} options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))} />
              )}
            />
          </Field>
          <Field label="Nhóm hợp đồng">
            <Input {...register('group')} />
          </Field>
          <Field label="Mức độ bảo mật">
            <Controller
              control={control}
              name="confidentiality"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label="Mức độ bảo mật"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONFIDENTIALITY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Giá trị hợp đồng *" error={errors.value?.message}>
            <Input inputMode="decimal" aria-invalid={!!errors.value} {...register('value')} />
          </Field>
          <Field label="Tiền tệ" error={errors.currency?.message}>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label="Tiền tệ"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['VND', 'USD', 'EUR'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Thuế VAT (%)" error={errors.vatRate?.message}>
            <Input inputMode="decimal" {...register('vatRate')} />
          </Field>
          <Field label="Ngày dự kiến ký">
            <Input type="date" {...register('expectedSignDate')} />
          </Field>
          <Field label="Ngày hiệu lực">
            <Input type="date" {...register('effectiveDate')} />
          </Field>
          <Field label="Ngày hết hạn" error={errors.expiryDate?.message}>
            <Input type="date" aria-invalid={!!errors.expiryDate} {...register('expiryDate')} />
          </Field>
          <Field label="Phòng ban phụ trách">
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <FilterSelect className="w-full" allLabel="Phòng ban của tôi" value={field.value} onChange={(v) => field.onChange(v ?? '')} options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
              )}
            />
          </Field>
          <Field label="Nhân viên phụ trách">
            <Controller
              control={control}
              name="ownerId"
              render={({ field }) => (
                <FilterSelect className="w-full" allLabel="Tôi" value={field.value} onChange={(v) => field.onChange(v ?? '')} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} />
              )}
            />
          </Field>
          <Field label="Tags (phân cách bằng dấu phẩy)">
            <Input {...register('tags')} />
          </Field>
          <Field label="Mô tả" className="md:col-span-3">
            <Textarea rows={3} {...register('description')} />
          </Field>
          <Field label="Ghi chú" className="md:col-span-3">
            <Textarea rows={2} {...register('note')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Các bên tham gia</CardTitle>
            <CardDescription>Chọn từ danh mục đối tác để điền tự động, hoặc nhập trực tiếp.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => parties.append(emptyParty(parties.fields.length === 0 ? 'PARTY_A' : parties.fields.length === 1 ? 'PARTY_B' : 'PARTY_C'))}>
            <Plus /> Thêm bên
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Lọc danh sách đối tác…" value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} className="max-w-xs" aria-label="Lọc đối tác" />
          {parties.fields.map((f, i) => {
            const pe = errors.parties?.[i];
            return (
              <div key={f.id} className="rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Controller
                    control={control}
                    name={`parties.${i}.role`}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-36" aria-label="Vai trò"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PARTY_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`parties.${i}.partnerId`}
                    render={({ field }) => (
                      <FilterSelect className="w-72" allLabel="— Nhập thủ công —" value={field.value} onChange={(v) => applyPartner(i, v)} options={(partners.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} ariaLabel="Chọn đối tác" />
                    )}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" {...register(`parties.${i}.isInternal`)} /> Bên nội bộ (doanh nghiệp mình)
                  </label>
                  <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label="Xóa bên" onClick={() => parties.remove(i)}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Tên pháp nhân/cá nhân *" error={pe?.name?.message} className="md:col-span-2">
                    <Input {...register(`parties.${i}.name`)} />
                  </Field>
                  <Field label="Mã số thuế / định danh">
                    <Input {...register(`parties.${i}.taxCode`)} />
                  </Field>
                  <Field label="Địa chỉ" className="md:col-span-3">
                    <Input {...register(`parties.${i}.address`)} />
                  </Field>
                  <Field label="Email" error={pe?.email?.message}>
                    <Input type="email" {...register(`parties.${i}.email`)} />
                  </Field>
                  <Field label="Số điện thoại">
                    <Input {...register(`parties.${i}.phone`)} />
                  </Field>
                  <Field label="Người đại diện">
                    <Input {...register(`parties.${i}.representative`)} />
                  </Field>
                  <Field label="Chức vụ">
                    <Input {...register(`parties.${i}.position`)} />
                  </Field>
                  <Field label="Căn cứ đại diện / ủy quyền" className="md:col-span-2">
                    <Input {...register(`parties.${i}.authorizationRef`)} />
                  </Field>
                </div>
              </div>
            );
          })}
          {parties.fields.length === 0 && <p className="text-sm text-muted-foreground">Chưa có bên tham gia.</p>}
        </CardContent>
      </Card>

      {!isEdit && !fromFile && filesPicker}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {isEdit ? 'Lưu thay đổi' : files.length ? `Lưu nháp và tải lên ${files.length} tệp` : 'Lưu nháp'}
        </Button>
      </div>
    </form>
  );
}
