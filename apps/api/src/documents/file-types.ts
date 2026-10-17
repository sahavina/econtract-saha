/** Dung lượng tối đa mỗi file tải lên. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

interface FileType {
  mime: string;
  /** Chữ ký nhị phân ở đầu file (magic bytes). */
  signature: number[];
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** Danh sách định dạng được phép. MIME lưu theo bảng này, không tin giá trị client gửi. */
export const ALLOWED_FILE_TYPES: Record<string, FileType> = {
  pdf: { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: ZIP },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: ZIP },
  png: { mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  jpeg: { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_FILE_TYPES);

/** Multer giải mã tên file theo latin1; chuyển lại UTF-8 và loại ký tự nguy hiểm. */
export function normalizeFileName(raw: string): string {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  const name = utf8
    .normalize('NFC')
    // Loại ký tự điều khiển một cách có chủ đích.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return (name || 'tai-lieu').slice(-200);
}

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

/** Trả về MIME chuẩn nếu đuôi file được phép và nội dung khớp chữ ký, ngược lại null. */
export function detectFileType(fileName: string, data: Buffer): string | null {
  const type = ALLOWED_FILE_TYPES[extensionOf(fileName)];
  if (!type) return null;
  const ok = type.signature.every((b, i) => data[i] === b);
  return ok ? type.mime : null;
}
