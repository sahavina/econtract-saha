import { DEFAULT_DOCUMENT_FONT, parseDocumentFont } from '@saha/shared';
import { describe, expect, it } from 'vitest';
import { documentFontSchema } from './company.service.js';

describe('phông chữ văn bản', () => {
  it('đọc cấu hình đã lưu; thiếu hoặc sai ⇒ mặc định Times New Roman 12pt', () => {
    expect(parseDocumentFont({ family: 'ROBOTO', size: 13 })).toEqual({ family: 'ROBOTO', size: 13 });
    expect(parseDocumentFont(undefined)).toEqual(DEFAULT_DOCUMENT_FONT);
    expect(parseDocumentFont({ family: 'COMIC', size: 40 })).toEqual(DEFAULT_DOCUMENT_FONT);
    expect(parseDocumentFont({ family: 'TAHOMA', size: 9 })).toEqual({ family: 'TAHOMA', size: 12 });
  });

  it('chỉ nhận phông và cỡ chữ trong danh sách', () => {
    expect(documentFontSchema.parse({ family: 'ARIAL', size: '14' })).toEqual({ family: 'ARIAL', size: 14 });
    expect(documentFontSchema.safeParse({ family: 'ARIAL', size: 15 }).success).toBe(false);
    expect(documentFontSchema.safeParse({ family: 'Calibri', size: 12 }).success).toBe(false);
  });
});
