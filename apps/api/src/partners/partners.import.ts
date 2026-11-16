import { foldVi, PARTNER_TYPE_LABELS, PARTNER_TYPES, type PartnerType } from '@saha/shared';
import { z } from 'zod';
import { type PartnerInput, partnerInputSchema } from './partners.schemas.js';

/** Tối đa số dòng mỗi lần nhập. */
export const PARTNER_IMPORT_MAX_ROWS = 2000;

/** Mỗi dòng là bản ghi đã map từ tiêu đề cột (web gửi lên); giá trị phân loại có thể là nhãn tiếng Việt. */
export const partnerImportSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, 'File không có dòng dữ liệu nào')
    .max(PARTNER_IMPORT_MAX_ROWS, `Mỗi lần nhập tối đa ${PARTNER_IMPORT_MAX_ROWS} dòng`),
  /** Mã đã có ⇒ cập nhật thông tin (mặc định bỏ qua). */
  updateExisting: z.boolean().default(false),
  /** Chỉ kiểm tra, không ghi. */
  dryRun: z.boolean().default(true),
});
export type PartnerImportInput = z.infer<typeof partnerImportSchema>;

export type ImportAction = 'create' | 'update' | 'skip' | 'error';
export interface ImportRowResult {
  row: number;
  code: string;
  name: string;
  action: ImportAction;
  errors: string[];
}
export interface PlannedRow {
  action: 'create' | 'update';
  existingId?: string;
  /** Cập nhật: chỉ gồm mã và các cột có giá trị trong file. */
  data: PartnerInput;
}

const TYPE_BY_LABEL = new Map<string, PartnerType>([
  ...PARTNER_TYPES.map((t) => [foldVi(t), t] as const),
  ...PARTNER_TYPES.map((t) => [foldVi(PARTNER_TYPE_LABELS[t]), t] as const),
  ['khach hang', 'CUSTOMER'],
  ['kh', 'CUSTOMER'],
  ['nha cung cap', 'SUPPLIER'],
  ['ncc', 'SUPPLIER'],
  ['ca hai', 'BOTH'],
  ['khach hang va nha cung cap', 'BOTH'],
  ['khac', 'OTHER'],
]);
const ENTITY_BY_LABEL = new Map<string, 'ORGANIZATION' | 'INDIVIDUAL'>([
  ['organization', 'ORGANIZATION'],
  ['to chuc', 'ORGANIZATION'],
  ['doanh nghiep', 'ORGANIZATION'],
  ['cong ty', 'ORGANIZATION'],
  ['individual', 'INDIVIDUAL'],
  ['ca nhan', 'INDIVIDUAL'],
]);

/** Ô Excel: chuỗi/số/boolean → chuỗi đã cắt khoảng trắng; kiểu khác ⇒ rỗng. */
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v).trim() : '');

/**
 * Kiểm tra từng dòng và quyết định tạo mới / cập nhật / bỏ qua.
 * existing: đối tác cùng doanh nghiệp theo mã (kể cả đã xóa – mã vẫn bị giữ do ràng buộc duy nhất).
 * users: email (chữ thường) → id người dùng cùng doanh nghiệp.
 */
export function planPartnerImport(
  input: Pick<PartnerImportInput, 'rows' | 'updateExisting'>,
  existing: Map<string, { id: string; deleted: boolean }>,
  users: Map<string, string>,
) {
  const results: ImportRowResult[] = [];
  const planned: PlannedRow[] = [];
  const seen = new Map<string, number>();

  input.rows.forEach((raw, i) => {
    const row = Number(raw.rowNumber) || i + 2;
    const code = text(raw.code);
    const name = text(raw.name);
    const errors: string[] = [];

    const typeText = text(raw.type);
    const type = typeText ? TYPE_BY_LABEL.get(foldVi(typeText).replace(/&/g, 'va').replace(/\s+/g, ' ')) : 'CUSTOMER';
    if (!type) errors.push(`Phân loại “${typeText}” không hợp lệ (Khách hàng, Nhà cung cấp, Khách hàng & Nhà cung cấp, Đối tác khác)`);
    const entityText = text(raw.entityType);
    const entityType = entityText ? ENTITY_BY_LABEL.get(foldVi(entityText)) : 'ORGANIZATION';
    if (!entityType) errors.push(`Loại pháp nhân “${entityText}” không hợp lệ (Tổ chức hoặc Cá nhân)`);

    const ownerEmail = text(raw.ownerEmail).toLowerCase();
    const ownerId = ownerEmail ? users.get(ownerEmail) : undefined;
    if (ownerEmail && !ownerId) errors.push(`Không có người dùng có email “${ownerEmail}” trong doanh nghiệp`);

    const parsed = partnerInputSchema.safeParse({
      code,
      name,
      type: type ?? 'CUSTOMER',
      entityType: entityType ?? 'ORGANIZATION',
      shortName: text(raw.shortName),
      taxCode: text(raw.taxCode),
      idNumber: text(raw.idNumber),
      address: text(raw.address),
      email: text(raw.email),
      phone: text(raw.phone),
      representative: text(raw.representative),
      position: text(raw.position),
      note: text(raw.note),
      ...(ownerId && { ownerId }),
    });
    if (!parsed.success) errors.push(...parsed.error.issues.map((x) => x.message));

    if (code) {
      const key = code.toLowerCase();
      const first = seen.get(key);
      if (first) errors.push(`Trùng mã với dòng ${first} trong file`);
      else seen.set(key, row);
    }

    const found = existing.get(code);
    if (found?.deleted) errors.push('Mã đã dùng cho một đối tác đã xóa – dùng mã khác');

    if (errors.length || !parsed.success) {
      results.push({ row, code, name, action: 'error', errors });
      return;
    }
    if (found && !input.updateExisting) {
      results.push({ row, code, name, action: 'skip', errors: [] });
      return;
    }
    const action = found ? 'update' : 'create';
    // Cập nhật: chỉ ghi các cột có giá trị trong file – ô trống / thiếu cột giữ nguyên dữ liệu đang có
    // (kể cả Phân loại, Loại pháp nhân: không đặt lại về mặc định).
    const data = found
      ? (Object.fromEntries(
          Object.entries(parsed.data).filter(([k]) => k === 'code' || (k === 'ownerId' ? !!ownerId : !!text(raw[k]))),
        ) as PartnerInput)
      : parsed.data;
    planned.push({ action, existingId: found?.id, data });
    results.push({ row, code, name, action, errors: [] });
  });

  const count = (a: ImportAction) => results.filter((r) => r.action === a).length;
  return {
    planned,
    summary: { total: results.length, create: count('create'), update: count('update'), skip: count('skip'), error: count('error') },
    rows: results,
  };
}
