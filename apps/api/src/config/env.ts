import { z } from 'zod';

/** "true"/"1"/"yes" ⇒ true; z.coerce.boolean() coi mọi chuỗi khác rỗng (kể cả "false") là true nên không dùng. */
const envBool = (def: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(String(v).toLowerCase())),
    z.boolean(),
  );
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

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
    // Lưu file: "local" (thư mục STORAGE_DIR) hoặc "s3" (S3/MinIO, khuyến nghị cho production).
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_DIR: z.string().default('./storage'),
    S3_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
    S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    // MinIO cần path-style (http://host:9000/bucket/key); AWS S3 đặt false.
    S3_FORCE_PATH_STYLE: envBool(true),
    S3_PREFIX: z.string().default(''),
    S3_SSE: z.preprocess(emptyToUndefined, z.enum(['AES256', 'aws:kms']).optional()),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    // URL giao diện web, dùng tạo liên kết trong email (ví dụ liên kết ký).
    APP_URL: z.string().url().default('http://localhost:3000'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('SAHA eContract <no-reply@saha.vn>'),
    // Khóa mã hóa bí mật tích hợp (API key Odoo…) lưu trong DB; tối thiểu 32 ký tự. Đổi khóa ⇒ phải nhập lại API key.
    INTEGRATION_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().min(32, 'INTEGRATION_SECRET tối thiểu 32 ký tự').optional(),
    ),
    // Cho phép kết nối tích hợp tới địa chỉ nội bộ/HTTP (chỉ nên bật khi phát triển).
    INTEGRATION_ALLOW_PRIVATE_HOSTS: envBool(false),
    // Lệnh LibreOffice dùng chuyển .doc → .docx (image API đã cài; máy dev không có thì chức năng báo chưa hỗ trợ).
    SOFFICE_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.SMTP_HOST, {
    message: 'Production bắt buộc cấu hình SMTP_HOST để gửi email/OTP',
    path: ['SMTP_HOST'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !/change-me|dev-access-secret/i.test(e.JWT_ACCESS_SECRET), {
    message: 'Production phải dùng JWT_ACCESS_SECRET ngẫu nhiên riêng (ví dụ: openssl rand -base64 48)',
    path: ['JWT_ACCESS_SECRET'],
  })
  .refine((e) => e.STORAGE_DRIVER !== 's3' || !!e.S3_BUCKET, {
    message: 'STORAGE_DRIVER=s3 cần S3_BUCKET',
    path: ['S3_BUCKET'],
  })
  .refine((e) => !e.S3_PREFIX || /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\/$/.test(e.S3_PREFIX), {
    message: 'S3_PREFIX phải kết thúc bằng "/" và chỉ gồm chữ, số, . _ -',
    path: ['S3_PREFIX'],
  });

/** Cảnh báo cấu hình chạy được nhưng không nên dùng cho production. */
export function productionWarnings(e: Pick<Env, 'NODE_ENV' | 'STORAGE_DRIVER' | 'APP_URL'>): string[] {
  if (e.NODE_ENV !== 'production') return [];
  const w: string[] = [];
  if (e.STORAGE_DRIVER === 'local')
    w.push('STORAGE_DRIVER=local: file chỉ nằm trên đĩa máy chủ, hãy đảm bảo volume bền vững và sao lưu.');
  if (!e.APP_URL.startsWith('https://'))
    w.push(`APP_URL=${e.APP_URL} không dùng HTTPS: cookie phiên (Secure) sẽ không hoạt động qua HTTP.`);
  return w;
}

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${issues}`);
  }
  return parsed.data;
}
