'use client';

import {
  buildTemplateValues,
  CONTRACT_CATEGORIES,
  CONTRACT_CATEGORY_LABELS,
  DEFAULT_ORDER_HTML,
  type DocBlock,
  extractContractFields,
  type ExtractedOrder,
  extractOrderFields,
  foldVi,
  formatQtyVi,
  itemAmount,
  orderTotals,
  renderTemplate,
  variableLabel,
} from '@saha/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  CircleCheck,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  CloudUpload,
  Coins,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  Info,
  LayoutTemplate,
  Loader2,
  type LucideIcon,
  PackagePlus,
  Paperclip,
  Pencil,
  Plus,
  Send,
  SlidersHorizontal,
  SquareCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cloneElement, isValidElement, useId, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, type UseFormReturn, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ContractEditor } from '@/components/contract-editor';
import { FilterSelect } from '@/components/filter-select';
import { CreateSteps } from '@/components/create-steps';
import { StatusPill } from '@/components/list-ui';
import { type Crumb, PageHeader } from '@/components/page-header';
import { OdooPartnerDialog } from '@/components/odoo-partner-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TemplatePreviewDialog } from '@/components/template-preview-dialog';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { type CompanyProfile, useCompanyProfile } from '@/lib/company';
import { convertDocToDocx, readDocx } from '@/lib/docx';
import { readPdfText } from '@/lib/pdf-text';
import { readXlsx } from '@/lib/xlsx';
import { attachMainDocument, DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, formatFileSize, uploadContractDocument } from '@/lib/documents';
import { formatMoney, toDateInput } from '@/lib/format';
import { odooReady, useOdooConfig } from '@/lib/odoo';
import { isPaymentTemplate } from '@/lib/payment-request';
import { useLookups } from '@/lib/queries';
import type { ContractDetail, ContractDocument, ContractKind, ContractListItem, Partner, Product, QuoteDetail, TemplateDetail, TemplateListItem } from '@/lib/types';

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

const qtyRegex = /^\d{1,15}(\.\d{1,3})?$/;
const moneyRegex = /^\d{1,18}(\.\d{1,2})?$/;

const itemSchema = z.object({
  productId: z.string(),
  code: z.string().trim().max(60),
  name: z.string().trim().min(1, 'Nhập tên hàng').max(500),
  unit: z.string().trim().max(30),
  quantity: z.string().trim().regex(qtyRegex, 'SL không hợp lệ').refine((v) => Number(v) > 0, 'SL phải > 0'),
  unitPrice: z.string().trim().regex(moneyRegex, 'Đơn giá không hợp lệ'),
});

