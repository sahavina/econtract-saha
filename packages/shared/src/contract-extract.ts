/**
 * Trích thông tin hợp đồng từ nội dung văn bản (đã tách từ file Word): tên, số hợp đồng, ngày,
 * các bên (bảng "Tên cơ quan | …" hoặc dòng "Địa chỉ: …"), giá trị, thuế VAT.
 * Chỉ là gợi ý để điền sẵn form – người dùng kiểm tra lại trước khi lưu.
 */

export type DocBlock = { type: 'p'; text: string } | { type: 'table'; rows: string[][] };

export interface ExtractedParty {
  role: 'PARTY_A' | 'PARTY_B' | 'PARTY_C';
  name?: string;
  taxCode?: string;
  address?: string;
  email?: string;
  phone?: string;
  representative?: string;
  position?: string;
  bankAccount?: string;
}

export interface ExtractedContract {
  title?: string;
  code?: string;
  /** YYYY-MM-DD */
  signDate?: string;
  /** Số tiền dạng "28512000" (không dấu phân cách). */
  value?: string;
  vatRate?: number;
  currency?: 'VND' | 'USD' | 'EUR';
  parties: ExtractedParty[];
}

type PartyField = Exclude<keyof ExtractedParty, 'role'>;

/** Bỏ dấu, chữ thường, gộp khoảng trắng: "Mã số thuế" → "ma so thue". */
export function foldVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s:：.\-–]+|[\s;,.]+$/g, '').trim();

/** Nhãn → trường của bên tham gia (so khớp phần đầu nhãn đã bỏ dấu). */
const LABELS: [RegExp, PartyField][] = [
  [/^(ten (co quan|cong ty|doanh nghiep|don vi|to chuc|khach hang|nha cung cap)|ten|don vi|cong ty)\b/, 'name'],
  [/^(ma so thue|mst|ma so doanh nghiep|ma so dn)\b/, 'taxCode'],
  [/^(dia chi|tru so)\b/, 'address'],
  [/^(e-?mail|thu dien tu)\b/, 'email'],
  [/^(so dien thoai|dien thoai|dt|tel|sdt)\b/, 'phone'],
  [/^(nguoi dai dien|dai dien( theo phap luat)?( la| boi)?|do ong|do ba)\b/, 'representative'],
  [/^(chuc vu|chuc danh)\b/, 'position'],
  [/^(so tai khoan|tai khoan|stk|tk)\b/, 'bankAccount'],
];

function fieldOf(label: string): PartyField | null {
  const f = foldVi(label).replace(/[:：]$/, '').trim();
  if (!f || f.length > 40) return null;
  for (const [re, field] of LABELS) if (re.test(f)) return field;
  return null;
}

function normalizeValue(field: PartyField, raw: string): string | undefined {
  let v = clean(raw);
  if (!v || /^[.…_\s-]+$/.test(v)) return undefined; // ô để trống "………"
  switch (field) {
    case 'representative':
      v = v.replace(/^(ông|bà|ong|ba|mr\.?|mrs\.?|ms\.?)\s*[:：.]?\s*/i, '');
      break;
    case 'taxCode':
      v = v.replace(/\s+/g, '');
      break;
    case 'phone':
      v = v.split(/\s*(?:[-–,;/]|fax)\s*(?=\D)/i)[0].trim();
      break;
    case 'email':
      v = v.match(/[^\s@]+@[^\s@]+\.[^\s@,;]+/)?.[0] ?? '';
      break;
  }
  return v || undefined;
}

/** "BÊN A", "1/ ĐẠI DIỆN BÊN A", "BÊN MUA (BÊN A): CÔNG TY …" ⇒ vai trò + tên nếu có sau dấu ":". */
function partyMarker(text: string): { role: ExtractedParty['role']; name?: string } | null {
  const f = foldVi(text);
  if (f.length > 160 || /^dieu\b/.test(f)) return null;
  const m = f.match(/^(?:\d+[/.)]\s*)?(?:dai dien\s+)?ben\s+([abc])\b|\(\s*(?:goi tat la\s+)?ben\s+([abc])\s*\)/);
  if (!m) return null;
  const role = `PARTY_${(m[1] ?? m[2]).toUpperCase()}` as ExtractedParty['role'];
  const colon = text.search(/[:：]/);
  const name = colon >= 0 ? clean(text.slice(colon + 1)) : '';
  return { role, name: name && !/^[.…_\s]+$/.test(name) ? name : undefined };
}

