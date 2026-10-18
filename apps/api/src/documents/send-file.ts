import type { Response } from 'express';

/** Header trả file tài liệu: tên file UTF-8 an toàn, kích thước và SHA-256 để bên nhận đối chiếu. */
export function setFileHeaders(
  res: Response,
  doc: { fileName: string; mimeType: string; size: number; sha256: string },
) {
  const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
  );
  res.setHeader('Content-Length', String(doc.size));
  res.setHeader('X-Content-SHA256', doc.sha256);
  res.setHeader('Cache-Control', 'private, no-store');
}
