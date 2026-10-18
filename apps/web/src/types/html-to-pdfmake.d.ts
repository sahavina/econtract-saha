// html-to-pdfmake không kèm định nghĩa kiểu; chỉ khai báo phần đang dùng.
declare module 'html-to-pdfmake' {
  import type { Content } from 'pdfmake/interfaces';

  interface HtmlToPdfmakeOptions {
    window?: Window;
    defaultStyles?: Record<string, Record<string, unknown>>;
    tableAutoSize?: boolean;
    removeExtraBlanks?: boolean;
    imagesByReference?: boolean;
  }

  export default function htmlToPdfmake(html: string, options?: HtmlToPdfmakeOptions): Content;
}