/** "28.512.000" | "28,512,000" | "28.512.000,50" ⇒ "28512000" / "28512000.50" */
export function parseVietnameseNumber(raw: string): string | undefined {
  const m = raw.match(/\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
  if (!m) return undefined;
  let s = m[0].replace(/\s/g, '');
  const dec = s.match(/[.,](\d{1,2})$/);
  let frac = '';
  if (dec && !/[.,]\d{3}$/.test(s)) {
    frac = dec[1];
    s = s.slice(0, -dec[0].length);
  }
  const int = s.replace(/[.,]/g, '');
  if (!/^\d+$/.test(int)) return undefined;
  return frac ? `${int}.${frac}` : int;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseDate(text: string): string | undefined {
  const f = foldVi(text);
  let m = f.match(/ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})/);
  if (!m) m = f.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (!m) return undefined;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1990 || y > 2100) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function extractContractFields(blocks: DocBlock[]): ExtractedContract {
  const out: ExtractedContract = { parties: [] };
  const lines = blocks.flatMap((b) => (b.type === 'p' ? [b.text] : b.rows.flat().flatMap((c) => c.split('\n'))));

  // Tên hợp đồng: dòng đầu tiên bắt đầu bằng "HỢP ĐỒNG" (không phải câu dài).
  for (const l of lines) {
    const t = clean(l);
    if (/^hop dong\b/.test(foldVi(t)) && t.length <= 200 && !/[;]/.test(t)) {
      out.title = t;
      break;
    }
  }
  // Số hợp đồng: "Số: 01/HĐ-…" (cả dấu hai chấm toàn chiều rộng "：").
  for (const l of lines) {
    const m = l.trim().match(/^S[ốo]\s*(?:hợp đồng|HĐ)?\s*[:：]\s*(.+)$/i);
    if (m) {
      const code = m[1].replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
      if (code && code.length <= 60 && !/^[.…_]+$/.test(code)) out.code = code;
      break;
    }
  }
  // Ngày ký: ưu tiên "Hôm nay, ngày …", sau đó dòng địa danh "…, ngày … tháng … năm …".
  out.signDate =
    lines.map((l) => (/^hom nay/.test(foldVi(l)) ? parseDate(l) : undefined)).find(Boolean) ??
    lines.map((l) => (/ngay\s+\d{1,2}\s+thang/.test(foldVi(l)) ? parseDate(l) : undefined)).find(Boolean);

  // Các bên: sau mỗi dòng đánh dấu "BÊN A/B/C", gom cặp nhãn–giá trị từ bảng hoặc đoạn văn "Nhãn: giá trị".
  let current: ExtractedParty | null = null;
  const put = (field: PartyField, raw: string) => {
    if (!current || current[field]) return;
    const v = normalizeValue(field, raw);
    if (v) current[field] = v;
  };
  for (const b of blocks) {
    if (b.type === 'p') {
      const text = b.text.trim();
      if (/^(dieu\s+\d|cac ben thong nhat|hai ben thong nhat|sau khi ban bac)/.test(foldVi(text))) {
        current = null;
        continue;
      }
      const marker = partyMarker(text);
      if (marker) {
        current = out.parties.find((p) => p.role === marker.role) ?? null;
        if (!current) {
          current = { role: marker.role };
          out.parties.push(current);
        }
        if (marker.name) put('name', marker.name);
        continue;
      }
      if (current) {
        for (const part of text.split(/\t+|\s{3,}/)) {
          const i = part.search(/[:：]/);
          if (i > 0) {
            const field = fieldOf(part.slice(0, i));
            if (field) put(field, part.slice(i + 1));
          }
        }
      }
    } else if (current) {
      for (const row of b.rows) {
        const cells = row.map((c) => c.trim()).filter((c, i) => c || i > 0);
        if (cells.length >= 2) {
          const field = fieldOf(cells[0]);
          if (field) put(field, cells.slice(1).join(' '));
        } else if (cells.length === 1) {
          const i = cells[0].search(/[:：]/);
          if (i > 0) {
            const field = fieldOf(cells[0].slice(0, i));
            if (field) put(field, cells[0].slice(i + 1));
          }
        }
      }
    }
  }
  out.parties = out.parties.filter((p) => Object.keys(p).length > 1);

  // Giá trị: "Tổng giá trị hợp đồng: 28.512.000"; nếu không có thì dòng "Tổng cộng" trong bảng giá.
  for (const l of lines) {
    const f = foldVi(l);
    if (/tong gia tri (hop dong|don hang)/.test(f)) {
      const v = parseVietnameseNumber(l.slice(l.search(/[:：]/) + 1));
      if (v && Number(v) > 0) {
        out.value = v;
        break;
      }
    }
  }
  if (!out.value) {
    for (const b of blocks) {
      if (b.type !== 'table') continue;
      for (const row of b.rows) {
        if (/^tong cong\b|^tong thanh toan\b/.test(foldVi(row.find((c) => c.trim()) ?? ''))) {
          const v = parseVietnameseNumber([...row].reverse().find((c) => /\d/.test(c)) ?? '');
          if (v && Number(v) > 0) out.value = v;
        }
      }
    }
  }
  for (const l of lines) {
    const m = l.match(/(?:VAT|GTGT)[^\d%]{0,20}(\d{1,2}(?:[.,]\d+)?)\s*%/i);
    if (m) {
      out.vatRate = Number(m[1].replace(',', '.'));
      break;
    }
  }
  const all = lines.join(' ');
  out.currency = /\bUSD\b/.test(all) ? 'USD' : /\bEUR\b/.test(all) ? 'EUR' : 'VND';
  return out;
}
