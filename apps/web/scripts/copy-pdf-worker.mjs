// Chép worker của pdf.js vào public/ để trình duyệt tải cùng origin (đọc lớp chữ PDF khi tạo đơn từ file).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = createRequire(import.meta.url).resolve('pdfjs-dist/build/pdf.worker.min.mjs');
mkdirSync(join(root, 'public', 'vendor'), { recursive: true });
copyFileSync(src, join(root, 'public', 'vendor', 'pdf.worker.min.mjs'));

// Phông Roboto (đủ dấu tiếng Việt) lấy từ pdfmake: dùng cho bản xem/in (@font-face) và PDF khi chọn phông Roboto.
const robotoSrc = join(dirname(createRequire(import.meta.url).resolve('pdfmake/build/pdfmake.js')), 'fonts', 'Roboto');
mkdirSync(join(root, 'public', 'fonts', 'roboto'), { recursive: true });
for (const f of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf']) {
  copyFileSync(join(robotoSrc, f), join(root, 'public', 'fonts', 'roboto', f));
}
