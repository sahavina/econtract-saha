/**
 * Khởi tạo hệ thống production lần đầu (idempotent, chạy sau `prisma migrate deploy`):
 *  - tạo các gói dịch vụ mặc định nếu chưa có;
 *  - nếu chưa có doanh nghiệp nào: tạo doanh nghiệp vận hành + tài khoản Super Admin từ biến môi trường.
 * Không in mật khẩu ra log. Chạy: pnpm --filter @saha/api prisma:bootstrap
 *
 * Biến môi trường: BOOTSTRAP_TENANT_CODE, BOOTSTRAP_TENANT_NAME, BOOTSTRAP_ADMIN_EMAIL,
 * BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD (chỉ cần ở lần chạy đầu; nên xóa sau khi đăng nhập và đổi mật khẩu).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@saha/shared';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DEFAULT_PLANS, provisionTenant } from '../src/platform/defaults.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Thiếu biến môi trường ${name} để tạo doanh nghiệp và Super Admin đầu tiên`);
  return v;
}

async function main() {
  for (const p of DEFAULT_PLANS) await prisma.plan.upsert({ where: { code: p.code }, update: {}, create: p });
  console.log(`Gói dịch vụ: ${await prisma.plan.count()} gói.`);

  if ((await prisma.tenant.count()) > 0) {
    console.log('Đã có doanh nghiệp – bỏ qua bước tạo Super Admin.');
    return;
  }

  const code = required('BOOTSTRAP_TENANT_CODE').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(code))
    throw new Error('BOOTSTRAP_TENANT_CODE: 2–30 ký tự chữ thường không dấu, số, "-"');
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');
  if (!isStrongPassword(password)) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${PASSWORD_RULE_MESSAGE}`);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

  const { tenant, admin } = await prisma.$transaction((tx) =>
    provisionTenant(tx, {
      tenant: { code, name: required('BOOTSTRAP_TENANT_NAME') },
      admin: {
        email,
        fullName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Super Admin',
        passwordHash: bcrypt.hashSync(password, 12),
        isPlatformAdmin: true,
      },
      subscription: { planId: plan.id, status: 'ACTIVE', startsAt: new Date(), endsAt: null },
    }),
  );
  console.log(`Đã tạo doanh nghiệp "${tenant.code}" và Super Admin ${admin.email}. Hãy đăng nhập và đổi mật khẩu.`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
