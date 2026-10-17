/**
 * Sinh mã hợp đồng theo mẫu cấu hình.
 *
 * Token hỗ trợ: {TYPE} {DEPT} {BRANCH} {YYYY} {YY} {MM} {SEQUENCE} {SEQUENCE:n}
 * Ví dụ: "HD-{YYYY}-{SEQUENCE:5}" → "HD-2026-00012"
 *
 * Bộ đếm được tách theo phần "tiền tố" của mẫu sau khi thay các token ngữ cảnh,
 * nên mẫu chứa {YYYY} sẽ tự động reset theo năm, chứa {TYPE} sẽ đếm riêng theo loại, v.v.
 */
export const DEFAULT_CONTRACT_CODE_PATTERN = 'HD-{YYYY}-{SEQUENCE:5}';

export interface CodeContext {
  date: Date;
  typeCode?: string | null;
  departmentCode?: string | null;
  branchCode?: string | null;
}

const SEQ_RE = /\{SEQUENCE(?::(\d{1,2}))?\}/g;

export function validateCodePattern(pattern: string): string | null {
  const matches = pattern.match(SEQ_RE);
  if (!matches || matches.length !== 1) return 'Mẫu mã phải chứa đúng một token {SEQUENCE} hoặc {SEQUENCE:n}';
  const unknown = pattern
    .replace(SEQ_RE, '')
    .match(/\{[^}]*\}/g)
    ?.filter((t) => !['{TYPE}', '{DEPT}', '{BRANCH}', '{YYYY}', '{YY}', '{MM}'].includes(t));
  if (unknown?.length) return `Token không hợp lệ: ${unknown.join(', ')}`;
  return null;
}

function applyContext(pattern: string, ctx: CodeContext): string {
  const yyyy = String(ctx.date.getFullYear());
  const mm = String(ctx.date.getMonth() + 1).padStart(2, '0');
  return pattern
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{YY}', yyyy.slice(2))
    .replaceAll('{MM}', mm)
    .replaceAll('{TYPE}', ctx.typeCode ?? 'HD')
    .replaceAll('{DEPT}', ctx.departmentCode ?? 'CHUNG')
    .replaceAll('{BRANCH}', ctx.branchCode ?? 'HO');
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
