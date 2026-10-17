import { createSignatureSchema, externalSignSchema, internalSignSchema } from './signatures.schemas.js';

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
