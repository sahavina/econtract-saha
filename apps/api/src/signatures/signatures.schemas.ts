import { z } from 'zod';

const MAX_SIGNATURE_IMAGE = 300_000;

export const signerInputSchema = z.object({
  partyRole: z.enum(['PARTY_A', 'PARTY_B', 'PARTY_C', 'RELATED']).nullable().optional(),
  name: z.string().trim().min(1, 'Nhập tên người ký').max(255),
  email: z.email('Email người ký không hợp lệ').trim().toLowerCase(),
  title: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(255).nullable().optional()),
  /** Người ký nội bộ (tài khoản trong hệ thống); bỏ trống = người ký bên ngoài qua liên kết + OTP. */
  userId: z.preprocess((v) => (v === '' ? null : v), z.uuid().nullable().optional()),
});

export const createSignatureSchema = z
  .object({
    signingOrder: z.enum(['SEQUENTIAL', 'PARALLEL']).default('SEQUENTIAL'),
    expiresInDays: z.coerce.number().int().min(1).max(60).default(7),
    message: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(2000).nullable().optional()),
    signers: z.array(signerInputSchema).min(1, 'Cần ít nhất một người ký').max(10),
  })
  .refine((v) => new Set(v.signers.map((s) => s.email)).size === v.signers.length, {
    message: 'Mỗi người ký phải có email khác nhau',
    path: ['signers'],
  });
export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;

/** Chữ ký: ảnh vẽ tay (PNG data URL) hoặc họ tên gõ; bắt buộc đồng ý ký điện tử. */
const signatureMark = {
  signatureImage: z
    .string()
    .max(MAX_SIGNATURE_IMAGE, 'Ảnh chữ ký quá lớn')
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Ảnh chữ ký không hợp lệ')
    .optional(),
  typedName: z.string().trim().min(2).max(120).optional(),
  consent: z.literal(true, 'Bạn cần đồng ý ký điện tử'),
};

const hasMark = (v: { signatureImage?: string; typedName?: string }) => !!v.signatureImage || !!v.typedName;
const MARK_MSG = { message: 'Vui lòng vẽ chữ ký hoặc nhập họ tên', path: ['signatureImage'] };

export const internalSignSchema = z
  .object({ ...signatureMark, password: z.string().min(1, 'Nhập mật khẩu để xác nhận') })
  .refine(hasMark, MARK_MSG);
export type InternalSignInput = z.infer<typeof internalSignSchema>;

export const externalSignSchema = z
  .object({ ...signatureMark, otp: z.string().regex(/^\d{6}$/, 'Mã OTP gồm 6 chữ số') })
  .refine(hasMark, MARK_MSG);
export type ExternalSignInput = z.infer<typeof externalSignSchema>;

export const rejectSchema = z.object({ reason: z.string().trim().min(1, 'Vui lòng nhập lý do từ chối').max(2000) });
export type RejectInput = z.infer<typeof rejectSchema>;

export const signatureListSchema = z.object({
  view: z.enum(['all', 'mine', 'waiting_partner', 'completed', 'rejected', 'expired']).default('all'),
});
export type SignatureListQuery = z.infer<typeof signatureListSchema>;
