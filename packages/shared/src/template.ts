/**
 * Biến dữ liệu trong nội dung hợp đồng, dạng {{nhom.truong}}.
 * Dùng chung cho trình soạn thảo (chèn/xem trước) và backend (xuất PDF sau này).
 */

import { amountInWordsVnd, type OrderItemLike, orderItemsTableHtml, orderTotals } from './order.js';

export interface TemplateVariable {
  key: string;
  label: string;
}

export const TEMPLATE_VARIABLES: { group: string; items: TemplateVariable[] }[] = [
  {
    group: 'Hợp đồng',
    items: [
      { key: 'contract.code', label: 'Mã hợp đồng' },
      { key: 'contract.title', label: 'Tên hợp đồng' },
      { key: 'contract.value', label: 'Giá trị hợp đồng' },
      { key: 'contract.currency', label: 'Tiền tệ' },
      { key: 'contract.vat_rate', label: 'Thuế VAT (%)' },
      { key: 'contract.start_date', label: 'Ngày hiệu lực' },
      { key: 'contract.end_date', label: 'Ngày hết hạn' },
      { key: 'contract.sign_date', label: 'Ngày dự kiến ký' },
    ],
  },
  {
    group: 'Đơn đặt hàng',
    items: [
      { key: 'order.items_table', label: 'Bảng hàng hóa' },
      { key: 'order.subtotal', label: 'Cộng tiền hàng' },
      { key: 'order.vat_amount', label: 'Tiền thuế GTGT' },
      { key: 'order.total', label: 'Tổng thanh toán' },
      { key: 'order.total_words', label: 'Tổng thanh toán bằng chữ' },
      { key: 'order.parent_code', label: 'Số hợp đồng nguyên tắc' },
      { key: 'order.parent_date', label: 'Ngày ký hợp đồng nguyên tắc' },
      { key: 'order.delivery_date', label: 'Ngày giao hàng' },
      { key: 'order.delivery_address', label: 'Địa điểm giao hàng' },
      { key: 'order.payment_terms', label: 'Điều kiện thanh toán' },
    ],
  },
  ...(['party_a', 'party_b'] as const).map((p) => ({
    group: p === 'party_a' ? 'Bên A' : 'Bên B',
    items: [
      { key: `${p}.name`, label: 'Tên' },
      { key: `${p}.tax_code`, label: 'Mã số thuế' },
      { key: `${p}.address`, label: 'Địa chỉ' },
      { key: `${p}.representative`, label: 'Người đại diện' },
      { key: `${p}.position`, label: 'Chức vụ' },
      { key: `${p}.phone`, label: 'Điện thoại' },
      { key: `${p}.email`, label: 'Email' },
      { key: `${p}.bank_account`, label: 'Số tài khoản' },
    ],
  })),
];

export const TEMPLATE_VARIABLE_KEYS = new Set(TEMPLATE_VARIABLES.flatMap((g) => g.items.map((i) => i.key)));

const VARIABLE_LABELS = new Map(
  TEMPLATE_VARIABLES.flatMap((g) => g.items.map((i) => [i.key, g.group === 'Hợp đồng' || g.group === 'Đơn đặt hàng' ? i.label : `${g.group} – ${i.label}`] as const)),
);

/** Tên tiếng Việt của biến cho người dùng: "contract.vat_rate" → "Thuế VAT (%)", "party_b.phone" → "Bên B – Điện thoại". */
export function variableLabel(key: string): string {
  return VARIABLE_LABELS.get(key) ?? `{{${key}}}`;
}

export const VARIABLE_PATTERN = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

export interface TemplateParty {
  role: string;
  name: string;
  taxCode?: string | null;
  address?: string | null;
  representative?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  bankAccount?: string | null;
}

export interface TemplateContract {
  code: string;
  title: string;
  value: string | number;
  currency: string;
  vatRate?: string | number | null;
  effectiveDate?: string | Date | null;
  expiryDate?: string | Date | null;
  expectedSignDate?: string | Date | null;
  parties: TemplateParty[];
  // Đơn đặt hàng
  items?: OrderItemLike[];
  parentContract?: { code: string; signedDate?: string | Date | null } | null;
  deliveryDate?: string | Date | null;
  deliveryAddress?: string | null;
  paymentTerms?: string | null;
}

/** Biến có giá trị là HTML dựng sẵn (đã escape bên trong) – không escape lại khi thay. */
const RAW_HTML_VARIABLES = new Set(['order.items_table']);

