import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    // Đặt 1 khi dùng `prisma dev` (PGlite chỉ hỗ trợ một kết nối đồng thời).
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    REDIS_URL: z.string().optional(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải dài tối thiểu 32 ký tự'),
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(14),
    // Thư mục lưu file (driver local). Production nên dùng S3/MinIO.
    STORAGE_DIR: z.string().default('./storage'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    // URL giao diện web, dùng tạo liên kết trong email (ví dụ liên kết ký).
    APP_URL: z.string().url().default('http://localhost:3000'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('SAHA eContract <no-reply@saha.vn>'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.SMTP_HOST, {
    message: 'Production bắt buộc cấu hình SMTP_HOST để gửi email/OTP',
    path: ['SMTP_HOST'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${issues}`);
  }
  return parsed.data;
}
