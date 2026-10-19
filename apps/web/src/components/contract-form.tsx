'use client';

import { extractContractFields, foldVi } from '@saha/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudDownload, FileText, FileUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cloneElement, isValidElement, useId, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FilterSelect } from '@/components/filter-select';
import { OdooPartnerDialog } from '@/components/odoo-partner-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useCompanyProfile } from '@/lib/company';
import { convertDocToDocx, readDocx } from '@/lib/docx';
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, formatFileSize, uploadContractDocument } from '@/lib/documents';
import { toDateInput } from '@/lib/format';
import { odooReady, useOdooConfig } from '@/lib/odoo';
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
  bankAccount: z.string(),
  /** Phân loại bên đối tác ⇒ lưu vào danh mục Đối tác khi lưu hợp đồng. */
  partnerType: z.enum(['', 'CUSTOMER', 'SUPPLIER']),
}).superRefine((p, ctx) => {
  if (!p.isInternal && p.name.trim() && !p.partnerType) {
    ctx.addIssue({ code: 'custom', path: ['partnerType'], message: 'Chọn Khách hàng hoặc Nhà cung cấp' });
  }
});

/** Loại đối tác của bên ⇒ giá trị cho ô "Phân loại" (vừa KH vừa NCC thì để người dùng chọn theo hợp đồng này). */
const partyTypeOf = (t?: string | null): '' | 'CUSTOMER' | 'SUPPLIER' => (t === 'CUSTOMER' || t === 'SUPPLIER' ? t : '');

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
  bankAccount: '',
  partnerType: '',
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
      bankAccount: p.bankAccount ?? '',
      partnerType: partyTypeOf(p.partner?.type),
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
      bankAccount: nul(p.bankAccount),
      partnerType: p.isInternal || !p.partnerType ? null : p.partnerType,
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
          <span>PDF, DOC, DOCX, XLSX, PNG, JPG · tối đa 20 MB mỗi tệp</span>
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
  const odoo = useOdooConfig();
  const company = useCompanyProfile();
  const [odooPick, setOdooPick] = useState<number | null>(null);
  const partners = useQuery({
    queryKey: ['partners', 'picker', partnerSearch],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { q: partnerSearch, pageSize: 50 } }),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(contract) });
  const { register, control, formState, setError, setValue } = form;
  const errors = formState.errors;
  const parties = useFieldArray({ control, name: 'parties' });
  const watchedParties = useWatch({ control, name: 'parties' });

  const [files, setFiles] = useState<File[]>([]);
  /** Nội dung hợp đồng chuyển từ file Word (chỉ khi lập mới, không chọn mẫu). */
  const [imported, setImported] = useState<{ name: string; html: string; use: boolean } | null>(null);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (v: FormValues) => {
      if (isEdit) {
        const c = await api<ContractDetail>(`/contracts/${contract.id}`, { method: 'PATCH', body: toPayload(v, true) });
        return { c, uploaded: 0, failed: [] as string[] };
      }
      const body = { ...toPayload(v, false), ...(imported?.use && !v.templateId && { contentHtml: imported.html }) };
      const c = await api<ContractDetail>('/contracts', { method: 'POST', body });
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
      // Trùng mã hợp đồng ⇒ báo ngay tại ô "Mã hợp đồng".
      if (err instanceof ApiError && err.status === 409 && err.message.startsWith('Mã hợp đồng')) setError('code', { message: err.message });
      toast.error(err instanceof Error ? err.message : 'Lưu thất bại');
    },
  });

  const applyPartner = (index: number, partnerId: string | undefined, picked?: Partner) => {
    const p = picked ?? partners.data?.items.find((x) => x.id === partnerId);
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
    setValue(`parties.${index}.partnerType`, partyTypeOf(p.type) || directionSuggestion(), { shouldValidate: true });
  };

  /**
   * Gợi ý phân loại bên đối tác theo chiều hợp đồng ghi trong tên mẫu/loại hợp đồng:
   * "… SAHA là bên bán", "bán ra" ⇒ đối tác là Khách hàng; "… là bên mua", "mua vào" ⇒ Nhà cung cấp.
   */
  const directionSuggestion = (): '' | 'CUSTOMER' | 'SUPPLIER' => {
    const tpl = templates.data?.items.find((t) => t.id === form.getValues('templateId'));
    const type = lookups.data?.contractTypes.find((t) => t.id === form.getValues('contractTypeId'));
    const text = foldVi(`${tpl?.name ?? ''} ${type?.name ?? ''}`);
    if (/la ben ban|ban ra/.test(text)) return 'CUSTOMER';
    if (/la ben mua|mua vao/.test(text)) return 'SUPPLIER';
    return '';
  };

  /** Điền gợi ý cho các bên đối tác chưa phân loại (khi chọn mẫu/loại hợp đồng). */
  const suggestEmptyPartyTypes = () => {
    const s = directionSuggestion();
    if (!s) return;
    form.getValues('parties').forEach((p, i) => {
      if (!p.isInternal && !p.partnerType) setValue(`parties.${i}.partnerType`, s);
    });
  };

  /** Tích "Bên nội bộ" ⇒ điền thông tin pháp nhân doanh nghiệp mình (Cài đặt → Thông tin doanh nghiệp). */
  const applyCompany = (index: number) => {
    const c = company.data;
    if (!c) return toast.error('Chưa tải được thông tin doanh nghiệp – thử lại sau giây lát');
    const set = (field: 'name' | 'taxCode' | 'address' | 'email' | 'phone' | 'representative' | 'position' | 'bankAccount', v: string | null) =>
      setValue(`parties.${index}.${field}`, v ?? '', { shouldValidate: field === 'name' || field === 'email' });
    setValue(`parties.${index}.partnerId`, '');
    setValue(`parties.${index}.partnerType`, '', { shouldValidate: true });
    setValue(`parties.${index}.entityType`, 'ORGANIZATION');
    set('name', c.name);
    set('taxCode', c.taxCode);
    set('address', c.address);
    set('email', c.email);
    set('phone', c.phone);
    set('representative', c.representative);
    set('position', c.position);
    set('bankAccount', c.bankAccount);
    if (!c.configured) toast.info('Đã điền thông tin lúc đăng ký doanh nghiệp. Bổ sung người đại diện, số tài khoản… ở Quản trị → Cấu hình → Thông tin doanh nghiệp.');
  };

  /** Bỏ tích "Bên nội bộ" ⇒ xóa thông tin đã điền để nhập bên khác. */
  const clearCompany = (index: number) => {
    for (const field of ['name', 'taxCode', 'address', 'email', 'phone', 'representative', 'position', 'bankAccount', 'authorizationRef'] as const)
      setValue(`parties.${index}.${field}`, '');
    setValue(`parties.${index}.partnerId`, '');
    setValue(`parties.${index}.partnerType`, directionSuggestion());
  };

  /** Mã nhập tay/điền từ file đã được dùng (kể cả hợp đồng trong thùng rác) ⇒ báo ngay tại ô mã, không đợi đến lúc lưu. */
  const checkCode = async (raw: string) => {
    const code = raw.trim();
    if (!code || isEdit) return;
    const r = await api<{ available: boolean; message?: string }>('/contracts/code-check', { query: { code } }).catch(() => null);
    if (!r || form.getValues('code').trim() !== code) return;
    if (r.available) form.clearErrors('code');
    else setError('code', { message: r.message ?? `Mã hợp đồng "${code}" đã tồn tại` });
  };

  /**
   * Điền sẵn form từ file Word (.docx; .doc được máy chủ chuyển sang .docx): chỉ điền ô còn trống, không ghi đè thông tin đã nhập.
   * Bên có MST trùng doanh nghiệp mình ⇒ đánh dấu "Bên nội bộ"; trùng đối tác trong danh mục ⇒ liên kết đối tác.
   */
  const applyDocx = async (file: File) => {
    let source: Blob = file;
    if (/\.doc$/i.test(file.name)) {
      // Word 97–2003: nhờ máy chủ chuyển sang .docx trước (vài giây).
      const id = toast.loading(`Đang đọc ${file.name} (định dạng Word cũ)…`);
      try {
        source = await convertDocToDocx(file);
        toast.dismiss(id);
      } catch (e) {
        toast.dismiss(id);
        return toast.error(e instanceof Error ? e.message : `Không đọc được ${file.name}`);
      }
    }
    const doc = await readDocx(source);
    if (!doc) return toast.error(`Không đọc được nội dung ${file.name} – hãy nhập thông tin thủ công`);
    const x = extractContractFields(doc.blocks);
    const filled: string[] = [];
    // Chép nội dung file Word làm nội dung hợp đồng (khi không dùng mẫu) để xem, in/xuất PDF, ký như hợp đồng soạn trong hệ thống.
    if (doc.html && !form.getValues('templateId')) {
      setImported({ name: file.name, html: doc.html, use: true });
      filled.push('nội dung hợp đồng');
    }
    const isBlank = (v: string) => !v.trim() || v.trim() === '0';
    const fileTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 500);
    const title = form.getValues('title');
    if (x.title && (isBlank(title) || title === fileTitle)) {
      setValue('title', x.title.slice(0, 500), { shouldValidate: true });
      filled.push('tên hợp đồng');
    }
    if (x.code && isBlank(form.getValues('code'))) {
      setValue('code', x.code);
      filled.push('số hợp đồng');
      void checkCode(x.code);
    }
    if (x.signDate && !form.getValues('expectedSignDate')) {
      setValue('expectedSignDate', x.signDate);
      filled.push('ngày ký');
    }
    if (x.value && isBlank(form.getValues('value'))) {
      setValue('value', x.value, { shouldValidate: true });
      if (x.currency) setValue('currency', x.currency);
      filled.push('giá trị');
    }
    if (x.vatRate !== undefined && !form.getValues('vatRate')) {
      setValue('vatRate', String(x.vatRate));
      filled.push('VAT');
    }
    let partiesFilled = 0;
    for (const p of x.parties) {
      let index = form.getValues('parties').findIndex((q) => q.role === p.role);
      if (index < 0) {
        parties.append(emptyParty(p.role));
        index = form.getValues('parties').length - 1;
      }
      if (form.getValues(`parties.${index}.name`).trim()) continue;
      for (const field of ['name', 'taxCode', 'address', 'email', 'phone', 'representative', 'position', 'bankAccount'] as const) {
        const v = p[field];
        if (v && !form.getValues(`parties.${index}.${field}`).trim()) {
          setValue(`parties.${index}.${field}`, v, { shouldValidate: field === 'name' || field === 'email' });
        }
      }
      partiesFilled++;
      const tax = p.taxCode?.replace(/\s/g, '');
      if (tax && company.data?.taxCode && company.data.taxCode.replace(/\s/g, '') === tax) {
        setValue(`parties.${index}.isInternal`, true);
        continue;
      }
      let known: Partner | undefined;
      if (tax) {
        const found = await api<Paginated<Partner>>('/partners', { query: { q: tax, pageSize: 5 } }).catch(() => null);
        known = found?.items.find((q) => q.taxCode?.replace(/\s/g, '') === tax);
        if (known) setValue(`parties.${index}.partnerId`, known.id);
      }
      // Phân loại: bên ghi "(Bên Mua)" ⇒ khách hàng, "(Bên Bán)" ⇒ nhà cung cấp; ngược với bên nội bộ; rồi theo danh mục/mẫu.
      const own = x.parties.find((q) => q !== p && company.data?.taxCode && q.taxCode?.replace(/\s/g, '') === company.data.taxCode.replace(/\s/g, ''));
      const side = p.side ?? (own?.side === 'BUY' ? 'SELL' : own?.side === 'SELL' ? 'BUY' : undefined);
      const suggested = side === 'BUY' ? 'CUSTOMER' : side === 'SELL' ? 'SUPPLIER' : partyTypeOf(known?.type) || directionSuggestion();
      if (suggested && !form.getValues(`parties.${index}.partnerType`)) setValue(`parties.${index}.partnerType`, suggested);
    }
    if (partiesFilled) filled.push(`${partiesFilled} bên tham gia`);
    if (filled.length) toast.success(`Đã điền từ ${file.name}: ${filled.join(', ')}`, { description: 'Kiểm tra lại thông tin trước khi lưu.', duration: 8000 });
    else toast.info(`Không tìm thấy thông tin để điền từ ${file.name}`);
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
        if (imported && !next.some((x) => x.name === imported.name)) setImported(null);
        // Gợi ý tên hợp đồng từ tên tệp đầu tiên nếu chưa nhập.
        if (added[0] && !form.getValues('title').trim()) {
          setValue('title', added[0].name.replace(/\.[^.]+$/, '').slice(0, 500), { shouldValidate: true });
        }
        // File Word: đọc nội dung để điền sẵn thông tin chung và các bên.
        const word = added.find((x) => /\.docx?$/i.test(x.name));
        if (word && !isEdit) void applyDocx(word);
      }}
    />
  );

  const importedCard = imported && (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung hợp đồng (từ {imported.name})</CardTitle>
        <CardDescription>
          Nội dung file Word được chép vào hợp đồng để xem, in/xuất PDF và ký; sau khi lưu có thể sửa tiếp ở tab “Nội dung hợp đồng”. Hình ảnh và đánh số tự động của
          Word không được chép.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={imported.use} onChange={(e) => setImported({ ...imported, use: e.target.checked })} /> Dùng nội dung này làm nội
          dung hợp đồng
        </label>
        {imported.use && (
          <div className="max-h-[480px] overflow-y-auto rounded-md border bg-white px-8 py-6 text-[#111]">
            {/* HTML do readDocx tạo (văn bản đã escape); máy chủ làm sạch lại khi lưu. */}
            <div className="contract-content" dangerouslySetInnerHTML={{ __html: imported.html }} />
          </div>
        )}
      </CardContent>
    </Card>
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
      {!isEdit && fromFile && importedCard}
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
                  onChange={(v) => {
                    field.onChange(v ?? '');
                    suggestEmptyPartyTypes();
                  }}
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
              {...register('code', { onBlur: (e) => void checkCode(e.target.value) })}
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
                <FilterSelect
                  className="w-full"
                  allLabel="— Chưa chọn —"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v ?? '');
                    suggestEmptyPartyTypes();
                  }}
                  options={(lookups.data?.contractTypes ?? []).map((t) => ({ value: t.id, label: t.name }))}
                />
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
                  {odooReady(odoo.data) && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setOdooPick(i)}>
                      <CloudDownload /> Chọn từ Odoo
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      {...register(`parties.${i}.isInternal`, { onChange: (e) => (e.target.checked ? applyCompany(i) : clearCompany(i)) })}
                    />{' '}
                    Bên nội bộ (doanh nghiệp mình)
                  </label>
                  {!watchedParties?.[i]?.isInternal && (
                    <Controller
                      control={control}
                      name={`parties.${i}.partnerType`}
                      render={({ field }) => (
                        <div className="flex items-center gap-2">
                          <Select value={field.value || undefined} onValueChange={field.onChange}>
                            <SelectTrigger className="w-44" aria-label="Phân loại đối tác" aria-invalid={!!pe?.partnerType}>
                              <SelectValue placeholder="Phân loại đối tác *" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CUSTOMER">Khách hàng</SelectItem>
                              <SelectItem value="SUPPLIER">Nhà cung cấp</SelectItem>
                            </SelectContent>
                          </Select>
                          {pe?.partnerType && <span className="text-xs text-destructive">{pe.partnerType.message}</span>}
                        </div>
                      )}
                    />
                  )}
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
                  <Field label="Số tài khoản (kèm ngân hàng)" className="md:col-span-3">
                    <Input {...register(`parties.${i}.bankAccount`)} />
                  </Field>
                </div>
              </div>
            );
          })}
          {parties.fields.length === 0 && <p className="text-sm text-muted-foreground">Chưa có bên tham gia.</p>}
        </CardContent>
      </Card>

      {!isEdit && !fromFile && filesPicker}
      {!isEdit && !fromFile && importedCard}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {isEdit ? 'Lưu thay đổi' : files.length ? `Lưu nháp và tải lên ${files.length} tệp` : 'Lưu nháp'}
        </Button>
      </div>
      <OdooPartnerDialog
        open={odooPick !== null}
        onOpenChange={(o) => !o && setOdooPick(null)}
        mode="pick"
        onPicked={(p) => odooPick !== null && applyPartner(odooPick, p.id, p)}
      />
    </form>
  );
}