const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày @db.Date trả về dạng UTC nửa đêm ⇒ định dạng theo UTC để không lệch ngày. */
export function formatDateVi(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function formatNumberVi(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const [int, frac] = String(value).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac && Number(frac) !== 0 ? `${grouped},${frac.replace(/0+$/, '')}` : grouped;
}

/** Bảng giá trị biến từ dữ liệu hợp đồng; biến không có dữ liệu mang giá trị null. */
export function buildTemplateValues(c: TemplateContract): Record<string, string | null> {
  const party = (role: string) => c.parties.find((p) => p.role === role);
  const values: Record<string, string | null> = {
    'contract.code': c.code,
    'contract.title': c.title,
    'contract.value': formatNumberVi(c.value),
    'contract.currency': c.currency,
    'contract.vat_rate': c.vatRate === null || c.vatRate === undefined ? null : formatNumberVi(c.vatRate),
    'contract.start_date': formatDateVi(c.effectiveDate),
    'contract.end_date': formatDateVi(c.expiryDate),
    'contract.sign_date': formatDateVi(c.expectedSignDate),
  };
  const items = (c.items ?? []).map((i) => ({ ...i, quantity: String(i.quantity), unitPrice: String(i.unitPrice), amount: i.amount == null ? null : String(i.amount) }));
  const vat = c.vatRate === null || c.vatRate === undefined ? null : String(c.vatRate);
  const totals = items.length ? orderTotals(items, vat) : null;
  values['order.items_table'] = orderItemsTableHtml(items, vat);
  values['order.subtotal'] = totals ? formatNumberVi(totals.subtotal) : null;
  values['order.vat_amount'] = totals?.vatAmount ? formatNumberVi(totals.vatAmount) : null;
  values['order.total'] = totals ? formatNumberVi(totals.total) : null;
  values['order.total_words'] = totals && c.currency === 'VND' ? amountInWordsVnd(totals.total) : null;
  values['order.parent_code'] = c.parentContract?.code || null;
  values['order.parent_date'] = formatDateVi(c.parentContract?.signedDate);
  values['order.delivery_date'] = formatDateVi(c.deliveryDate);
  values['order.delivery_address'] = c.deliveryAddress || null;
  values['order.payment_terms'] = c.paymentTerms || null;
  for (const [prefix, role] of [
    ['party_a', 'PARTY_A'],
    ['party_b', 'PARTY_B'],
  ] as const) {
    const p = party(role);
    values[`${prefix}.name`] = p?.name || null;
    values[`${prefix}.tax_code`] = p?.taxCode || null;
    values[`${prefix}.address`] = p?.address || null;
    values[`${prefix}.representative`] = p?.representative || null;
    values[`${prefix}.position`] = p?.position || null;
    values[`${prefix}.phone`] = p?.phone || null;
    values[`${prefix}.email`] = p?.email || null;
    values[`${prefix}.bank_account`] = p?.bankAccount || null;
  }
  return values;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export interface RenderResult {
  html: string;
  /** Biến có trong nội dung nhưng chưa có dữ liệu. */
  missing: string[];
  /** Biến không thuộc danh mục hỗ trợ. */
  unknown: string[];
}

/**
 * Gỡ thẻ chen vào giữa một biến {{…}}: trình soạn thảo có thể tự gắn liên kết cho phần trông như tên miền
 * ("b.bank", "a.name" ⇒ <a href="http://b.bank">) hoặc tách định dạng giữa chừng, làm biến không được nhận ra.
 */
export function normalizeVariableMarkup(html: string): string {
  return html.replace(/\{\{((?:[^{}]|<[^>]*>)*?)\}\}/g, (m, inner: string) => {
    if (!inner.includes('<')) return m;
    const text = inner.replace(/<[^>]*>/g, '');
    return /^\s*[a-z_]+\.[a-z_]+\s*$/.test(text) ? `{{${text.trim()}}}` : m;
  });
}

/**
 * Thay biến trong HTML đã được làm sạch. Giá trị được escape HTML.
 * Biến thiếu dữ liệu/không hỗ trợ được đánh dấu bằng <mark data-missing> để người dùng nhận biết.
 */
export function renderTemplate(source: string, values: Record<string, string | null>): RenderResult {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const html = normalizeVariableMarkup(source);
  // Bảng hàng hóa đứng riêng một đoạn ⇒ thay cả đoạn (bảng không được nằm trong <p>).
  const blocks = html.replace(/<p[^>]*>\s*\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}\s*<\/p>/g, (m, key: string) => {
    const v = RAW_HTML_VARIABLES.has(key) ? values[key] : null;
    return v ? v : m;
  });
  const out = blocks.replace(VARIABLE_PATTERN, (_m, key: string) => {
    if (!TEMPLATE_VARIABLE_KEYS.has(key)) {
      unknown.add(key);
      return `<mark data-missing="unknown">{{${escapeHtml(key)}}}</mark>`;
    }
    const v = values[key];
    if (v === null || v === undefined || v === '') {
      missing.add(key);
      return `<mark data-missing="empty">{{${escapeHtml(key)}}}</mark>`;
    }
    return RAW_HTML_VARIABLES.has(key) ? v : escapeHtml(v);
  });
  return { html: out, missing: [...missing], unknown: [...unknown] };
}

/** Danh sách biến (không trùng, theo thứ tự xuất hiện) có trong nội dung. */
export function extractVariables(html: string): string[] {
  return [...new Set([...normalizeVariableMarkup(html).matchAll(VARIABLE_PATTERN)].map((m) => m[1]))];
}

export const CLAUSE_CATEGORIES = [
  'PAYMENT',
  'WARRANTY',
  'CONFIDENTIALITY',
  'PENALTY',
  'COMPENSATION',
  'TERMINATION',
  'DISPUTE',
  'FORCE_MAJEURE',
  'OTHER',
] as const;
export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

export const CLAUSE_CATEGORY_LABELS: Record<ClauseCategory, string> = {
  PAYMENT: 'Thanh toán',
  WARRANTY: 'Bảo hành',
  CONFIDENTIALITY: 'Bảo mật',
  PENALTY: 'Phạt vi phạm',
  COMPENSATION: 'Bồi thường',
  TERMINATION: 'Chấm dứt',
  DISPUTE: 'Giải quyết tranh chấp',
  FORCE_MAJEURE: 'Bất khả kháng',
  OTHER: 'Khác',
};

export const CLAUSE_STATUS_LABELS = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  ARCHIVED: 'Lưu trữ',
} as const;

export const TEMPLATE_STATUS_LABELS = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang sử dụng',
  ARCHIVED: 'Lưu trữ',
} as const;
