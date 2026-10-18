import { escapeHtml } from '@saha/shared';
import { createSignatureSchema, externalSignSchema, internalSignSchema } from './signatures.schemas.js';
import { frozenAttachments } from './signatures.service.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';

describe('signature schemas', () => {
  it('requires a mark (drawn or typed) and explicit consent', () => {
    expect(externalSignSchema.safeParse({ otp: '123456', typedName: 'Nguyễn Văn A', consent: true }).success).toBe(
      true,
    );
    expect(externalSignSchema.safeParse({ otp: '123456', signatureImage: png, consent: true }).success).toBe(true);
    expect(externalSignSchema.safeParse({ otp: '123456', consent: true }).success).toBe(false);
    expect(externalSignSchema.safeParse({ otp: '123456', typedName: 'Nguyễn Văn A', consent: false }).success).toBe(
      false,
    );
    expect(externalSignSchema.safeParse({ otp: '12345', typedName: 'Nguyễn Văn A', consent: true }).success).toBe(
      false,
    );
  });

  it('rejects non-PNG or script payloads as signature image', () => {
    expect(
      internalSignSchema.safeParse({ password: 'x', signatureImage: 'javascript:alert(1)', consent: true }).success,
    ).toBe(false);
    expect(
      internalSignSchema.safeParse({
        password: 'x',
        signatureImage: 'data:image/svg+xml;base64,PHN2Zz4=',
        consent: true,
      }).success,
    ).toBe(false);
  });

  it('requires unique signer emails', () => {
    const s = { name: 'A', email: 'a@x.vn' };
    expect(createSignatureSchema.safeParse({ signers: [s, { ...s, email: 'A@x.vn' }] }).success).toBe(false);
    expect(createSignatureSchema.safeParse({ signers: [s, { name: 'B', email: 'b@x.vn' }] }).success).toBe(true);
  });
});

describe('frozenAttachments', () => {
  const h1 = 'a'.repeat(64);
  const h2 = 'b'.repeat(64);
  const table = (rows: [string, number, string][]) =>
    `<h3>Tài liệu đính kèm</h3><table><thead><tr><th>Tên file</th><th>Phiên bản</th><th>SHA-256</th></tr></thead><tbody>${rows
      .map(([n, v, h]) => `<tr><td>${escapeHtml(n)}</td><td>v${v}</td><td>${h}</td></tr>`)
      .join('')}</tbody></table>`;

  it('reads file name (escaped), version and hash of each frozen attachment', () => {
    const snap = '<p>Nội dung</p>' + table([['Hợp đồng & phụ lục "A".pdf', 2, h1], ['bang-gia.xlsx', 1, h2]]);
    expect(frozenAttachments(snap)).toEqual([
      { fileName: escapeHtml('Hợp đồng & phụ lục "A".pdf'), version: 2, sha256: h1 },
      { fileName: 'bang-gia.xlsx', version: 1, sha256: h2 },
    ]);
  });

  it('ignores hashes that are not in attachment rows', () => {
    expect(frozenAttachments(`<p>${h1}</p><table><tr><td>${h1}</td></tr></table>`)).toEqual([]);
    expect(frozenAttachments('<p>Không có tài liệu</p>')).toEqual([]);
  });
});
