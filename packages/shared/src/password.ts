/** Chính sách mật khẩu: tối thiểu 8 ký tự, có chữ và số. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE_MESSAGE = 'Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số';

export function isStrongPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= 128 && /[A-Za-z]/.test(value) && /\d/.test(value);
}