const schema = z
  .object({
    code: z.string().trim().max(60),
    templateId: z.string(),
    title: z.string().trim().min(1, 'Vui lòng nhập tên hợp đồng').max(500),
    contractTypeId: z.string(),
    category: z.string(),
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
    // Đơn đặt hàng
    parentContractId: z.string(),
    deliveryDate: z.string(),
    deliveryAddress: z.string().max(500),
    paymentTerms: z.string().max(2000),
    items: z.array(itemSchema).max(200),
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

const presetParties = (p: Partner, c?: CompanyProfile): FormValues['parties'] => [
  {
    ...emptyParty('PARTY_A'),
    partnerId: p.id,
    entityType: p.entityType,
    name: p.name,
    taxCode: p.taxCode ?? '',
    address: p.address ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    representative: p.representative ?? '',
    position: p.position ?? '',
    partnerType: partyTypeOf(p.type),
  },
  c
    ? {
        ...emptyParty('PARTY_B'),
        isInternal: true,
        name: c.name,
        taxCode: c.taxCode ?? '',
        address: c.address ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        representative: c.representative ?? '',
        position: c.position ?? '',
        bankAccount: c.bankAccount ?? '',
      }
    : emptyParty('PARTY_B'),
];

const decimalInput = (v: string) => String(Number(v));

/** Ghi chú cho nội dung lấy từ file: định dạng nào giữ được gì. */
function importedNote(fileName: string, isOrder: boolean) {
  const noun = isOrder ? 'đơn' : 'hợp đồng';
  const after = `Sau khi lưu có thể sửa tiếp ở tab “Nội dung ${isOrder ? 'đơn hàng' : 'hợp đồng'}”.`;
  if (/\.pdf$/i.test(fileName)) return `Chữ trong PDF được chép vào ${noun} để xem, in/xuất PDF và ký; hãy đối chiếu với bản gốc vì bảng biểu thành các dòng chữ, hình ảnh không được chép. ${after}`;
  if (/\.xlsx$/i.test(fileName)) return `Trang tính đầu tiên của file Excel được chép vào ${noun} dưới dạng bảng; ô gộp, màu và hình ảnh không được chép. ${after}`;
  return `Nội dung file Word được chép vào ${noun} để xem, in/xuất PDF và ký. ${after} Hình ảnh và đánh số tự động của Word không được chép.`;
}

const quoteDefaults = (q: QuoteDetail, c?: CompanyProfile): Partial<FormValues> => ({
  title: `Đơn đặt hàng theo báo giá ${q.code}`,
  vatRate: q.vatRate === null ? '' : decimalInput(q.vatRate),
  paymentTerms: q.paymentTerms ?? '',
  deliveryAddress: q.customerAddress ?? '',
  parties: presetParties(
    {
      id: q.partnerId ?? '',
      entityType: 'ORGANIZATION',
      name: q.customerName,
      taxCode: q.customerTaxCode,
      address: q.customerAddress,
      email: q.customerEmail,
      phone: q.customerPhone,
      representative: q.customerContact,
      position: null,
      type: 'CUSTOMER',
    } as Partner,
    c,
  ),
  items: q.items.map((i) => ({ productId: i.productId ?? '', code: i.code ?? '', name: i.name, unit: i.unit ?? '', quantity: decimalInput(i.quantity), unitPrice: decimalInput(i.unitPrice) })),
});

function toForm(c?: ContractDetail, parentContractId = ''): FormValues {
  if (!c) {
    return {
      code: '', templateId: '', title: '', contractTypeId: '', category: '', group: '', description: '', value: '0', currency: 'VND', vatRate: '',
      expectedSignDate: '', effectiveDate: '', expiryDate: '', departmentId: '', ownerId: '', confidentiality: 'INTERNAL',
      tags: '', note: '', parties: [emptyParty('PARTY_A'), emptyParty('PARTY_B')],
      parentContractId, deliveryDate: '', deliveryAddress: '', paymentTerms: '', items: [],
    };
  }
  return {
    parentContractId: c.parentContractId ?? '',
    deliveryDate: toDateInput(c.deliveryDate),
    deliveryAddress: c.deliveryAddress ?? '',
    paymentTerms: c.paymentTerms ?? '',
    items: c.items.map((i) => ({
      productId: i.productId ?? '',
      code: i.code ?? '',
      name: i.name,
      unit: i.unit ?? '',
      quantity: decimalInput(i.quantity),
      unitPrice: decimalInput(i.unitPrice),
    })),
    code: c.code,
    templateId: c.template?.id ?? '',
    title: c.title,
    contractTypeId: c.contractTypeId ?? '',
    category: c.category ?? '',
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

function toPayload(v: FormValues, isEdit: boolean, kind: ContractKind) {
  const order =
    kind === 'ORDER'
      ? {
          parentContractId: nul(v.parentContractId),
          deliveryDate: nul(v.deliveryDate),
          deliveryAddress: nul(v.deliveryAddress),
          paymentTerms: nul(v.paymentTerms),
        }
      : {};
  // Dòng hàng: đơn đặt hàng và hợp đồng (vd mua bán) đều dùng; có dòng hàng thì giá trị tự tính từ dòng hàng.
  const items = v.items.map((i) => ({
    productId: nul(i.productId),
    code: nul(i.code),
    name: i.name,
    unit: nul(i.unit),
    quantity: i.quantity,
    unitPrice: i.unitPrice,
  }));
  const payload = {
    ...order,
    items,
    title: v.title,
    contractTypeId: nul(v.contractTypeId),
    // Đơn đặt hàng luôn là hợp đồng khách hàng (máy chủ tự gán khi tạo).
    ...(kind !== 'ORDER' && { category: nul(v.category) }),
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
  return isEdit ? { ...payload, code: v.code.trim() } : { ...payload, kind, code: nul(v.code), templateId: nul(v.templateId) };
}

function Field({ label, error, children, className }: { label: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
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
  isOrder,
  footer,
}: {
  files: File[];
  onChange: (files: File[], added: File[]) => void;
  required?: boolean;
  isOrder?: boolean;
  footer?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const tooBig = picked.filter((f) => f.size > DOCUMENT_MAX_BYTES);
    if (tooBig.length) toast.error(`Vượt quá 20 MB: ${tooBig.map((f) => f.name).join(', ')}`);
    const added = picked.filter((f) => f.size <= DOCUMENT_MAX_BYTES && !files.some((x) => x.name === f.name && x.size === f.size));
    if (added.length) onChange([...files, ...added], added);
    if (input.current) input.current.value = '';
  };
  return (
    <FormSection icon={Paperclip} title={required ? `${isOrder ? 'Tệp đơn đặt hàng' : 'Tệp hợp đồng'} *` : 'Tài liệu đính kèm'}>
      <div className="space-y-3">
        {required && (
          <p className="text-xs text-muted-foreground">
            {isOrder
              ? 'Tải lên đơn của khách (Word, Excel hoặc PDF có chữ): hệ thống tự điền số đơn, ngày, các bên, hàng hóa, giao hàng, thanh toán. Ảnh/PDF scan chỉ được đính kèm.'
              : 'Tải lên bản hợp đồng đã soạn sẵn (PDF khuyến nghị); Word/PDF có chữ được đọc để tự điền thông tin.'}
          </p>
        )}
        <input ref={input} type="file" accept={DOCUMENT_ACCEPT} multiple className="hidden" onChange={(e) => add(e.target.files)} aria-label="Chọn tệp hợp đồng" />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-primary/35 bg-primary/[0.02]'}`}
        >
          <CloudUpload className="size-9 text-primary" strokeWidth={1.6} aria-hidden />
          <span className="font-semibold">Kéo thả tài liệu vào đây</span>
          <span className="text-xs text-muted-foreground">
            hoặc{' '}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => input.current?.click()}>
              chọn tệp từ máy
            </button>
          </span>
          <Button type="button" variant="outline" size="sm" className="mt-2 border-primary/40 text-primary hover:text-primary" onClick={() => input.current?.click()}>
            <FolderOpen /> Chọn tệp
          </Button>
          <span className="mt-2 text-xs text-muted-foreground">Hỗ trợ: PDF, DOC, DOCX, XLSX, PNG, JPG (Tối đa 20 MB/tệp)</span>
        </div>
        {files.length > 0 && (
          <ul className="divide-y rounded-md border">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(f.size)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bỏ ${f.name}`} onClick={() => onChange(files.filter((x) => x !== f), [])}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {footer}
      </div>
    </FormSection>
  );
}

/** Form tạo mới; có `partnerId` (mở từ trang đối tác) thì tải đối tác trước để điền sẵn các bên. */
export function PartnerContractForm({
  partnerId,
  quoteId = '',
  ...props
}: {
  partnerId: string;
  quoteId?: string;
  fromFile?: boolean;
  kind?: ContractKind;
  parentId?: string;
  header?: CreateHeader;
  switchMode?: { href: string; label: string };
}) {
  const partner = useQuery({
    queryKey: ['partners', 'detail', partnerId],
    queryFn: () => api<Partner>(`/partners/${encodeURIComponent(partnerId)}`),
    enabled: !!partnerId,
    retry: false,
  });
  const quote = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => api<QuoteDetail>(`/quotes/${encodeURIComponent(quoteId)}`),
    enabled: !!quoteId,
    retry: false,
  });
  const company = useCompanyProfile(!!partnerId || !!quoteId);
  if ((partnerId && partner.isPending) || (quoteId && quote.isPending) || ((partnerId || quoteId) && company.isPending)) return <Skeleton className="h-96" />;
  return <ContractForm {...props} presetPartner={partner.data} presetCompany={company.data} presetQuote={quote.data} />;
}

export function ContractForm({
  contract,
  fromFile = false,
  kind: kindProp = 'CONTRACT',
  parentId = '',
  presetPartner,
  presetCompany,
  presetQuote,
  header,
  switchMode,
}: {
  contract?: ContractDetail;
  /** Trang tạo mới: tiêu đề, nút Hủy / Lưu bản nháp / Gửi phê duyệt và thanh các bước nằm trên đầu trang. */
  header?: CreateHeader;
  /** Liên kết đổi chế độ "Soạn trong hệ thống" ⇄ "Tạo từ file" (hiện dưới khung Tài liệu đính kèm). */
  switchMode?: { href: string; label: string };
  fromFile?: boolean;
  /** Lập đơn đặt hàng (dòng hàng, hợp đồng nguyên tắc, giao hàng) thay vì hợp đồng. */
  kind?: ContractKind;
  /** Đơn lập từ trang hợp đồng nguyên tắc. */
  parentId?: string;
  /** Hồ sơ lập từ trang đối tác: đối tác là Bên A, doanh nghiệp mình là Bên B. */
  presetPartner?: Partner;
  presetCompany?: CompanyProfile;
  /** Đơn lập từ báo giá: điền khách hàng, dòng hàng, VAT; lưu xong gắn đơn vào báo giá. */
  presetQuote?: QuoteDetail;
}) {
  const isEdit = !!contract;
  const kind: ContractKind = contract?.kind ?? kindProp;
  const isOrder = kind === 'ORDER';
  const noun = isOrder ? 'đơn hàng' : 'hợp đồng';
  const router = useRouter();
  const qc = useQueryClient();
  const lookups = useLookups();
  const [partnerSearch, setPartnerSearch] = useState('');
  const odoo = useOdooConfig();
  const company = useCompanyProfile();
  const { can } = useAuth();
  // Gửi phê duyệt ngay sau khi tạo cần quyền sửa hợp đồng (như nút Gửi phê duyệt ở tab Phê duyệt).
  const canSubmit = !isEdit && can('contract.update');
  const [odooPick, setOdooPick] = useState<number | null>(null);
  const partners = useQuery({
    queryKey: ['partners', 'picker', partnerSearch],
    queryFn: () => api<Paginated<Partner>>('/partners', { query: { q: partnerSearch, pageSize: 50 } }),
  });

  // Đối tác đặt sẵn có thể nằm ngoài 50 dòng đầu của danh sách chọn.
  const pickerItems = partners.data?.items ?? [];
  const partnerOptions = (presetPartner && !pickerItems.some((p) => p.id === presetPartner.id) ? [presetPartner, ...pickerItems] : pickerItems).map((p) => ({
    value: p.id,
    label: `${p.code} · ${p.name}`,
  }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...toForm(contract, parentId), ...(presetPartner && { parties: presetParties(presetPartner, presetCompany) }), ...(presetQuote && quoteDefaults(presetQuote, presetCompany)) },
  });
  const { register, control, formState, setError, setValue } = form;
  const errors = formState.errors;
  const parties = useFieldArray({ control, name: 'parties' });
  const watchedParties = useWatch({ control, name: 'parties' });

  const [files, setFiles] = useState<File[]>([]);
  const [moreOpen, setMoreOpen] = useState(isEdit);
  const moreRef = useRef<HTMLDivElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const templateRef = useRef<HTMLDivElement>(null);
  const [previewImported, setPreviewImported] = useState(false);
  const [editingImported, setEditingImported] = useState(false);
  /** Nội dung hợp đồng chuyển từ file Word (chỉ khi lập mới, không chọn mẫu). */
  const [imported, setImported] = useState<{ name: string; html: string; use: boolean } | null>(null);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async ({ v, intent }: { v: FormValues; intent: SaveIntent }) => {
      const submit = intent === 'approve';
      if (isEdit) {
        const c = await api<ContractDetail>(`/contracts/${contract.id}`, { method: 'PATCH', body: toPayload(v, true, kind) });
        return { c, uploaded: 0, failed: [] as string[], intent, submitError: undefined as string | undefined };
      }
      // Đơn chưa chọn loại ⇒ dùng loại "Đơn đặt hàng" đầu tiên để sinh mã theo mẫu của loại đó.
      const typeId = v.contractTypeId || (isOrder ? (kindTypes[0]?.id ?? '') : '');
      const body = { ...toPayload({ ...v, contractTypeId: typeId }, false, kind), ...(imported?.use && !v.templateId && { contentHtml: imported.html }) };
      const c = await api<ContractDetail>('/contracts', { method: 'POST', body });
      if (presetQuote) {
        // Đơn đã tạo thì giữ lại dù gắn vào báo giá lỗi.
        await api(`/quotes/${presetQuote.id}/link-order`, { method: 'POST', body: { orderId: c.id } }).catch((e: Error) => toast.error(`Đơn đã tạo nhưng chưa gắn được vào báo giá: ${e.message}`));
        qc.invalidateQueries({ queryKey: ['quotes'] });
        qc.invalidateQueries({ queryKey: ['quote', presetQuote.id] });
      }
      // Hợp đồng đã tạo thì giữ lại dù có tệp tải lên lỗi; người dùng tải lại ở tab Tài liệu.
      const failed: string[] = [];
      // Lập từ file: tệp đã đọc nội dung (hoặc tệp đầu tiên) được giữ nguyên định dạng làm bản gốc.
      const mainFile = fromFile ? (files.find((f) => f.name === imported?.name) ?? files[0]) : undefined;
      let mainUploaded: ContractDocument | undefined;
      for (const f of files) {
        try {
          const d = await uploadContractDocument(c.id, f);
          if (f === mainFile) mainUploaded = d;
        } catch (err) {
          failed.push(`${f.name}: ${err instanceof Error ? err.message : 'tải lên thất bại'}`);
        }
      }
      if (mainFile && mainUploaded) {
        await attachMainDocument(c.id, mainFile, mainUploaded).catch((e: Error) =>
          toast.warning(`Chưa tạo được bản gốc từ ${mainFile.name}: ${e.message}`, { description: 'Tệp vẫn được đính kèm; có thể đặt bản gốc ở tab Tài liệu.', duration: 10_000 }),
        );
      }
      // "Gửi phê duyệt": hồ sơ nháp đã lưu thì giữ lại dù gửi lỗi (thiếu nội dung, chưa có quy trình…) – gửi lại ở tab Phê duyệt.
      let submitError: string | undefined;
      if (submit) {
        await api(`/contracts/${c.id}/approval/submit`, { method: 'POST', body: {} }).catch((e: Error) => {
          submitError = e.message;
        });
      }
      return { c, uploaded: files.length - failed.length, failed, intent, submitError };
    },
    onSuccess: ({ c, uploaded, failed, intent, submitError }) => {
      const submit = intent === 'approve';
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['contract', c.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (isEdit) toast.success('Đã lưu thay đổi');
      else if (submit && !submitError) toast.success(`Đã tạo ${noun} ${c.code}${uploaded ? ` kèm ${uploaded} tệp` : ''} và gửi phê duyệt`);
      else toast.success(`Đã tạo ${noun} nháp ${c.code}${uploaded ? ` kèm ${uploaded} tệp` : ''}`);
      if (submitError) toast.error(`Đã lưu nháp nhưng chưa gửi phê duyệt được`, { description: submitError, duration: 15_000 });
      if (failed.length) toast.error(`Chưa tải lên được ${failed.length} tệp – thử lại ở tab Tài liệu`, { description: failed.join('\n'), duration: 15_000 });
      // "Lưu & tiếp tục" ⇒ bước 2: soạn nội dung (đã đính kèm tệp thì sang tab Tài liệu).
      const tab = submit ? 'approval' : files.length ? 'documents' : intent === 'continue' ? 'content' : '';
      router.push(tab ? `/contracts/${c.id}?tab=${tab}` : `/contracts/${c.id}`);
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

  /**
   * Đơn từ file: dòng hàng (khớp mã/tên với danh mục Sản phẩm để liên kết), giao hàng, thanh toán.
   * Chỉ điền khi form chưa có dòng hàng/ô còn trống – không ghi đè dữ liệu đã nhập.
   */
  const applyOrderFields = async (x: ExtractedOrder) => {
    const filled: string[] = [];
    if (x.items.length && !form.getValues('items').some((i) => i.name.trim())) {
      const catalog = await qc
        .fetchQuery({ queryKey: ['products', 'picker'], queryFn: () => api<Paginated<Product>>('/products', { query: { pageSize: 200 } }) })
        .catch(() => null);
      const byCode = new Map((catalog?.items ?? []).map((p) => [p.code.toLowerCase(), p]));
      const byName = new Map((catalog?.items ?? []).map((p) => [foldVi(p.name), p]));
      let matched = 0;
      setValue(
        'items',
        x.items.map((i) => {
          const p = (i.code && byCode.get(i.code.toLowerCase())) || byName.get(foldVi(i.name));
          if (p) matched++;
          return {
            productId: p?.id ?? '',
            code: i.code ?? p?.code ?? '',
            name: i.name,
            unit: i.unit ?? p?.unit ?? '',
            quantity: i.quantity,
            unitPrice: i.unitPrice !== '0' ? i.unitPrice : p ? String(Number(p.unitPrice)) : '0',
          };
        }),
        { shouldValidate: true },
      );
      filled.push(`${x.items.length} dòng hàng${matched ? ` (${matched} khớp danh mục sản phẩm)` : ''}`);
    }
    if (x.deliveryDate && !form.getValues('deliveryDate')) {
      setValue('deliveryDate', x.deliveryDate);
      filled.push('ngày giao');
    }
    if (x.deliveryAddress && !form.getValues('deliveryAddress').trim()) {
      setValue('deliveryAddress', x.deliveryAddress.slice(0, 500));
      filled.push('địa điểm giao');
    }
    if (x.paymentTerms && !form.getValues('paymentTerms').trim()) {
      setValue('paymentTerms', x.paymentTerms.slice(0, 2000));
      filled.push('điều kiện thanh toán');
    }
    return filled;
  };

  /** Chọn hợp đồng nguyên tắc ⇒ chép các bên của hợp đồng đó nếu đơn chưa nhập bên nào. */
  const applyParentParties = async (parentContractId: string) => {
    if (!parentContractId || form.getValues('parties').some((p) => p.name.trim())) return;
    const parent = await api<ContractDetail>(`/contracts/${parentContractId}`).catch(() => null);
    if (!parent) return;
    form.setValue('parties', toForm(parent).parties, { shouldValidate: true });
    toast.success(`Đã lấy các bên từ hợp đồng ${parent.code}`);
  };

  /** Mã nhập tay/điền từ file đã được dùng (kể cả hợp đồng trong thùng rác) ⇒ báo ngay tại ô mã, không đợi đến lúc lưu. */
  const checkCode = async (raw: string) => {
    const code = raw.trim();
    if (!code || (isEdit && code === contract.code)) return;
    const r = await api<{ available: boolean; message?: string }>('/contracts/code-check', { query: { code } }).catch(() => null);
    if (!r || form.getValues('code').trim() !== code) return;
    if (r.available) form.clearErrors('code');
    else setError('code', { message: r.message ?? `Mã hợp đồng "${code}" đã tồn tại` });
  };

  /**
   * Điền sẵn form từ file Word (.docx; .doc được máy chủ chuyển sang .docx) hoặc PDF có lớp chữ: chỉ điền ô còn trống, không ghi đè thông tin đã nhập.
   * Bên có MST trùng doanh nghiệp mình ⇒ đánh dấu "Bên nội bộ"; trùng đối tác trong danh mục ⇒ liên kết đối tác.
   */
  const applyDocx = async (file: File) => {
    let doc: { blocks: DocBlock[]; html?: string } | null = null;
    if (/\.docx?$/i.test(file.name)) {
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
      doc = await readDocx(source);
    } else if (/\.xlsx$/i.test(file.name)) {
      doc = await readXlsx(file).catch(() => null);
    } else if (/\.pdf$/i.test(file.name)) {
      const id = toast.loading(`Đang đọc ${file.name}…`);
      const pdf = await readPdfText(file).catch(() => null);
      toast.dismiss(id);
      if (!pdf) return toast.info(`${file.name} là PDF dạng ảnh scan – chưa tự đọc được. Tệp vẫn được đính kèm; hãy nhập thông tin${isOrder ? ' và hàng hóa' : ''} thủ công.`, { duration: 10_000 });
      doc = pdf;
    } else if (/\.(png|jpe?g)$/i.test(file.name)) {
      return toast.info(`${file.name} là ảnh – chưa tự đọc được. Tệp vẫn được đính kèm; hãy nhập thông tin và hàng hóa thủ công.`, { duration: 10_000 });
    }
    if (!doc) return toast.error(`Không đọc được nội dung ${file.name} – hãy nhập thông tin thủ công`);
    const x: ExtractedOrder = isOrder ? extractOrderFields(doc.blocks) : { ...extractContractFields(doc.blocks), items: [] };
    const filled: string[] = [];
    // Chép nội dung file (Word, PDF có lớp chữ, Excel) làm nội dung hợp đồng/đơn theo đúng cấu trúc file, không theo mẫu
    // (khi chưa chọn mẫu) để xem, in/xuất PDF, ký như hồ sơ soạn trong hệ thống.
    if (doc.html && !form.getValues('templateId')) {
      setImported({ name: file.name, html: doc.html, use: true });
      filled.push(`nội dung ${noun}`);
    }
    const isBlank = (v: string) => !v.trim() || v.trim() === '0';
    const fileTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 500);
    const title = form.getValues('title');
    if (x.title && (isBlank(title) || title === fileTitle)) {
      setValue('title', x.title.slice(0, 500), { shouldValidate: true });
      filled.push(isOrder ? 'tên đơn' : 'tên hợp đồng');
    }
    if (x.code && isBlank(form.getValues('code'))) {
      setValue('code', x.code);
      filled.push(isOrder ? 'số đơn' : 'số hợp đồng');
      void checkCode(x.code);
    }
    if (x.signDate && !form.getValues('expectedSignDate')) {
      setValue('expectedSignDate', x.signDate);
      filled.push(isOrder ? 'ngày đặt hàng' : 'ngày ký');
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
    // Mở từ trang đối tác: đối tác đặt sẵn ở Bên A, nhưng file có thể ghi đối tác ở bên khác ⇒ đổi vai trò theo file.
    if (presetPartner && x.parties.length) {
      const tax = presetPartner.taxCode?.replace(/\s/g, '');
      const inFile = x.parties.find((q) => (tax && q.taxCode?.replace(/\s/g, '') === tax) || (q.name && foldVi(q.name) === foldVi(presetPartner.name)));
      const current = form.getValues('parties').findIndex((q) => q.partnerId === presetPartner.id);
      if (!inFile) {
        toast.warning(`Không thấy ${presetPartner.name} trong các bên ghi ở ${file.name}`, { description: 'Kiểm tra lại đây có đúng là file của đối tác này không.', duration: 8000 });
      } else if (current >= 0 && form.getValues(`parties.${current}.role`) !== inFile.role) {
        const other = form.getValues('parties').findIndex((q) => q.role === inFile.role);
        if (other >= 0) setValue(`parties.${other}.role`, form.getValues(`parties.${current}.role`));
        setValue(`parties.${current}.role`, inFile.role);
      }
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
    if (isOrder) filled.push(...(await applyOrderFields(x)));
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
  // Loại và mẫu theo đúng loại chứng từ: đơn chỉ thấy loại/mẫu "Đơn đặt hàng"; mẫu chưa gắn loại dùng được cho cả hai,
  // trừ mẫu đề nghị thanh toán (chỉ dùng ở trang Đề nghị thanh toán).
  const kindTypes = (lookups.data?.contractTypes ?? []).filter((t) => (t.kind ?? 'CONTRACT') === kind);
  const typeKind = (id?: string) => lookups.data?.contractTypes.find((t) => t.id === id)?.kind ?? 'CONTRACT';
  const kindTemplates = (templates.data?.items ?? []).filter((t) => (t.contractType ? typeKind(t.contractType.id) === kind : !isPaymentTemplate(t)));
  const selectedTemplate = templates.data?.items.find((t) => t.id === templateId);
  const selectedType =
    lookups.data?.contractTypes.find((t) => t.id === contractTypeId) ??
    (selectedTemplate?.contractType ? lookups.data?.contractTypes.find((t) => t.id === selectedTemplate.contractType?.id) : undefined) ??
    (isOrder ? kindTypes[0] : undefined);

  const filesPicker = (
    <ContractFilesPicker
      files={files}
      required={fromFile}
      isOrder={isOrder}
      footer={
        (switchMode || (!fromFile && !isOrder)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            {!fromFile && (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => templateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Chưa có file? Chọn mẫu {isOrder ? 'đơn' : 'hợp đồng'}
              </button>
            )}
            {switchMode && (
              <Link href={switchMode.href} className="font-medium text-primary hover:underline">
                {switchMode.label}
              </Link>
            )}
          </div>
        )
      }
      onChange={(next, added) => {
        setFiles(next);
        if (imported && !next.some((x) => x.name === imported.name)) setImported(null);
        // Gợi ý tên hợp đồng từ tên tệp đầu tiên nếu chưa nhập.
        if (added[0] && !form.getValues('title').trim()) {
          setValue('title', added[0].name.replace(/\.[^.]+$/, '').slice(0, 500), { shouldValidate: true });
        }
        // File Word, PDF có lớp chữ: đọc nội dung để điền sẵn thông tin chung và các bên.
        // Đơn đặt hàng còn đọc được Excel (ảnh/PDF scan chỉ đính kèm).
        const readable = isOrder ? /\.(docx?|xlsx|pdf|png|jpe?g)$/i : /\.(docx?|pdf)$/i;
        const source = added.find((x) => /\.docx?$/i.test(x.name)) ?? added.find((x) => readable.test(x.name));
        if (source && !isEdit) void applyDocx(source);
      }}
    />
  );

  const importedCard = imported && (
    // overflow-visible: Card mặc định overflow-hidden làm thanh công cụ trình soạn thảo không "dính" khi cuộn.
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>Nội dung {isOrder ? 'đơn đặt hàng' : 'hợp đồng'} (từ {imported.name})</CardTitle>
        <CardDescription>
          {importedNote(imported.name, isOrder)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={imported.use} onChange={(e) => setImported({ ...imported, use: e.target.checked })} /> Dùng nội dung này làm nội
            dung {noun}
          </label>
          {imported.use && (
            <div className="ml-auto flex gap-2">
              <Button type="button" variant={editingImported ? 'secondary' : 'outline'} size="sm" onClick={() => setEditingImported((x) => !x)}>
                {editingImported ? <Check /> : <Pencil />} {editingImported ? 'Xong' : 'Chỉnh sửa'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewImported(true)}>
                <Eye /> Xem trước trên A4
              </Button>
            </div>
          )}
        </div>
        {imported.use &&
          (editingImported ? (
            // Sửa ngay trước khi lưu (thêm, xóa dòng, gộp ô, căn lề…); bản gốc vẫn giữ nguyên file tải lên.
            <ContractEditor value={imported.html} onChange={(html) => setImported((x) => (x ? { ...x, html } : x))} enableClauses />
          ) : (
            <div className="max-h-[480px] overflow-y-auto rounded-md border bg-white px-8 py-6 text-[#111]">
              {/* HTML do readDocx tạo (văn bản đã escape); máy chủ làm sạch lại khi lưu. */}
              <div className="contract-content" dangerouslySetInnerHTML={{ __html: imported.html }} />
            </div>
          ))}
        {previewImported && (
          <Dialog open onOpenChange={(o) => !o && setPreviewImported(false)}>
            <DialogContent className="max-h-[92vh] max-w-[min(96vw,980px)] overflow-hidden p-0 sm:max-w-[min(96vw,980px)]">
              <div className="flex max-h-[92vh] flex-col">
                <DialogHeader className="border-b px-5 pt-5 pb-3">
                  <DialogTitle>Xem trước trên A4 – {imported.name}</DialogTitle>
                  <DialogDescription>Nội dung {noun} như khi in, xuất PDF và ký. Bản gốc giữ nguyên định dạng file được lưu kèm sau khi lưu {noun}.</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
                  <div className="a4-page">
                    <div className="contract-content" dangerouslySetInnerHTML={{ __html: imported.html }} />
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );

  // Tóm tắt và danh sách kiểm tra cập nhật theo dữ liệu đang nhập.
  const w = useWatch({ control });
  const orderItems = (w.items ?? []).filter((i): i is { name: string; quantity: string; unitPrice: string } => !!i && qtyRegex.test(i.quantity ?? '') && moneyRegex.test(i.unitPrice ?? ''));
  // Có dòng hàng (đơn, hoặc hợp đồng mua bán có bảng hàng) ⇒ giá trị trước thuế tự tính từ dòng hàng.
  const itemPriced = isOrder || (w.items?.length ?? 0) > 0;
  const pretax = itemPriced ? Number(orderItems.length ? orderTotals(orderItems).subtotal : 0) : moneyRegex.test(w.value ?? '') ? Number(w.value) : 0;
  const vatPercent = w.vatRate && /^\d{1,3}(\.\d{1,2})?$/.test(w.vatRate) ? Number(w.vatRate) : 0;
  const vatAmount = Math.round((pretax * vatPercent) / 100);
  const currency = w.currency || 'VND';
  const currencySign = currency === 'VND' ? 'đ' : currency;
  const allParties = w.parties ?? [];
  const namedParties = allParties.filter((p) => p?.name?.trim());
  const counterpart = namedParties.find((p) => !p?.isInternal) ?? namedParties[0];
  const departmentName = lookups.data?.departments.find((d) => d.id === w.departmentId)?.name ?? (isEdit ? '—' : 'Phòng ban của tôi');
  const ownerName = lookups.data?.users.find((u) => u.id === w.ownerId)?.fullName ?? (isEdit ? '—' : 'Tôi');
  const descriptionLength = w.description?.length ?? 0;
  const hasDocument = !!w.templateId || !!imported?.use || files.length > 0;
  const partiesNote =
    namedParties.length < 2
      ? 'cần ít nhất 2 bên'
      : !namedParties.every((p) => p?.isInternal || !!p?.partnerType)
        ? 'chưa phân loại đối tác'
        : !namedParties.every((p) => p?.taxCode?.trim() && p?.representative?.trim())
          ? 'thiếu MST / người đại diện'
          : '';
  const termOk = !!w.effectiveDate && !!w.expiryDate && w.expiryDate >= w.effectiveDate;
  const checks: { label: string; ok: boolean; note?: string }[] = [
    { label: isOrder ? 'Tên đơn hàng' : 'Tên hợp đồng', ok: !!w.title?.trim() },
    { label: isOrder ? 'Loại đơn' : 'Loại hợp đồng', ok: !!selectedType },
    { label: 'Phòng ban', ok: true },
    { label: 'Người phụ trách', ok: true },
    ...(isEdit ? [] : [{ label: isOrder ? 'Tài liệu đơn hàng' : 'Tài liệu hợp đồng', ok: hasDocument, note: 'chưa đính kèm' }]),
    { label: 'Thông tin các bên tham gia', ok: !partiesNote, note: partiesNote },
    { label: isOrder ? 'Hàng hóa và đơn giá' : 'Giá trị hợp đồng', ok: pretax > 0, note: isOrder ? 'chưa có dòng hàng' : 'chưa nhập' },
    ...(isOrder ? [] : [{ label: 'Thời hạn hợp đồng', ok: termOk, note: w.effectiveDate && w.expiryDate ? 'ngày hết hạn trước ngày hiệu lực' : 'chưa nhập ngày' }]),
  ];
  const vatOptions = ['0', '5', '8', '10'];
  const pendingIntent = save.isPending ? (save.variables?.intent ?? 'draft') : null;

  const submit = (intent: SaveIntent) =>
    form.handleSubmit((v) => {
      if (fromFile && !files.length) return toast.error(`Chọn ít nhất một tệp ${noun}`);
      save.mutate({ v, intent });
    });

  const req = (label: React.ReactNode) => (
    <>
      {label} <span className="text-destructive">*</span>
    </>
  );

  /** Bên mua/bán: đối tác là khách hàng ⇒ bên mua; nhà cung cấp ⇒ bên bán; bên nội bộ ngược lại với đối tác. */
  const sideOf = (i: number) => {
    const p = allParties[i];
    if (!p) return '';
    let type = p.partnerType;
    if (p.isInternal) {
      const other = allParties.find((q) => q && !q.isInternal && q.partnerType)?.partnerType;
      type = other === 'CUSTOMER' ? 'SUPPLIER' : other === 'SUPPLIER' ? 'CUSTOMER' : '';
    }
    return type === 'CUSTOMER' ? 'Bên mua' : type === 'SUPPLIER' ? 'Bên bán' : '';
  };

  /** Chọn mẫu: đổi mẫu ⇒ gợi ý phân loại bên; mẫu gắn loại hợp đồng mà form chưa chọn loại ⇒ điền loại theo mẫu. */
  const pickTemplate = (id: string) => {
    setValue('templateId', id, { shouldDirty: true });
    const t = kindTemplates.find((x) => x.id === id);
    if (t?.contractType && !form.getValues('contractTypeId') && kindTypes.some((k) => k.id === t.contractType?.id)) {
      setValue('contractTypeId', t.contractType.id, { shouldDirty: true });
    }
    suggestEmptyPartyTypes();
  };
  const templateQuery = foldVi(templateSearch.trim());
  const shownTemplates = templateQuery
    ? kindTemplates.filter((t) => foldVi(`${t.name} ${t.code} ${t.description ?? ''} ${t.contractType?.name ?? ''}`).includes(templateQuery))
    : kindTemplates;

  const templatePicker = !isEdit && (!fromFile || isOrder) && (
    <div ref={templateRef} className="scroll-mt-20">
      <FormSection
        icon={LayoutTemplate}
        title={isOrder ? 'Mẫu đơn đặt hàng' : 'Mẫu hợp đồng'}
        action={
          kindTemplates.length > 4 && (
            <Input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Tìm mẫu…"
              className="hidden h-8 w-48 sm:block"
              aria-label="Tìm mẫu"
            />
          )
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          {isOrder
            ? 'Chọn mẫu đơn có sẵn, hoặc dùng nội dung đơn mặc định có sẵn bảng hàng hóa. Bấm “Xem trước” để xem mẫu trên trang A4.'
            : 'Chọn mẫu để sao chép sẵn nội dung và loại hợp đồng; bấm “Xem trước” để xem mẫu trên trang A4 trước khi chọn. Có thể soạn lại nội dung sau khi tạo.'}
        </p>
        {kindTemplates.length > 4 && (
          <Input value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} placeholder="Tìm mẫu…" className="mb-3 sm:hidden" aria-label="Tìm mẫu" />
        )}
        {templates.isPending ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="grid max-h-[26rem] gap-3 overflow-y-auto p-0.5 sm:grid-cols-2" role="radiogroup" aria-label={isOrder ? 'Mẫu đơn đặt hàng' : 'Mẫu hợp đồng'}>
            <TemplateChoice
              selected={!templateId}
              onSelect={() => pickTemplate('')}
              icon={FilePlus2}
              title={isOrder ? 'Nội dung đơn mặc định' : 'Soạn từ đầu'}
              description={isOrder ? 'Đơn đặt hàng chuẩn có sẵn bảng hàng hóa.' : 'Không dùng mẫu; soạn nội dung ở bước tiếp theo.'}
            />
            {shownTemplates.map((t) => (
              <TemplateChoice
                key={t.id}
                selected={templateId === t.id}
                onSelect={() => pickTemplate(t.id)}
                icon={FileText}
                title={t.name}
                sub={`${t.code} · v${t.version}`}
                badge={t.contractType?.name}
                description={t.description ?? undefined}
                onPreview={() => setPreviewId(t.id)}
              />
            ))}
            {templateQuery && shownTemplates.length === 0 && <p className="py-4 text-sm text-muted-foreground sm:col-span-2">Không tìm thấy mẫu phù hợp “{templateSearch}”.</p>}
          </div>
        )}
        {selectedTemplate && selectedTemplate.requiredVariables.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Mẫu cần dữ liệu: {selectedTemplate.requiredVariables.map((k) => variableLabel(k)).join(', ')}
          </p>
        )}
        {!templates.isPending && kindTemplates.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Chưa có mẫu đang dùng được – tạo mẫu ở Soạn thảo → Mẫu hợp đồng.</p>
        )}
      </FormSection>
      {previewId && (
        <TemplatePreviewDialog
          templateId={previewId}
          kind={kind}
          open
          onClose={() => setPreviewId(null)}
          onUse={
            templateId === previewId
              ? undefined
              : () => {
                  pickTemplate(previewId);
                  setPreviewId(null);
                  toast.success('Đã chọn mẫu');
                }
          }
        />
      )}
    </div>
  );

  return (
    <>
      {header && (
        <>
          <PageHeader
            title={header.title}
            description={header.description}
            crumbs={header.crumbs}
            actions={
              <>
                <Button type="button" variant="outline" className="h-10 min-w-24" onClick={() => router.back()}>
                  Hủy
                </Button>
                <Button type="button" variant="outline" className="h-10 border-primary/30 px-5 font-semibold text-primary hover:text-primary" disabled={save.isPending} onClick={submit('draft')}>
                  {pendingIntent === 'draft' && <Loader2 className="animate-spin" />}
                  Lưu bản nháp
                </Button>
                {canSubmit && (
                  <Button type="button" className="h-10 px-5 font-semibold" disabled={save.isPending} onClick={submit('approve')}>
                    {pendingIntent === 'approve' ? <Loader2 className="animate-spin" /> : <Send />}
                    Gửi phê duyệt
                  </Button>
                )}
              </>
            }
          />
          <CreateSteps />
        </>
      )}
      <form id="contract-form" onSubmit={submit(isEdit ? 'draft' : 'continue')} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start" noValidate>
        <div className="min-w-0 space-y-5">
          {templatePicker}
          <FormSection icon={FileText} title={isOrder ? 'Thông tin đơn hàng' : 'Thông tin hợp đồng'}>
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              <Field label={req(isOrder ? 'Tên đơn hàng' : 'Tên hợp đồng')} error={errors.title?.message}>
                <Input aria-invalid={!!errors.title} placeholder={isOrder ? 'Nhập tên đơn hàng' : 'Nhập tên hợp đồng'} {...register('title')} />
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {req(isOrder ? 'Số đơn hàng' : 'Mã hợp đồng')}
                    <span title={`Để trống để hệ thống tự sinh${selectedType ? ` theo mẫu ${selectedType.codePattern}` : ''}; hoặc nhập mã riêng.`}>
                      <Info className="size-3.5 text-muted-foreground" aria-hidden />
                    </span>
                  </span>
                }
                error={errors.code?.message}
              >
                <Input
                  aria-invalid={!!errors.code}
                  className="bg-muted/70 focus-visible:bg-card"
                  placeholder={isEdit ? `Nhập ${isOrder ? 'số đơn hàng' : 'mã hợp đồng'}` : `Tự sinh: ${selectedType?.codePattern ?? 'HD-{YYYY}-{SEQUENCE:5}'}`}
                  {...register('code', { onBlur: (e) => void checkCode(e.target.value) })}
                />
              </Field>
              <Field label={req(isOrder ? 'Loại đơn' : 'Loại hợp đồng')}>
                <Controller
                  control={control}
                  name="contractTypeId"
                  render={({ field }) => (
                    <FilterSelect
                      className="w-full"
                      allLabel={isOrder && kindTypes[0] ? `${kindTypes[0].name} (mặc định)` : '— Chọn loại —'}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        suggestEmptyPartyTypes();
                      }}
                      options={kindTypes.map((t) => ({ value: t.id, label: t.name }))}
                      ariaLabel={isOrder ? 'Loại đơn' : 'Loại hợp đồng'}
                    />
                  )}
                />
              </Field>
              <Field label={req('Phòng ban')}>
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <FilterSelect className="w-full" allLabel="Phòng ban của tôi" value={field.value} onChange={(v) => field.onChange(v ?? '')} options={(lookups.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} ariaLabel="Phòng ban" />
                  )}
                />
              </Field>
              <Field label={req('Người phụ trách')}>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Controller
                    control={control}
                    name="ownerId"
                    render={({ field }) => (
                      <FilterSelect className="w-full pl-9" allLabel="Tôi" value={field.value} onChange={(v) => field.onChange(v ?? '')} options={(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.fullName }))} ariaLabel="Người phụ trách" />
                    )}
                  />
                </div>
              </Field>
              <Field label={isOrder ? 'Mô tả đơn hàng' : 'Mô tả hợp đồng'} error={errors.description?.message} className="md:col-span-2">
                <div>
                  <Textarea rows={3} maxLength={5000} placeholder={`Mô tả ngắn gọn nội dung ${noun}…`} aria-label="Mô tả" {...register('description')} />
                  <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">{descriptionLength} / 5000</p>
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection
            icon={Users}
            title="Các bên tham gia"
            action={
              <>
                <Input placeholder="Lọc danh sách đối tác…" value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} className="hidden h-8 w-48 sm:block" aria-label="Lọc đối tác" />
                <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => parties.append(emptyParty(parties.fields.length === 0 ? 'PARTY_A' : parties.fields.length === 1 ? 'PARTY_B' : 'PARTY_C'))}>
                  <Plus /> Thêm bên
                </Button>
              </>
            }
          >
            <div className="grid gap-5 md:grid-cols-2">
              {parties.fields.map((f, i) => {
                const pe = errors.parties?.[i];
                const internal = !!watchedParties?.[i]?.isInternal;
                const role = PARTY_ROLES.find((r) => r.value === watchedParties?.[i]?.role)?.label ?? 'Bên';
                const side = sideOf(i);
                return (
                  <div key={f.id} className="min-w-0 overflow-hidden rounded-lg border">
                    <div className="flex items-center gap-2 bg-primary/10 px-4 py-2">
                      <span className="min-w-0 flex-1 truncate font-semibold text-[oklch(0.35_0.15_277)] dark:text-primary">
                        {req(`${role}${side ? ` (${side})` : ''}`)}
                      </span>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Bên nội bộ (doanh nghiệp mình)">
                        <input
                          type="checkbox"
                          className="size-3.5"
                          {...register(`parties.${i}.isInternal`, { onChange: (e) => (e.target.checked ? applyCompany(i) : clearCompany(i)) })}
                        />
                        Nội bộ
                      </label>
                      <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-label="Xóa bên" onClick={() => parties.remove(i)}>
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="space-y-2.5 p-4">
                      {!internal && (
                        <div className="flex flex-wrap items-start gap-2 pb-1">
                          <Controller
                            control={control}
                            name={`parties.${i}.partnerId`}
                            render={({ field }) => (
                              <FilterSelect className="h-8 w-full min-w-0 flex-1 basis-40" allLabel="— Nhập thủ công —" value={field.value} onChange={(v) => applyPartner(i, v)} options={partnerOptions} ariaLabel="Chọn đối tác" />
                            )}
                          />
                          <Controller
                            control={control}
                            name={`parties.${i}.partnerType`}
                            render={({ field }) => (
                              <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <SelectTrigger size="sm" className="w-36" aria-label="Phân loại đối tác" aria-invalid={!!pe?.partnerType}>
                                  <SelectValue placeholder="Phân loại *" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CUSTOMER">Khách hàng</SelectItem>
                                  <SelectItem value="SUPPLIER">Nhà cung cấp</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {odooReady(odoo.data) && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setOdooPick(i)}>
                              <CloudDownload /> Odoo
                            </Button>
                          )}
                          {pe?.partnerType && <p className="w-full text-xs text-destructive">{pe.partnerType.message}</p>}
                        </div>
                      )}
                      <PartyRow label={req(`Tên ${role.charAt(0).toLowerCase()}${role.slice(1)}`)} error={pe?.name?.message}>
                        <Input className="h-8" aria-label={`Tên ${role}`} {...register(`parties.${i}.name`)} />
                      </PartyRow>
                      <PartyRow label={req('Mã số thuế')}>
                        <Input className="h-8" aria-label="Mã số thuế" {...register(`parties.${i}.taxCode`)} />
                      </PartyRow>
                      <PartyRow label={req('Đại diện bởi')}>
                        <Input className="h-8" aria-label="Người đại diện" {...register(`parties.${i}.representative`)} />
                      </PartyRow>
                      <PartyRow label={req('Chức vụ')}>
                        <Input className="h-8" aria-label="Chức vụ" {...register(`parties.${i}.position`)} />
                      </PartyRow>
                      <details className="group pt-1">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary select-none">
                          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Thông tin khác (địa chỉ, liên hệ…)
                        </summary>
                        <div className="mt-2.5 space-y-2.5">
                          <PartyRow label="Vai trò">
                            <Controller
                              control={control}
                              name={`parties.${i}.role`}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger size="sm" className="w-full" aria-label="Vai trò"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {PARTY_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </PartyRow>
                          <PartyRow label="Địa chỉ">
                            <Input className="h-8" aria-label="Địa chỉ" {...register(`parties.${i}.address`)} />
                          </PartyRow>
                          <PartyRow label="Email" error={pe?.email?.message}>
                            <Input className="h-8" type="email" aria-label="Email" {...register(`parties.${i}.email`)} />
                          </PartyRow>
                          <PartyRow label="Điện thoại">
                            <Input className="h-8" aria-label="Số điện thoại" {...register(`parties.${i}.phone`)} />
                          </PartyRow>
                          <PartyRow label="Căn cứ ủy quyền">
                            <Input className="h-8" aria-label="Căn cứ đại diện / ủy quyền" {...register(`parties.${i}.authorizationRef`)} />
                          </PartyRow>
                          <PartyRow label="Số tài khoản">
                            <Input className="h-8" aria-label="Số tài khoản (kèm ngân hàng)" placeholder="Số tài khoản – ngân hàng" {...register(`parties.${i}.bankAccount`)} />
                          </PartyRow>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
            {parties.fields.length === 0 && <p className="text-sm text-muted-foreground">Chưa có bên tham gia – bấm “Thêm bên”.</p>}
          </FormSection>

          <FormSection icon={Coins} title={isOrder ? 'Giá trị & ngày đặt hàng' : 'Giá trị & thời hạn'}>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-8">
              <div className="space-y-3">
                <PartyRow label={req(isOrder ? 'Giá trị (chưa VAT)' : 'Giá trị trước thuế')} labelClassName="w-32" error={errors.value?.message}>
                  {itemPriced ? (
                    <OrderValue form={form} />
                  ) : (
                    <div className="relative">
                      <Input inputMode="decimal" className="pr-10" aria-label="Giá trị trước thuế" aria-invalid={!!errors.value} {...register('value')} />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{currencySign}</span>
                    </div>
                  )}
                </PartyRow>
                <PartyRow label={req('Thuế GTGT')} labelClassName="w-32" error={errors.vatRate?.message}>
                  <Controller
                    control={control}
                    name="vatRate"
                    render={({ field }) => (
                      <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                        <SelectTrigger className="w-full" aria-label="Thuế GTGT"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Không chịu thuế</SelectItem>
                          {(field.value && !vatOptions.includes(field.value) ? [...vatOptions, field.value] : vatOptions).map((r) => (
                            <SelectItem key={r} value={r}>{r}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </PartyRow>
                <PartyRow label={req('Tổng giá trị')} labelClassName="w-32">
                  <div className="rounded-md bg-primary/10 px-3 py-1.5 text-base font-bold whitespace-nowrap text-primary tabular-nums">{formatMoney(pretax + vatAmount, currency).replace('₫', 'đ')}</div>
                </PartyRow>
              </div>
              <div className="hidden bg-border md:block" aria-hidden />
              <div className="space-y-3">
                {isOrder ? (
                  <PartyRow label="Ngày đặt hàng" labelClassName="w-32">
                    <Input type="date" aria-label="Ngày đặt hàng" {...register('expectedSignDate')} />
                  </PartyRow>
                ) : (
                  <>
                    <PartyRow label={req('Ngày hiệu lực')} labelClassName="w-32">
                      <Input type="date" aria-label="Ngày hiệu lực" {...register('effectiveDate')} />
                    </PartyRow>
                    <PartyRow label={req('Ngày hết hạn')} labelClassName="w-32" error={errors.expiryDate?.message}>
                      <Input type="date" aria-label="Ngày hết hạn" aria-invalid={!!errors.expiryDate} {...register('expiryDate')} />
                    </PartyRow>
                  </>
                )}
              </div>
            </div>
          </FormSection>

          {isOrder && <OrderDeliveryCard form={form} onParentPicked={applyParentParties} />}
          <OrderItemsCard form={form} isOrder={isOrder} />

          <div ref={moreRef} className="scroll-mt-20">
            <FormSection
              icon={SlidersHorizontal}
              title="Thông tin bổ sung"
              collapsed={!moreOpen}
              action={
                <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => setMoreOpen((x) => !x)} aria-expanded={moreOpen}>
                  {moreOpen ? 'Thu gọn' : `Mở rộng${isEdit ? '' : ' (mẫu, phân loại, bảo mật…)'}`}
                  <ChevronDown className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </Button>
              }
            >
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                {!isOrder && (
                  <Field label="Phân loại hợp đồng">
                    <Controller
                      control={control}
                      name="category"
                      render={({ field }) => (
                        <FilterSelect
                          className="w-full"
                          allLabel="— Tự nhận theo đối tác —"
                          value={field.value || undefined}
                          onChange={(v) => field.onChange(v ?? '')}
                          options={CONTRACT_CATEGORIES.map((c) => ({ value: c, label: CONTRACT_CATEGORY_LABELS[c] }))}
                          ariaLabel="Phân loại hợp đồng"
                        />
                      )}
                    />
                  </Field>
                )}
                {!isOrder && (
                  <Field label="Nhóm hợp đồng">
                    <Input placeholder="VD: Hợp đồng khung, Dự án…" {...register('group')} />
                  </Field>
                )}
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
                {!isOrder && (
                  <Field label="Ngày dự kiến ký">
                    <Input type="date" {...register('expectedSignDate')} />
                  </Field>
                )}
                <Field label="Tags (phân cách bằng dấu phẩy)">
                  <Input {...register('tags')} />
                </Field>
                <Field label="Ghi chú" className="md:col-span-2">
                  <Textarea rows={2} {...register('note')} />
                </Field>
              </div>
            </FormSection>
          </div>

          {isOrder && !isEdit && !imported?.use && <OrderContentPreview form={form} templateId={templateId} />}
          {!isEdit && importedCard}

          {header && (
            <div className="flex justify-end">
              <Button type="submit" size="lg" className="h-11 px-6 text-base font-semibold" disabled={save.isPending}>
                {pendingIntent === 'continue' && <Loader2 className="animate-spin" />}
                Lưu & tiếp tục <ArrowRight />
              </Button>
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:overscroll-contain xl:p-0.5">
          <FormSection icon={FileText} title={`Tóm tắt ${noun}`} bodyClassName="px-5 py-2">
            <dl className="divide-y text-sm">
              <SummaryRow label={isOrder ? 'Tên đơn hàng' : 'Tên hợp đồng'}>{w.title?.trim() || '—'}</SummaryRow>
              <SummaryRow label={isOrder ? 'Giá trị đơn' : 'Giá trị hợp đồng'}>
                <span className="block text-base font-bold text-primary tabular-nums">{formatMoney(pretax + vatAmount, currency).replace('₫', 'đ')}</span>
                <span className="block text-xs text-muted-foreground">{vatPercent ? `(Bao gồm thuế GTGT ${vatPercent}%)` : '(Không gồm thuế GTGT)'}</span>
              </SummaryRow>
              <SummaryRow label="Đối tác">
                <span className={counterpart?.name?.trim() ? 'font-semibold text-primary' : ''}>{counterpart?.name?.trim() || '—'}</span>
              </SummaryRow>
              <SummaryRow label={isOrder ? 'Loại đơn' : 'Loại hợp đồng'}>{selectedType ? <StatusPill tone="green">{selectedType.name}</StatusPill> : '—'}</SummaryRow>
              <SummaryRow label="Phòng ban">{departmentName}</SummaryRow>
              <SummaryRow label="Người phụ trách">{ownerName}</SummaryRow>
            </dl>
          </FormSection>

          {!isEdit && filesPicker}

          <FormSection icon={SquareCheck} title="Kiểm tra thông tin bắt buộc">
            <ul className="space-y-2.5 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  {c.ok ? (
                    <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="mt-px size-[18px] shrink-0 rounded-full border-2 border-amber-400 bg-amber-100" aria-hidden />
                  )}
                  <span className="min-w-0">
                    {c.label}
                    {!c.ok && c.note && <span className="text-amber-600"> ({c.note})</span>}
                    <span className="sr-only">{c.ok ? ' – đã đủ' : ' – chưa đủ'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </FormSection>
        </aside>

        {!header && (
          <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur xl:col-span-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Hủy
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Lưu bản nháp'}
            </Button>
          </div>
        )}
        <OdooPartnerDialog
          open={odooPick !== null}
          onOpenChange={(o) => !o && setOdooPick(null)}
          mode="pick"
          onPicked={(p) => odooPick !== null && applyPartner(odooPick, p.id, p)}
        />
      </form>
    </>
  );
}

/** Khung thẻ của form: tiêu đề có biểu tượng, gạch ngăn cách; `collapsed` chỉ hiện phần đầu. */
function FormSection({
  icon: Icon,
  title,
  action,
  collapsed,
  bodyClassName,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  collapsed?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_0_rgb(15_23_42/0.05),0_1px_2px_-1px_rgb(15_23_42/0.04)]">
      <header className={`flex min-h-14 items-center gap-3 px-5 py-2.5 ${collapsed ? '' : 'border-b'}`}>
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </header>
      {!collapsed && <div className={bodyClassName ?? 'p-5'}>{children}</div>}
    </section>
  );
}

/** Một lựa chọn mẫu dạng thẻ: bấm để chọn, nút "Xem trước" mở mẫu trên trang A4. */
function TemplateChoice({
  selected,
  onSelect,
  icon: Icon,
  title,
  sub,
  badge,
  description,
  onPreview,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  sub?: string;
  badge?: string;
  description?: string;
  onPreview?: () => void;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-colors outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'bg-card'}`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug font-semibold">{title}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {selected ? <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden /> : <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/30" aria-hidden />}
      </div>
      {description && <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>}
      {(badge || onPreview) && (
        <div className="mt-auto flex items-center gap-2">
          {badge && <StatusPill tone="indigo">{badge}</StatusPill>}
          {onPreview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-primary hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
            >
              <Eye /> Xem trước
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Dòng nhãn bên trái – ô nhập bên phải (thẻ các bên, giá trị & thời hạn). */
function PartyRow({ label, error, labelClassName, children }: { label: React.ReactNode; error?: string; labelClassName?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <span className={`text-sm text-muted-foreground ${labelClassName ?? 'w-28'}`}>{label}</span>
      {children}
      {error && <p className="col-start-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

type OrderForm = UseFormReturn<FormValues>;

type SaveIntent = 'draft' | 'continue' | 'approve';

export interface CreateHeader {
  title: string;
  description: string;
  crumbs: Crumb[];
}

/** Giá trị đơn = cộng tiền hàng (tự tính từ dòng hàng). */
function OrderValue({ form }: { form: OrderForm }) {
  const items = useWatch({ control: form.control, name: 'items' });
  const valid = (items ?? []).filter((i) => qtyRegex.test(i.quantity) && moneyRegex.test(i.unitPrice));
  const subtotal = valid.length ? orderTotals(valid).subtotal : '0';
  return <Input readOnly value={`${formatQtyVi(subtotal)} (tự tính từ dòng hàng)`} aria-label="Giá trị đơn" className="bg-muted" />;
}

/** Hợp đồng nguyên tắc, giao hàng và thanh toán của đơn. */
function OrderDeliveryCard({ form, onParentPicked }: { form: OrderForm; onParentPicked: (id: string) => void }) {
  const { control, register } = form;
  const parties = useWatch({ control, name: 'parties' });
  const parentContractId = useWatch({ control, name: 'parentContractId' });
  // Ưu tiên hợp đồng của đối tác đã chọn ở phần "Các bên"; chưa chọn đối tác thì tìm trong mọi hợp đồng.
  const partnerId = (parties ?? []).find((p) => !p.isInternal && p.partnerId)?.partnerId ?? '';
  const [search, setSearch] = useState('');
  const contracts = useQuery({
    queryKey: ['contracts', 'parent-picker', partnerId, search],
    queryFn: () => api<Paginated<ContractListItem>>('/contracts', { query: { kind: 'CONTRACT', partnerId, q: search, pageSize: 50, sort: 'createdAt', order: 'desc' } }),
  });
  const current = useQuery({
    queryKey: ['contract', parentContractId],
    queryFn: () => api<ContractDetail>(`/contracts/${parentContractId}`),
    enabled: !!parentContractId && !contracts.data?.items.some((c) => c.id === parentContractId),
  });
  const options = [
    ...(current.data ? [{ value: current.data.id, label: `${current.data.code} · ${current.data.title}` }] : []),
    ...(contracts.data?.items ?? []).filter((c) => c.id !== current.data?.id).map((c) => ({ value: c.id, label: `${c.code} · ${c.parties[0]?.name ?? c.title}` })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hợp đồng nguyên tắc & giao hàng</CardTitle>
        <CardDescription>Gắn đơn với hợp đồng nguyên tắc để theo dõi các đơn theo từng hợp đồng và từng khách hàng.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <Field label="Hợp đồng nguyên tắc" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Controller
              control={control}
              name="parentContractId"
              render={({ field }) => (
                <FilterSelect
                  className="w-full md:w-[28rem]"
                  allLabel="— Không gắn hợp đồng —"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v ?? '');
                    if (v) onParentPicked(v);
                  }}
                  options={options}
                  ariaLabel="Hợp đồng nguyên tắc"
                />
              )}
            />
            <Input placeholder="Tìm số/tên hợp đồng…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-56" aria-label="Tìm hợp đồng nguyên tắc" />
          </div>
          {partnerId && <p className="text-xs text-muted-foreground">Đang lọc hợp đồng của đối tác đã chọn ở phần Các bên.</p>}
        </Field>
        <Field label="Ngày giao hàng">
          <Input type="date" {...register('deliveryDate')} />
        </Field>
        <Field label="Địa điểm giao hàng" className="md:col-span-3">
          <Input {...register('deliveryAddress')} />
        </Field>
        <Field label="Điều kiện thanh toán" className="md:col-span-3">
          <Textarea rows={2} placeholder="Ví dụ: Thanh toán 100% bằng chuyển khoản trong 30 ngày kể từ ngày giao hàng" {...register('paymentTerms')} />
        </Field>
      </CardContent>
    </Card>
  );
}

/** Dòng hàng: chọn từ danh mục sản phẩm (điền mã, tên, ĐVT, đơn giá) hoặc nhập tay. */
function OrderItemsCard({ form, isOrder }: { form: OrderForm; isOrder: boolean }) {
  const { control, register, setValue, formState } = form;
  const items = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control, name: 'items' });
  const vatRate = useWatch({ control, name: 'vatRate' });
  const products = useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => api<Paginated<Product>>('/products', { query: { pageSize: 200 } }),
  });
  const pick = (index: number, productId?: string) => {
    setValue(`items.${index}.productId`, productId ?? '');
    const p = products.data?.items.find((x) => x.id === productId);
    if (!p) return;
    setValue(`items.${index}.code`, p.code);
    setValue(`items.${index}.name`, p.name, { shouldValidate: true });
    setValue(`items.${index}.unit`, p.unit ?? '');
    setValue(`items.${index}.unitPrice`, decimalInput(p.unitPrice), { shouldValidate: true });
    if (!form.getValues('vatRate') && p.vatRate) setValue('vatRate', decimalInput(p.vatRate));
  };
  const valid = (watched ?? []).filter((i) => qtyRegex.test(i.quantity) && moneyRegex.test(i.unitPrice));
  const totals = valid.length ? orderTotals(valid, vatRate || null) : null;
  const errs = formState.errors.items;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Hàng hóa</CardTitle>
          <CardDescription>
            {isOrder ? '' : 'Không bắt buộc – dùng cho hợp đồng mua bán. Có dòng hàng thì giá trị hợp đồng tự tính từ dòng hàng. '}
            Thành tiền và tổng tiền tự tính; bảng hàng hóa chèn vào nội dung {isOrder ? 'đơn' : 'hợp đồng'} bằng biến {'{{order.items_table}}'}. Quản lý danh mục ở Đơn đặt hàng → Sản phẩm.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => items.append({ productId: '', code: '', name: '', unit: '', quantity: '1', unitPrice: '0' })}>
          <PackagePlus /> Thêm dòng
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.fields.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dòng hàng – bấm “Thêm dòng”.</p>}
        {items.fields.map((f, i) => {
          const e = errs?.[i];
          const row = watched?.[i];
          const amount = row && qtyRegex.test(row.quantity) && moneyRegex.test(row.unitPrice) ? formatQtyVi(itemAmount(row.quantity, row.unitPrice)) : '—';
          return (
            <div key={f.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-12 md:items-start">
              <div className="md:col-span-4">
                <Controller
                  control={control}
                  name={`items.${i}.productId`}
                  render={({ field }) => (
                    <FilterSelect
                      className="w-full"
                      allLabel="— Nhập tay —"
                      value={field.value}
                      onChange={(v) => pick(i, v)}
                      options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                      ariaLabel={`Sản phẩm dòng ${i + 1}`}
                    />
                  )}
                />
              </div>
              <Input className="md:col-span-2" placeholder="Mã hàng" aria-label={`Mã hàng dòng ${i + 1}`} {...register(`items.${i}.code`)} />
              <div className="md:col-span-6">
                <Input placeholder="Tên hàng hóa *" aria-label={`Tên hàng dòng ${i + 1}`} aria-invalid={!!e?.name} {...register(`items.${i}.name`)} />
                {e?.name && <p className="text-xs text-destructive">{e.name.message}</p>}
              </div>
              <Input className="md:col-span-2" placeholder="ĐVT" aria-label={`Đơn vị tính dòng ${i + 1}`} {...register(`items.${i}.unit`)} />
              <div className="md:col-span-2">
                <Input inputMode="decimal" placeholder="Số lượng" aria-label={`Số lượng dòng ${i + 1}`} aria-invalid={!!e?.quantity} {...register(`items.${i}.quantity`)} />
                {e?.quantity && <p className="text-xs text-destructive">{e.quantity.message}</p>}
              </div>
              <div className="md:col-span-3">
                <Input inputMode="decimal" placeholder="Đơn giá" aria-label={`Đơn giá dòng ${i + 1}`} aria-invalid={!!e?.unitPrice} {...register(`items.${i}.unitPrice`)} />
                {e?.unitPrice && <p className="text-xs text-destructive">{e.unitPrice.message}</p>}
              </div>
              <p className="flex h-9 items-center justify-end text-sm font-medium tabular-nums md:col-span-4" aria-label={`Thành tiền dòng ${i + 1}`}>
                {amount}
              </p>
              <Button type="button" variant="ghost" size="icon-sm" className="justify-self-end md:col-span-1" aria-label={`Xóa dòng ${i + 1}`} onClick={() => items.remove(i)}>
                <Trash2 />
              </Button>
            </div>
          );
        })}
        {totals && (
          <dl className="ml-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Cộng tiền hàng</dt>
            <dd className="text-right tabular-nums">{formatQtyVi(totals.subtotal)}</dd>
            {totals.vatAmount !== null && (
              <>
                <dt className="text-muted-foreground">Thuế GTGT ({vatRate}%)</dt>
                <dd className="text-right tabular-nums">{formatQtyVi(totals.vatAmount)}</dd>
              </>
            )}
            <dt className="font-medium">Tổng thanh toán</dt>
            <dd className="text-right font-semibold tabular-nums">{formatQtyVi(totals.total)}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Xem trước nội dung đơn (mẫu đã chọn hoặc nội dung đơn mặc định) với dữ liệu đang nhập/điền từ file.
 * Biến còn trống được tô vàng để biết cần bổ sung gì; sau khi lưu sửa tiếp ở tab "Nội dung đơn hàng".
 */
function OrderContentPreview({ form, templateId }: { form: OrderForm; templateId: string }) {
  const v = useWatch({ control: form.control });
  const template = useQuery({
    queryKey: ['templates', templateId],
    queryFn: () => api<TemplateDetail>(`/templates/${templateId}`),
    enabled: !!templateId,
  });
  const parent = useQuery({
    queryKey: ['contract', v.parentContractId],
    queryFn: () => api<ContractDetail>(`/contracts/${v.parentContractId}`),
    enabled: !!v.parentContractId,
  });
  const html = templateId ? template.data?.contentHtml : DEFAULT_ORDER_HTML;
  const items = (v.items ?? []).filter((i) => i?.name && qtyRegex.test(i.quantity ?? '') && moneyRegex.test(i.unitPrice ?? ''));
  const rendered = html
    ? renderTemplate(
        html,
        buildTemplateValues({
          code: v.code?.trim() || '(số đơn tự sinh khi lưu)',
          title: v.title ?? '',
          value: items.length ? orderTotals(items.map((i) => ({ name: i.name!, quantity: i.quantity!, unitPrice: i.unitPrice! }))).subtotal : (v.value ?? '0'),
          currency: v.currency ?? 'VND',
          vatRate: v.vatRate || null,
          expectedSignDate: v.expectedSignDate || null,
          parties: (v.parties ?? []).map((p) => ({ ...p, role: p?.role ?? 'PARTY_A', name: p?.name ?? '' })),
          items: items.map((i) => ({ code: i.code, name: i.name!, unit: i.unit, quantity: i.quantity!, unitPrice: i.unitPrice! })),
          parentContract: parent.data ? { code: parent.data.code, signedDate: parent.data.signedDate } : null,
          deliveryDate: v.deliveryDate || null,
          deliveryAddress: v.deliveryAddress || null,
          paymentTerms: v.paymentTerms || null,
        }),
      )
    : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nội dung đơn hàng (xem trước)</CardTitle>
        <CardDescription>
          {templateId ? 'Theo mẫu đã chọn' : 'Nội dung đơn mặc định'} với dữ liệu ở trên. Ô tô vàng là dữ liệu còn trống – bổ sung ở form trước khi gửi duyệt/ký; sửa câu chữ ở tab
          “Nội dung đơn hàng” sau khi lưu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!rendered ? (
          <p className="text-sm text-muted-foreground">Đang tải mẫu…</p>
        ) : (
          <div className="max-h-[560px] overflow-y-auto rounded-md border bg-white px-8 py-6 text-[#111]">
            {/* HTML mẫu đã được máy chủ làm sạch; giá trị biến được escape khi thay. */}
            <div className="contract-content" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
