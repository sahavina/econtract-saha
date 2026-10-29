/**
 * Đơn đặt hàng: tính tiền dòng hàng (số nguyên lớn, không sai số dấu phẩy động), đọc số tiền bằng chữ,
 * bảng hàng hóa chèn vào nội dung đơn và nội dung mặc định khi soạn đơn mới.
 */

export const CONTRACT_KINDS = ['CONTRACT', 'ORDER'] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  CONTRACT: 'Hợp đồng',
  ORDER: 'Đơn đặt hàng',
};

/** Tình trạng giao hàng của đơn (tính từ số lượng đã giao của các dòng hàng). */
export type OrderFulfillment = 'NONE' | 'PARTIAL' | 'DONE';
export const ORDER_FULFILLMENT_LABELS: Record<OrderFulfillment, string> = {
  NONE: 'Chưa giao',
  PARTIAL: 'Giao một phần',
  DONE: 'Đã giao đủ',
};

/** Số dạng chuỗi, number hoặc Decimal của Prisma (đọc qua toString). */
export type NumLike = string | number | { toString(): string };

export interface OrderItemLike {
  code?: string | null;
  name: string;
  unit?: string | null;
  quantity: NumLike;
  unitPrice: NumLike;
  amount?: NumLike | null;
  deliveredQty?: NumLike | null;
  note?: string | null;
}

// ───── số thập phân cố định bằng BigInt ─────

/** "12.5" với scale 3 ⇒ 12500n. Giá trị không hợp lệ ⇒ 0n. */
export function toScaled(v: NumLike | null | undefined, scale: number): bigint {
  if (v === null || v === undefined || v === '') return 0n;
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return 0n;
  const frac = (m[3] ?? '').padEnd(scale, '0');
  const kept = BigInt(m[2] + frac.slice(0, scale));
  // Làm tròn nửa lên theo chữ số bị cắt.
  const rounded = frac.length > scale && Number(frac[scale]) >= 5 ? kept + 1n : kept;
  return m[1] === '-' ? -rounded : rounded;
}

/** 12500n scale 2 ⇒ "125.00" (dạng lưu Decimal). */
export function fromScaled(n: bigint, scale: number): string {
  const neg = n < 0n;
  const abs = (neg ? -n : n).toString().padStart(scale + 1, '0');
  const int = abs.slice(0, abs.length - scale);
  const frac = abs.slice(abs.length - scale);
  return `${neg ? '-' : ''}${int}${scale ? `.${frac}` : ''}`;
}

const divRound = (a: bigint, b: bigint) => (a >= 0n ? (a + b / 2n) / b : -((-a + b / 2n) / b));

/** Thành tiền = số lượng × đơn giá, làm tròn 2 chữ số. */
export function itemAmount(quantity: NumLike, unitPrice: NumLike): string {
  return fromScaled(divRound(toScaled(quantity, 3) * toScaled(unitPrice, 2), 1000n), 2);
}

export interface OrderTotals {
  subtotal: string;
  vatAmount: string | null;
  total: string;
}

/** Tổng tiền hàng, tiền thuế (theo % VAT của đơn) và tổng thanh toán. */
export function orderTotals(items: OrderItemLike[], vatRate?: NumLike | null): OrderTotals {
  const sub = items.reduce((s, i) => s + toScaled(i.amount ?? itemAmount(i.quantity, i.unitPrice), 2), 0n);
  const hasVat = vatRate !== null && vatRate !== undefined && String(vatRate) !== '';
  const vat = hasVat ? divRound(sub * toScaled(vatRate, 2), 10_000n) : 0n;
  return { subtotal: fromScaled(sub, 2), vatAmount: hasVat ? fromScaled(vat, 2) : null, total: fromScaled(sub + vat, 2) };
}

