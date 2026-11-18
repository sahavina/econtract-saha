'use client';

import type { DocumentFontFamily } from '@saha/shared';
import { currentDocumentFont } from '@/lib/document-font';

/**
 * Font cho mọi file PDF tạo trong trình duyệt (hợp đồng, biên bản, đề nghị thanh toán, phiếu xuất kho, phiếu gửi hàng),
 * theo phông chữ văn bản của doanh nghiệp (Cấu hình → Phông chữ văn bản).
 *
 * - Times New Roman, Arial, Tahoma: ưu tiên nhúng phông cài trên máy người dùng (Local Font Access API – Chrome/Edge
 *   trên máy tính, trình duyệt hỏi quyền "Truy cập phông chữ" một lần). Các phông này không được phép phát hành kèm
 *   ứng dụng nên chỉ đọc từ máy người dùng khi họ tạo PDF.
 * - Không hỗ trợ / không cho quyền / máy không có phông ⇒ dùng phông đi kèm ứng dụng: Tinos (cùng số đo chữ với
 *   Times New Roman) cho Times New Roman, Roboto cho Arial/Tahoma.
 * - Roboto: phông đi kèm ứng dụng (chép từ pdfmake khi build).
 */

type PdfMake = Pick<typeof import('pdfmake/build/pdfmake'), 'setFonts' | 'setUrlAccessPolicy' | 'addVirtualFileSystem'>;
type FontStyle = 'normal' | 'bold' | 'italics' | 'bolditalics';
type FontFiles = Record<FontStyle, string>;

interface LocalFont {
  postscriptName: string;
  blob(): Promise<Blob>;
}
type QueryLocalFonts = (options?: { postscriptNames?: string[] }) => Promise<LocalFont[]>;

const STYLES: FontStyle[] = ['normal', 'bold', 'italics', 'bolditalics'];

/** Tên PostScript của phông trên máy; Tahoma không có kiểu nghiêng ⇒ nghiêng dùng chữ đứng tương ứng. */
const LOCAL: Partial<Record<DocumentFontFamily, { name: string; postscript: FontFiles }>> = {
  TIMES: {
    name: 'Times New Roman',
    postscript: { normal: 'TimesNewRomanPSMT', bold: 'TimesNewRomanPS-BoldMT', italics: 'TimesNewRomanPS-ItalicMT', bolditalics: 'TimesNewRomanPS-BoldItalicMT' },
  },
  ARIAL: {
    name: 'Arial',
    postscript: { normal: 'ArialMT', bold: 'Arial-BoldMT', italics: 'Arial-ItalicMT', bolditalics: 'Arial-BoldItalicMT' },
  },
  TAHOMA: {
    name: 'Tahoma',
    postscript: { normal: 'Tahoma', bold: 'Tahoma-Bold', italics: 'Tahoma', bolditalics: 'Tahoma-Bold' },
  },
};

const BUNDLED: Record<'Tinos' | 'Roboto', FontFiles> = {
  Tinos: { normal: 'tinos/Tinos-Regular.ttf', bold: 'tinos/Tinos-Bold.ttf', italics: 'tinos/Tinos-Italic.ttf', bolditalics: 'tinos/Tinos-BoldItalic.ttf' },
  Roboto: { normal: 'roboto/Roboto-Regular.ttf', bold: 'roboto/Roboto-Medium.ttf', italics: 'roboto/Roboto-Italic.ttf', bolditalics: 'roboto/Roboto-MediumItalic.ttf' },
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Đọc đủ các kiểu của một phông từ máy (base64); thiếu kiểu nào hoặc không được phép thì trả null. */
async function readLocal(postscript: FontFiles): Promise<FontFiles | null> {
  const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  if (typeof query !== 'function') return null;
  try {
    const names = [...new Set(Object.values(postscript))];
    const found = await query.call(window, { postscriptNames: names });
    const byName = new Map(found.map((f) => [f.postscriptName, f]));
    if (names.some((n) => !byName.has(n))) return null;
    const data = new Map(await Promise.all(names.map(async (n) => [n, toBase64(await (await byName.get(n)!.blob()).arrayBuffer())] as const)));
    return Object.fromEntries(STYLES.map((s) => [s, data.get(postscript[s])!])) as FontFiles;
  } catch {
    return null; // người dùng từ chối quyền hoặc trình duyệt chặn (khung nhúng…)
  }
}

// Đọc mỗi phông một lần mỗi phiên; kết quả (kể cả "không có") dùng lại cho các lần tạo PDF sau.
const localCache = new Map<DocumentFontFamily, Promise<FontFiles | null>>();

/**
 * Khai báo font cho pdfmake và trả về tên font dùng trong `defaultStyle.font`.
 * Gọi ngay trong thao tác bấm nút của người dùng (trình duyệt chỉ hỏi quyền đọc font khi có thao tác người dùng).
 */
export async function setupPdfFonts(pdfMake: PdfMake, family: DocumentFontFamily = currentDocumentFont().family): Promise<string> {
  const origin = window.location.origin;
  // Chỉ cho phép tải font/ảnh từ chính ứng dụng (ảnh chữ ký là data URL, không cần mạng).
  pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(`${origin}/`));
  const bundled = (name: keyof typeof BUNDLED) => Object.fromEntries(STYLES.map((s) => [s, `${origin}/fonts/${BUNDLED[name][s]}`])) as FontFiles;
  const fonts: Record<string, FontFiles> = { Tinos: bundled('Tinos'), Roboto: bundled('Roboto') };
  const fallback = family === 'TIMES' ? 'Tinos' : 'Roboto';

  const local = LOCAL[family];
  if (!local) {
    pdfMake.setFonts(fonts);
    return fallback;
  }
  if (!localCache.has(family)) localCache.set(family, readLocal(local.postscript));
  const files = await localCache.get(family)!;
  if (!files) {
    pdfMake.setFonts(fonts);
    return fallback;
  }
  const file = (s: FontStyle) => `local-${family.toLowerCase()}-${s}.ttf`;
  pdfMake.addVirtualFileSystem(Object.fromEntries(STYLES.map((s) => [file(s), files[s]])));
  pdfMake.setFonts({ ...fonts, [local.name]: Object.fromEntries(STYLES.map((s) => [s, file(s)])) as FontFiles });
  return local.name;
}
