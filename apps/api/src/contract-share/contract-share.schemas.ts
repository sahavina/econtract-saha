import { z } from 'zod';

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const createShareLinkSchema = z
  .object({
    recipientName: z.preprocess(blankToNull, z.string().trim().max(120).nullable().optional()),
    recipientEmail: z.preprocess(blankToNull, z.email('Email người nhận không hợp lệ').trim().toLowerCase().max(200).nullable().optional()),
    expiresInDays: z.coerce.number().int().min(1, 'Tối thiểu 1 ngày').max(90, 'Tối đa 90 ngày').default(14),
    sendEmail: z.boolean().default(false),
    message: z.preprocess(blankToNull, z.string().trim().max(1000).nullable().optional()),
  })
  .refine((v) => !v.sendEmail || !!v.recipientEmail, {
    message: 'Nhập email người nhận để gửi email',
    path: ['recipientEmail'],
  });
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

/** Liên hệ của khách: email hoặc số điện thoại. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ().-]{8,20}$/;

export const FEEDBACK_MESSAGE_MAX = 4000;

/** Khách gửi yêu cầu bổ sung/thay đổi hoặc đồng ý với nội dung. */
export const submitFeedbackSchema = z
  .object({
    kind: z.enum(['CHANGE_REQUEST', 'AGREE']),
    name: z.string().trim().min(2, 'Nhập họ tên').max(120, 'Họ tên tối đa 120 ký tự'),
    contact: z
      .string()
      .trim()
      .max(200)
      .refine((v) => EMAIL.test(v) || PHONE.test(v), 'Nhập email hoặc số điện thoại hợp lệ'),
    clauseRef: z.preprocess(blankToNull, z.string().trim().max(300, 'Tối đa 300 ký tự').nullable().optional()),
    message: z.preprocess(
      blankToNull,
      z.string().trim().max(FEEDBACK_MESSAGE_MAX, `Nội dung tối đa ${FEEDBACK_MESSAGE_MAX} ký tự`).nullable().optional(),
    ),
    /** Phiên bản khách đã xem (lấy từ trang xem trước). */
    revisionSeq: z.number().int().min(1).nullable(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'Phiên bản không hợp lệ'),
    /** Bẫy bot: ô ẩn, người thật để trống. */
    website: z.string().max(500).optional(),
  })
  .refine((v) => v.kind !== 'CHANGE_REQUEST' || (v.message?.length ?? 0) >= 5, {
    message: 'Nhập nội dung yêu cầu (ít nhất 5 ký tự)',
    path: ['message'],
  });
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

export const updateFeedbackSchema = z.object({
  status: z.enum(['NEW', 'RESOLVED']),
  response: z.preprocess(blankToNull, z.string().trim().max(2000, 'Phản hồi tối đa 2000 ký tự').nullable().optional()),
});
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