/** Tình trạng giao hàng: so số lượng đã giao với số lượng đặt của mọi dòng. */
export function orderFulfillment(items: Pick<OrderItemLike, 'quantity' | 'deliveredQty'>[]): OrderFulfillment {
  if (!items.length) return 'NONE';
  const delivered = items.map((i) => toScaled(i.deliveredQty, 3));
  if (delivered.every((d) => d <= 0n)) return 'NONE';
  return items.every((i, k) => delivered[k] >= toScaled(i.quantity, 3)) ? 'DONE' : 'PARTIAL';
}

/** Giá trị hàng đã giao (đơn giá × số lượng đã giao). */
export function deliveredValue(items: OrderItemLike[]): string {
  return fromScaled(
    items.reduce((s, i) => s + divRound(toScaled(i.deliveredQty, 3) * toScaled(i.unitPrice, 2), 1000n), 0n),
    2,
  );
}

// ───── đọc số bằng chữ ─────

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (full || h > 0) out.push(DIGITS[h], 'trăm');
  if (t === 0) {
    if (u > 0 && (full || h > 0)) out.push('linh');
  } else if (t === 1) out.push('mười');
  else out.push(DIGITS[t], 'mươi');
  if (u > 0) {
    if (u === 1 && t >= 2) out.push('mốt');
    else if (u === 5 && t >= 1) out.push('lăm');
    else if (u === 4 && t >= 2) out.push('tư');
    else out.push(DIGITS[u]);
  }
  return out.join(' ');
}

function readBelowBillion(n: number, lead: boolean): string {
  const parts: string[] = [];
  let started = lead;
  for (const [g, unit] of [
    [Math.floor(n / 1_000_000), 'triệu'],
    [Math.floor(n / 1000) % 1000, 'nghìn'],
    [n % 1000, ''],
  ] as const) {
    if (g === 0) continue;
    parts.push(unit ? `${readTriple(g, started)} ${unit}` : readTriple(g, started));
    started = true;
  }
  return parts.join(' ');
}

function readWords(n: bigint): string {
  if (n < 1_000_000_000n) return readBelowBillion(Number(n), false);
  const lo = Number(n % 1_000_000_000n);
  return `${readWords(n / 1_000_000_000n)} tỷ${lo ? ` ${readBelowBillion(lo, true)}` : ''}`;
}

/** Đọc số nguyên không âm bằng chữ tiếng Việt: 1250000 ⇒ "một triệu hai trăm năm mươi nghìn". */
export function numberToVietnameseWords(value: bigint | number | string): string {
  let n = BigInt(typeof value === 'string' ? value.split('.')[0] || '0' : typeof value === 'number' ? Math.trunc(value) : value);
  if (n < 0n) n = -n;
  return n === 0n ? 'không' : readWords(n);
}

