'use client';

import { DEFAULT_DOCUMENT_FONT, type DocumentFont, type DocumentFontFamily } from '@saha/shared';

/**
 * Phông chữ văn bản của doanh nghiệp (Cấu hình → Phông chữ văn bản), nhận qua /auth/me.
 * Màn hình/bản in: biến CSS --doc-font-family, --doc-font-size trên <html> (globals.css dùng cho .contract-content, .a4-page).
 * PDF: pdf-fonts.ts và contract-pdf.ts đọc currentDocumentFont().
 */

/** Chuỗi font CSS: phông trên máy người dùng trước, phông web đi kèm ứng dụng làm dự phòng. */
export const DOCUMENT_FONT_CSS: Record<DocumentFontFamily, string> = {
  TIMES: "'Times New Roman', 'Tinos', Times, serif",
  ARIAL: "Arial, 'Helvetica Neue', Helvetica, 'Roboto', sans-serif",
  ROBOTO: "'Roboto', Arial, sans-serif",
  TAHOMA: "Tahoma, Verdana, 'Roboto', sans-serif",
};

/** Cỡ chữ màn hình tương ứng cỡ PDF: cỡ mặc định 12pt ứng với 0.95rem như trước đây. */
const screenSize = (pt: number) => `${((0.95 * pt) / DEFAULT_DOCUMENT_FONT.size).toFixed(4)}rem`;

let current: DocumentFont = DEFAULT_DOCUMENT_FONT;

export function currentDocumentFont(): DocumentFont {
  return current;
}

/** Ghi nhận phông của doanh nghiệp và áp dụng cho toàn trang (gọi khi tải/đổi thông tin đăng nhập hoặc lưu cấu hình). */
export function applyDocumentFont(font: DocumentFont | null | undefined) {
  current = font ?? DEFAULT_DOCUMENT_FONT;
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  root.setProperty('--doc-font-family', DOCUMENT_FONT_CSS[current.family]);
  root.setProperty('--doc-font-size', screenSize(current.size));
}
