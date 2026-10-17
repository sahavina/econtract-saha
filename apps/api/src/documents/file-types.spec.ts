import { detectFileType, normalizeFileName } from './file-types.js';

describe('file types', () => {
  it('accepts matching signatures and rejects spoofed files', () => {
    expect(detectFileType('a.pdf', Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectFileType('a.PDF', Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectFileType('a.pdf', Buffer.from('<html>'))).toBeNull();
    expect(detectFileType('a.exe', Buffer.from('MZ'))).toBeNull();
    expect(detectFileType('a.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toContain('wordprocessingml');
  });

  it('restores UTF-8 names from multer latin1 and strips path chars', () => {
    const latin1 = Buffer.from('Hợp đồng/../x.pdf', 'utf8').toString('latin1');
    expect(normalizeFileName(latin1)).toBe('Hợp đồng_.._x.pdf');
  });
});
