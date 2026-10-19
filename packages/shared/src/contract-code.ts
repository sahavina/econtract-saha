/**
 * Sinh mã hợp đồng theo mẫu cấu hình.
 *
 * Token hỗ trợ: {TYPE} {DEPT} {BRANCH} {YYYY} {YY} {MM} {DD} {PARTNER} {SEQUENCE} {SEQUENCE:n}
 * Ví dụ: "HD-{YYYY}-{SEQUENCE:5}" → "HD-2026-00012"
 *        "{DD}{MM}/{YYYY}/HĐNT/{PARTNER}-SAHA" → "0501/2026/HĐNT/APOLLO-SAHA"
 *
 * Bộ đếm được tách theo phần "tiền tố" của mẫu sau khi thay các token ngữ cảnh,
 * nên mẫu chứa {YYYY} sẽ tự động reset theo năm, chứa {TYPE} sẽ đếm riêng theo loại, v.v.
 * Mẫu không có {SEQUENCE}: mã trùng được thêm hậu tố "-2", "-3"… khi tạo.
 */
export const DEFAULT_CONTRACT_CODE_PATTERN = 'HD-{YYYY}-{SEQUENCE:5}';

export const CODE_TOKENS = ['{TYPE}', '{DEPT}', '{BRANCH}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{PARTNER}'] as const;

export interface CodeContext {
  /** Ngày dùng cho {YYYY}/{YY}/{MM}/{DD}: ngày dự kiến ký, không có thì ngày tạo. */
  date: Date;
  typeCode?: string | null;
  departmentCode?: string | null;
  branchCode?: string | null;
  /** Tên viết tắt của đối tác (bên không phải nội bộ). */
  partnerCode?: string | null;
}

const SEQ_RE = /\{SEQUENCE(?::(\d{1,2}))?\}/g;

export function hasSequence(pattern: string): boolean {
  return (pattern.match(SEQ_RE)?.length ?? 0) > 0;
}

export function validateCodePattern(pattern: string): string | null {
  if (!pattern.trim()) return 'Vui lòng nhập mẫu mã hợp đồng';
  if ((pattern.match(SEQ_RE)?.length ?? 0) > 1) return 'Mẫu mã chỉ được chứa tối đa một token {SEQUENCE} hoặc {SEQUENCE:n}';
  const unknown = pattern
    .replace(SEQ_RE, '')
    .match(/\{[^}]*\}/g)
    ?.filter((t) => !(CODE_TOKENS as readonly string[]).includes(t));
  if (unknown?.length) return `Token không hợp lệ: ${unknown.join(', ')}`;
  return null;
}

function applyContext(pattern: string, ctx: CodeContext): string {
  const yyyy = String(ctx.date.getFullYear());
  const mm = String(ctx.date.getMonth() + 1).padStart(2, '0');
  const dd = String(ctx.date.getDate()).padStart(2, '0');
  return pattern
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{YY}', yyyy.slice(2))
    .replaceAll('{MM}', mm)
    .replaceAll('{DD}', dd)
    .replaceAll('{TYPE}', ctx.typeCode ?? 'HD')
    .replaceAll('{DEPT}', ctx.departmentCode ?? 'CHUNG')
    .replaceAll('{BRANCH}', ctx.branchCode ?? 'HO')
    .replaceAll('{PARTNER}', ctx.partnerCode || 'DOITAC');
}

/** Khóa bộ đếm: mẫu đã thay ngữ cảnh, token SEQUENCE thay bằng "#". */
export function sequenceKey(pattern: string, ctx: CodeContext): string {
  return `contract:${applyContext(pattern, ctx).replace(SEQ_RE, '#')}`;
}

export function renderCode(pattern: string, ctx: CodeContext, sequence: number): string {
  return applyContext(pattern, ctx).replace(SEQ_RE, (_m, width?: string) =>
    String(sequence).padStart(width ? Number(width) : 1, '0'),
  );
}

/** Mã trùng ⇒ thêm hậu tố "-2", "-3"… (dùng cho mẫu không có {SEQUENCE}). */
export function withDuplicateSuffix(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Từ chỉ loại hình/ngành nghề bỏ đi khi tự rút gọn tên công ty. */
const LEGAL_WORDS = [
  'cong ty',
  'cty',
  'trach nhiem huu han',
  'tnhh',
  'co phan',
  'cp',
  'tap doan',
  'mot thanh vien',
  'hai thanh vien',
  'mtv',
  'doanh nghiep tu nhan',
  'dntn',
  'chi nhanh',
  'thuong mai',
  'dich vu',
  'san xuat',
  'xuat nhap khau',
  'xnk',
  'dau tu',
  'xay dung',
  'phat trien',
  'va',
];

/**
 * Tên viết tắt tự suy từ tên đối tác khi chưa khai báo: bỏ loại hình công ty, lấy 2 từ cuối, không dấu, viết hoa.
 * "CÔNG TY CỔ PHẦN TẬP ĐOÀN THUẬN THÀNH" → "THUANTHANH"; "Nguyễn Văn A" → "VANA".
 */
export function partnerAbbreviation(name: string | null | undefined): string | null {
  if (!name) return null;
  let s = ` ${name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')} `;
  for (const w of LEGAL_WORDS) s = s.replaceAll(` ${w} `, ' ');
  const words = s.trim().split(/\s+/).filter(Boolean);
  const short = words.slice(-2).join('').toUpperCase().slice(0, 20);
  return short || null;
}
