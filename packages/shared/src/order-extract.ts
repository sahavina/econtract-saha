/**
 * Trích thông tin đơn đặt hàng từ nội dung file (Word, Excel, PDF có lớp chữ – đã tách thành đoạn/bảng):
 * thông tin chung + các bên (dùng lại bộ trích của hợp đồng), bảng hàng hóa, giao hàng, thanh toán.
 * Chỉ là gợi ý để điền sẵn form – người dùng kiểm tra lại trước khi lưu.
 */
import {
  type DocBlock,
  type ExtractedContract,
  type ExtractedParty,
  extractContractFields,
  fieldOf,
  foldVi,
  normalizeValue,
  parseVietnameseNumber,
} from './contract-extract.js';
import { fromScaled, toScaled } from './order.js';

export interface ExtractedOrderItem {
  code?: string;
  name: string;
  unit?: string;
  /** Dạng "12" / "2.5" (dấu chấm thập phân). */
  quantity: string;
  unitPrice: string;
}

export interface ExtractedOrder extends ExtractedContract {
  items: ExtractedOrderItem[];
  /** YYYY-MM-DD */
  deliveryDate?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
}

type Col = 'code' | 'name' | 'unit' | 'qty' | 'price' | 'amount';

/** Nhận diện tiêu đề cột (đã bỏ dấu). Thứ tự quan trọng: "thành tiền" trước "giá", "mã" phải đứng riêng. */
const HEADERS: [RegExp, Col][] = [
  [/^(thanh tien|tong tien|tong cong|gia tri|amount|total)\b/, 'amount'],
  [/^(don gia|gia ban|gia|unit price|price)\b/, 'price'],
  [/^(so luong|sl|khoi luong|qty|quantity)\b/, 'qty'],
  [/^(dvt|don vi tinh|don vi|unit|uom)\b/, 'unit'],
  [/^(ma hang|ma sp|ma san pham|ma vt|ma vat tu|ma hh|ma|item code|code|sku)\b/, 'code'],
  [/^(ten hang|ten san pham|ten vat tu|ten hh|hang hoa|san pham|vat tu|dien giai|noi dung|mo ta|description|item|ten)\b/, 'name'],
];

function headerMap(row: string[]): Partial<Record<Col, number>> | null {
  const map: Partial<Record<Col, number>> = {};
  row.forEach((cell, i) => {
    const f = foldVi(cell.replace(/\n/g, ' ')).replace(/[():.*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!f || f.length > 40) return;
    for (const [re, col] of HEADERS) {
      if (re.test(f)) {
        if (map[col] === undefined) map[col] = i;
        break;
      }
    }
  });
  return map.name !== undefined && map.qty !== undefined ? map : null;
}

/** Dòng tổng/thuế/bằng chữ cuối bảng ⇒ dừng đọc dòng hàng. */
const TOTAL_ROW = /^(cong|tong|thue|vat|bang chu|chiet khau|giam gia|tien hang|thanh toan|so tien)/;

const cleanCell = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function itemsFromTable(rows: string[][]): ExtractedOrderItem[] {
  for (let h = 0; h < rows.length; h++) {
    const map = headerMap(rows[h]);
    if (!map) continue;
    const items: ExtractedOrderItem[] = [];
    for (const row of rows.slice(h + 1)) {
      const name = cleanCell(row[map.name!]);
      const text = foldVi(row.join(' '));
      if (!name) {
        if (TOTAL_ROW.test(foldVi(row.find((c) => c.trim()) ?? ''))) break;
        continue;
      }
      if (TOTAL_ROW.test(foldVi(name)) || /^\(?\d+\)?$/.test(name) || /^[a-z]$/i.test(name)) {
        // Dòng tổng cộng, hoặc dòng đánh số cột "(1) (2) (3)…" ngay dưới tiêu đề.
        if (TOTAL_ROW.test(foldVi(name))) break;
        continue;
      }
      if (/^(stt|tt)\b/.test(text)) continue;
      const qty = parseVietnameseNumber(cleanCell(row[map.qty!]));
      if (!qty || toScaled(qty, 3) <= 0n) continue;
      let price = map.price !== undefined ? parseVietnameseNumber(cleanCell(row[map.price])) : undefined;
      if (!price && map.amount !== undefined) {
        // Chỉ có thành tiền ⇒ đơn giá = thành tiền / số lượng.
        const amount = parseVietnameseNumber(cleanCell(row[map.amount]));
        if (amount) price = fromScaled((toScaled(amount, 2) * 1000n) / toScaled(qty, 3), 2);
      }
      items.push({
        code: cleanCell(map.code !== undefined ? row[map.code] : '') || undefined,
        name,
        unit: cleanCell(map.unit !== undefined ? row[map.unit] : '') || undefined,
        quantity: qty,
        unitPrice: price ? price.replace(/\.0+$/, '') : '0',
      });
    }
    if (items.length) return items;
  }
  return [];
}

const pad = (n: number) => String(n).padStart(2, '0');

function dateIn(text: string): string | undefined {
  const f = foldVi(text);
  const m = f.match(/ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})/) ?? f.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (!m) return undefined;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1990 || y > 2100) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Phần sau dấu ":" của dòng (bỏ dấu chấm cuối, ô trống "……"). */
