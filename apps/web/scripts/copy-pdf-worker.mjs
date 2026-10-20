// Chép worker của pdf.js vào public/ để trình duyệt tải cùng origin (đọc lớp chữ PDF khi tạo đơn từ file).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = createRequire(import.meta.url).resolve('pdfjs-dist/build/pdf.worker.min.mjs');
mkdirSync(join(root, 'public', 'vendor'), { recursive: true });
copyFileSync(src, join(root, 'public', 'vendor', 'pdf.worker.min.mjs'));
