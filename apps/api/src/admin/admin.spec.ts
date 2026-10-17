import { isStrongPassword } from '@saha/shared';
import { contractTypeCreateSchema, previewCode } from './contract-types.service.js';
import { roleCreateSchema, roleUpdateSchema } from './roles.service.js';
import { userCreateSchema, userUpdateSchema } from './users.service.js';

const uuid = '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b';

describe('admin schemas', () => {
  it('enforces password policy', () => {
    expect(isStrongPassword('Saha@123456')).toBe(true);
    expect(isStrongPassword('abcdefgh')).toBe(false);
    expect(isStrongPassword('12345678')).toBe(false);
    expect(isStrongPassword('a1')).toBe(false);
  });

  it('requires roles and strong password on user create; update injects no defaults', () => {
    expect(
      userCreateSchema.safeParse({ email: 'a@b.vn', fullName: 'A', password: 'Matkhau123', roleIds: [uuid] }).success,
    ).toBe(true);
    expect(
      userCreateSchema.safeParse({ email: 'a@b.vn', fullName: 'A', password: 'Matkhau123', roleIds: [] }).success,
    ).toBe(false);
    expect(userUpdateSchema.parse({ fullName: 'B' })).toEqual({ fullName: 'B' });
  });

  it('rejects unknown permissions', () => {
    expect(roleCreateSchema.safeParse({ code: 'x', name: 'X', permissions: ['contract.view_all'] }).success).toBe(true);
    expect(roleCreateSchema.safeParse({ code: 'x', name: 'X', permissions: ['root.all'] }).success).toBe(false);
    expect(roleUpdateSchema.parse({ name: 'Y' })).toEqual({ name: 'Y' });
  });

  it('validates contract code patterns and previews them', () => {
    expect(contractTypeCreateSchema.safeParse({ code: 'hdtv', name: 'TV', codePattern: 'TV-{YYYY}' }).success).toBe(
      false,
    );
    const ok = contractTypeCreateSchema.parse({
      code: 'hdtv',
      name: 'TV',
      codePattern: '{TYPE}/{BRANCH}/{SEQUENCE:3}',
    });
    expect(ok.code).toBe('HDTV');
    expect(previewCode(ok.codePattern, ok.code)).toBe('HDTV/HN/001');
  });
});