function afterColon(line: string): string | undefined {
  const i = line.search(/[:：]/);
  if (i < 0) return undefined;
  const v = line
    .slice(i + 1)
    .replace(/\s+/g, ' ')
    .replace(/[\s.;]+$/, '')
    .trim();
  return v && !/^[.…_\s-]+$/.test(v) ? v : undefined;
}

/** Nhãn trước dấu ":" của một ô/dòng (đã bỏ dấu, bỏ phần ngoặc như "(Tax code)"). */
const labelOf = (s: string) => {
  const i = s.search(/[:：]/);
  return foldVi((i >= 0 ? s.slice(0, i) : s).replace(/\([^)]*\)/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Giá trị theo nhãn: trong bảng là "Nhãn: giá trị" trong cùng ô hoặc giá trị ở ô kế bên ("Số PO: | 2010/…"),
 * trong đoạn văn là dòng bắt đầu bằng nhãn.
 */
function labeledValue(blocks: DocBlock[], re: RegExp): string | undefined {
  for (const b of blocks) {
    if (b.type === 'p') {
      for (const line of b.text.split('\n')) if (re.test(labelOf(line))) {
        const v = afterColon(line);
        if (v) return v;
      }
      continue;
    }
    for (const row of b.rows) {
      for (let i = 0; i < row.length; i++) {
        if (!row[i].trim() || !re.test(labelOf(row[i]))) continue;
        const v = afterColon(row[i]) ?? row.slice(i + 1).map((c) => c.replace(/\s+/g, ' ').trim()).find(Boolean);
        if (v) return v;
      }
    }
  }
  return undefined;
}

/** Giá trị đã chuẩn hóa; bỏ ô để trống kiểu "Ông ………". */
const filled = (field: Parameters<typeof normalizeValue>[0], raw: string) => {
  const v = normalizeValue(field, raw);
  return v && !/^[.…_\s-]+$/.test(v) ? v : undefined;
};

/**
 * Ô là nhãn của bên tham gia: có dấu ":" ("Mã số thuế (Tax code): …"), hoặc là nhãn ngắn ("Địa chỉ", "Đại diện").
 * Ô tên không có dấu ":" (vd "CÔNG TY TNHH SAHA") là giá trị, không phải nhãn "Công ty".
 */
function labelField(cell: string) {
  const field = fieldOf(labelOf(cell));
  if (!field) return null;
  if (/[:：]/.test(cell)) return field;
  return field !== 'name' && labelOf(cell).split(' ').length <= 4 ? field : null;
}

/** Ô đánh dấu khối thông tin một bên: "THÔNG TIN NHÀ CUNG CẤP", "Khách hàng", "Bên mua hàng"… */
function sideMarker(cell: string): 'BUY' | 'SELL' | null {
  const f = labelOf(cell).replace(/^thong tin /, '');
  if (/^(nha cung cap|ben ban|nguoi ban|don vi ban|supplier|seller|vendor)\b/.test(f)) return 'SELL';
  if (/^(ben mua|khach hang|nguoi mua|don vi mua|ben dat hang|buyer|customer)\b/.test(f)) return 'BUY';
  return null;
}

/**
 * Hai bên đặt cạnh nhau trong bảng (mẫu Excel/Word phổ biến): cột trái "Nhà cung cấp", cột phải "Khách hàng";
 * mỗi dòng là "nhãn | giá trị" của từng bên. Bên mua ⇒ Bên A, bên bán ⇒ Bên B.
 */
function sideBySideParties(blocks: DocBlock[]): ExtractedParty[] {
  for (const b of blocks) {
    if (b.type !== 'table') continue;
    for (let r = 0; r < b.rows.length; r++) {
      const marks = b.rows[r].map((c, i) => ({ i, side: c.trim() ? sideMarker(c) : null })).filter((m) => m.side);
      if (marks.length < 2 || new Set(marks.map((m) => m.side)).size < 2) continue;
      const cuts = marks.map((m) => m.i);
      const parties = marks.map((m): ExtractedParty => ({ role: m.side === 'BUY' ? 'PARTY_A' : 'PARTY_B', side: m.side! }));
      for (const row of b.rows.slice(r, r + 15)) {
        if (headerMap(row)) break; // tới bảng hàng hóa
        marks.forEach((_, k) => {
          const party = parties[k];
          const cells = row.slice(cuts[k], cuts[k + 1] ?? row.length).map((c) => c.replace(/\s+/g, ' ').trim());
          for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            if (!c) continue;
            const next = () => {
              const j = cells.findIndex((x, n) => n > i && x);
              if (j < 0 || sideMarker(cells[j]) || labelField(cells[j])) return undefined;
              i = j;
              return cells[j];
            };
            if (sideMarker(c)) {
              const v = afterColon(c) ?? next();
              if (v && !party.name && filled('name', v)) party.name = filled('name', v);
              continue;
            }
            const field = labelField(c);
            if (!field) continue;
            const v = /[:：]/.test(c) ? (afterColon(c) ?? next()) : next();
            if (v && !party[field] && filled(field, v)) party[field] = filled(field, v);
          }
        });
      }
      const found = parties.filter((p) => p.name || p.taxCode);
      if (found.length) return found.sort((a, b2) => a.role.localeCompare(b2.role));
    }
  }
  return [];
}

export function extractOrderFields(blocks: DocBlock[]): ExtractedOrder {
  const base = extractContractFields(blocks);
  const lines = blocks.flatMap((b) => (b.type === 'p' ? b.text.split('\n') : b.rows.flat().flatMap((c) => c.split('\n'))));
  const out: ExtractedOrder = { ...base, items: [] };

  // Tên đơn: dòng đầu tiên "ĐƠN ĐẶT HÀNG" / "PHIẾU ĐẶT HÀNG" / "PURCHASE ORDER".
  const title = lines.map((l) => l.replace(/\s+/g, ' ').trim()).find((l) => /^(don dat hang|phieu dat hang|don hang|purchase order)\b/.test(foldVi(l)) && l.length <= 150);
  if (title) out.title = title;
  // Số đơn: "Số đơn hàng: …", "Số ĐĐH: …", "PO No: …" (ưu tiên hơn "Số:" chung).
  for (const l of lines) {
    if (/^(so (don dat hang|don hang|ddh|dh|po)|po (no|number)|ma don( hang)?)\b/.test(foldVi(l.trim()))) {
      const v = afterColon(l);
      if (v && v.length <= 60) {
        out.code = v.replace(/\s*\/\s*/g, '/');
        break;
      }
    }
  }
  // Số đơn / ngày đặt trong bảng: "Số PO: | 2010/…", "Date: 20/10/2026".
  if (!out.code) {
    const v = labeledValue(blocks, /^(so (don dat hang|don hang|ddh|dh|po)|po (no|number)|ma don( hang)?|order no)$/);
    if (v && v.length <= 60) out.code = v.replace(/\s*\/\s*/g, '/');
  }
  const dated = labeledValue(blocks, /^(ngay (dat hang|lap|don hang)|ngay|date|order date)$/);
  if (dated && dateIn(dated)) out.signDate = dateIn(dated);
  // Hai bên đặt cạnh nhau ⇒ thay kết quả của bộ trích hợp đồng (vốn đọc từng bên theo dòng "BÊN A/B").
  const sideBySide = sideBySideParties(blocks);
  if (sideBySide.length) out.parties = sideBySide;
  // Tiêu đề chỉ là "ĐƠN ĐẶT HÀNG" ⇒ ghép số đơn để dễ phân biệt trong danh sách.
  if (out.title && out.code && /^(don dat hang|phieu dat hang|don hang|purchase order)$/.test(foldVi(out.title))) out.title = `Đơn đặt hàng ${out.code}`;
  // Ngày đặt hàng: "Ngày đặt hàng: …" nếu có.
  const orderDateLine = lines.find((l) => /^ngay (dat hang|lap|don hang)\b/.test(foldVi(l.trim())));
  if (orderDateLine) out.signDate = dateIn(orderDateLine) ?? out.signDate;

  for (const l of lines) {
    const f = foldVi(l.trim());
    if (!out.deliveryAddress && /^(dia diem|noi|dia chi) (giao|nhan) hang\b/.test(f)) out.deliveryAddress = afterColon(l);
    if (!out.deliveryDate && /^(thoi gian|ngay|thoi han|han) (giao|nhan) hang\b/.test(f)) out.deliveryDate = dateIn(l);
    if (!out.paymentTerms && /^(dieu kien|phuong thuc|hinh thuc|thoi han) thanh toan\b/.test(f)) out.paymentTerms = afterColon(l);
  }

  for (const b of blocks) {
    if (b.type !== 'table') continue;
    const items = itemsFromTable(b.rows);
    if (items.length) {
      out.items = items;
      break;
    }
  }
  // Giá trị đơn tính từ dòng hàng ở máy chủ; bỏ giá trị trích từ văn bản để tránh nhầm với tổng có VAT.
  if (out.items.length) delete out.value;
  return out;
}
