/**
 * Phông chữ văn bản (hợp đồng, đơn, biên bản, đề nghị thanh toán) khi xem, in và xuất PDF – cấu hình theo doanh nghiệp
 * (Cấu hình → Phông chữ văn bản), lưu trong Tenant.settings.documentFont.
 */

export const DOCUMENT_FONT_FAMILIES = ['TIMES', 'ARIAL', 'ROBOTO', 'TAHOMA'] as const;
export type DocumentFontFamily = (typeof DOCUMENT_FONT_FAMILIES)[number];

export const DOCUMENT_FONT_LABELS: Record<DocumentFontFamily, string> = {
  TIMES: 'Times New Roman',
  ARIAL: 'Arial',
  ROBOTO: 'Roboto',
  TAHOMA: 'Tahoma',
};

/** Cỡ chữ thân văn bản (pt) cho phép chọn. */
export const DOCUMENT_FONT_SIZES = [11, 12, 13, 14] as const;

export interface DocumentFont {
  family: DocumentFontFamily;
  /** Cỡ chữ thân văn bản (pt) trên bản PDF; màn hình/bản in giữ cùng tỉ lệ. */
  size: number;
}

export const DEFAULT_DOCUMENT_FONT: DocumentFont = { family: 'TIMES', size: 12 };

/** Đọc cấu hình đã lưu (có thể thiếu/sai do dữ liệu cũ) – luôn trả về giá trị hợp lệ. */
export function parseDocumentFont(value: unknown): DocumentFont {
  const v = (value ?? {}) as Partial<DocumentFont>;
  const family = (DOCUMENT_FONT_FAMILIES as readonly string[]).includes(String(v.family)) ? (v.family as DocumentFontFamily) : DEFAULT_DOCUMENT_FONT.family;
  const size = (DOCUMENT_FONT_SIZES as readonly number[]).includes(Number(v.size)) ? Number(v.size) : DEFAULT_DOCUMENT_FONT.size;
  return { family, size };
}