/** "1250000.00" ⇒ "Một triệu hai trăm năm mươi nghìn đồng". */
export function amountInWordsVnd(amount: string | number): string {
  const w = numberToVietnameseWords(String(amount));
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} đồng`;
}

// ───── bảng hàng hóa ─────

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Định dạng số kiểu Việt Nam: 1250000.50 ⇒ "1.250.000,5". */
export function formatQtyVi(value: NumLike | null | undefined): string {
  if (value === null || value === undefined || String(value) === '') return '';
  const [int, frac] = String(value).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac && Number(frac) !== 0 ? `${grouped},${frac.replace(/0+$/, '')}` : grouped;
}

/**
 * Bảng hàng hóa dạng HTML (giá trị đã escape) để thay biến {{order.items_table}}.
 * Chỉ dùng thẻ/thuộc tính nằm trong danh sách cho phép của bộ làm sạch nội dung.
 */
/** Độ rộng cột bảng hàng hóa (px, tổng 640 ≈ khổ A4 trừ lề): cột tên hàng rộng nhất; PDF quy đổi sang phần trăm. */
const ITEMS_TABLE_COLGROUP = `<colgroup>${[48, 75, 212, 60, 65, 85, 95].map((w) => `<col style="width: ${w}px">`).join('')}</colgroup>`;

export function orderItemsTableHtml(items: OrderItemLike[], vatRate?: NumLike | null): string | null {
  if (!items.length) return null;
  const t = orderTotals(items, vatRate);
  const th = (s: string) => `<th><p>${s}</p></th>`;
  const td = (s: string, align?: 'right' | 'center') => `<td><p${align ? ` style="text-align: ${align}"` : ''}>${s}</p></td>`;
  const rows = items
    .map((i, k) =>
      [
        td(String(k + 1), 'center'),
        td(esc(i.code ?? '')),
        td(esc(i.name)),
        td(esc(i.unit ?? ''), 'center'),
        td(formatQtyVi(i.quantity), 'right'),
        td(formatQtyVi(i.unitPrice), 'right'),
        td(formatQtyVi(i.amount ?? itemAmount(i.quantity, i.unitPrice)), 'right'),
      ].join(''),
    )
    .map((r) => `<tr>${r}</tr>`)
    .join('');
  const sum = (label: string, v: string) => `<tr><td colspan="6"><p style="text-align: right"><strong>${label}</strong></p></td>${td(`<strong>${formatQtyVi(v)}</strong>`, 'right')}</tr>`;
  const footer = [
    sum('Cộng tiền hàng', t.subtotal),
    ...(t.vatAmount !== null ? [sum(`Thuế GTGT (${formatQtyVi(vatRate)}%)`, t.vatAmount), sum('Tổng cộng thanh toán', t.total)] : []),
  ].join('');
  return (
    `<table>${ITEMS_TABLE_COLGROUP}<tbody><tr>${['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'].map(th).join('')}</tr>` +
    `${rows}${footer}</tbody></table>`
  );
}

/** Nội dung mặc định khi lập đơn không chọn mẫu (soạn tiếp ở tab Nội dung). */
export const DEFAULT_ORDER_HTML = [
  '<p style="text-align: center"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>',
  '<p style="text-align: center"><strong>Độc lập – Tự do – Hạnh phúc</strong></p>',
  '<h2 style="text-align: center">ĐƠN ĐẶT HÀNG</h2>',
  '<p style="text-align: center">Số: {{contract.code}}</p>',
  '<p>Căn cứ hợp đồng nguyên tắc số {{order.parent_code}}, hai bên thống nhất đặt hàng theo các nội dung sau:</p>',
  '<p><strong>BÊN A:</strong> {{party_a.name}}</p>',
  '<p>Mã số thuế: {{party_a.tax_code}} – Địa chỉ: {{party_a.address}}</p>',
  '<p>Người đại diện: {{party_a.representative}} – Chức vụ: {{party_a.position}}</p>',
  '<p><strong>BÊN B:</strong> {{party_b.name}}</p>',
  '<p>Mã số thuế: {{party_b.tax_code}} – Địa chỉ: {{party_b.address}}</p>',
  '<p>Người đại diện: {{party_b.representative}} – Chức vụ: {{party_b.position}}</p>',
  '<p><strong>1. Hàng hóa đặt mua</strong></p>',
  '<p>{{order.items_table}}</p>',
  '<p>Tổng giá trị thanh toán: <strong>{{order.total}} {{contract.currency}}</strong> (Bằng chữ: {{order.total_words}}).</p>',
  '<p><strong>2. Giao hàng</strong></p>',
  '<p>Thời gian giao hàng: {{order.delivery_date}}. Địa điểm giao hàng: {{order.delivery_address}}.</p>',
  '<p><strong>3. Thanh toán</strong></p>',
  '<p>{{order.payment_terms}}</p>',
  '<p>Các nội dung khác thực hiện theo hợp đồng nguyên tắc nêu trên.</p>',
  '<table><tbody><tr><td><p style="text-align: center"><strong>ĐẠI DIỆN BÊN A</strong></p></td><td><p style="text-align: center"><strong>ĐẠI DIỆN BÊN B</strong></p></td></tr></tbody></table>',
].join('');
