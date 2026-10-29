'use client';

/**
 * Font cho mọi file PDF tạo trong trình duyệt (hợp đồng, đề nghị thanh toán, phiếu xuất kho, phiếu gửi hàng).
 *
 * - Ưu tiên nhúng Times New Roman cài trên máy người dùng (Local Font Access API – Chrome/Edge trên máy tính,
 *   trình duyệt hỏi quyền "Truy cập phông chữ" một lần). Font này không được phép phát hành kèm ứng dụng nên chỉ
 *   đọc từ máy người dùng khi họ tạo PDF.
 * - Không hỗ trợ / không cho quyền / máy không có font ⇒ dùng Tinos (cùng hình dáng và số đo chữ với Times New Roman).
 */

type PdfMake = Pick<typeof import('pdfmake/build/pdfmake'), 'setFonts' | 'setUrlAccessPolicy' | 'addVirtualFileSystem'>;
type FontStyle = 'normal' | 'bold' | 'italics' | 'bolditalics';

interface LocalFont {
  postscriptName: string;
  blob(): Promise<Blob>;
}
type QueryLocalFonts = (options?: { postscriptNames?: string[] }) => Promise<LocalFont[]>;

const TIMES_POSTSCRIPT: Record<FontStyle, string> = {
  normal: 'TimesNewRomanPSMT',
  bold: 'TimesNewRomanPS-BoldMT',
  italics: 'TimesNewRomanPS-ItalicMT',
  bolditalics: 'TimesNewRomanPS-BoldItalicMT',
};
const TINOS_FILES: Record<FontStyle, string> = {
  normal: 'Tinos-Regular.ttf',
  bold: 'Tinos-Bold.ttf',
  italics: 'Tinos-Italic.ttf',
  bolditalics: 'Tinos-BoldItalic.ttf',
};
const STYLES = Object.keys(TIMES_POSTSCRIPT) as FontStyle[];

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Đọc đủ 4 kiểu Times New Roman từ máy (base64); thiếu kiểu nào hoặc không được phép thì trả null. */
async function readLocalTimes(): Promise<Record<FontStyle, string> | null> {
  const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  if (typeof query !== 'function') return null;
  try {
    const found = await query.call(window, { postscriptNames: Object.values(TIMES_POSTSCRIPT) });
    const byName = new Map(found.map((f) => [f.postscriptName, f]));
    if (STYLES.some((s) => !byName.has(TIMES_POSTSCRIPT[s]))) return null;
    const entries = await Promise.all(STYLES.map(async (s) => [s, toBase64(await (await byName.get(TIMES_POSTSCRIPT[s])!.blob()).arrayBuffer())] as const));
    return Object.fromEntries(entries) as Record<FontStyle, string>;
  } catch {
    return null; // người dùng từ chối quyền hoặc trình duyệt chặn (khung nhúng…)
  }
}

// Đọc một lần mỗi phiên; kết quả (kể cả "không có") dùng lại cho các lần tạo PDF sau.
let localTimes: Promise<Record<FontStyle, string> | null> | null = null;

/**
 * Khai báo font cho pdfmake và trả về tên font dùng trong `defaultStyle.font`.
 * Gọi ngay trong thao tác bấm nút của người dùng (trình duyệt chỉ hỏi quyền đọc font khi có thao tác người dùng).
 */
export async function setupPdfFonts(pdfMake: PdfMake): Promise<'Times New Roman' | 'Tinos'> {
  const origin = window.location.origin;
  // Chỉ cho phép tải font/ảnh từ chính ứng dụng (ảnh chữ ký là data URL, không cần mạng).
  pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(`${origin}/`));
  const tinos = Object.fromEntries(STYLES.map((s) => [s, `${origin}/fonts/tinos/${TINOS_FILES[s]}`])) as Record<FontStyle, string>;

  localTimes ??= readLocalTimes();
  const times = await localTimes;
  if (!times) {
    pdfMake.setFonts({ Tinos: tinos });
    return 'Tinos';
  }
  const file = (s: FontStyle) => `local-times-new-roman-${s}.ttf`;
  pdfMake.addVirtualFileSystem(Object.fromEntries(STYLES.map((s) => [file(s), times[s]])));
  pdfMake.setFonts({
    'Times New Roman': Object.fromEntries(STYLES.map((s) => [s, file(s)])) as Record<FontStyle, string>,
    Tinos: tinos,
  });
  return 'Times New Roman';
}
