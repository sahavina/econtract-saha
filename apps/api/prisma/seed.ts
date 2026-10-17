/**
 * Seed dữ liệu khởi tạo cho môi trường phát triển.
 * Chạy: pnpm --filter @saha/api prisma:seed
 * Idempotent: chạy lại không tạo trùng.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@saha/shared';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const P = PERMISSIONS;
const ROLES: { code: string; name: string; permissions: Permission[] }[] = [
  { code: 'tenant_admin', name: 'Quản trị doanh nghiệp', permissions: ALL_PERMISSIONS },
  {
    code: 'legal',
    name: 'Pháp chế',
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTRACT_VIEW_ALL,
      P.CONTRACT_CREATE,
      P.CONTRACT_UPDATE,
      P.CONTRACT_ARCHIVE,
      P.CONTRACT_EXPORT,
      P.PARTNER_VIEW,
      P.PARTNER_MANAGE,
      P.TEMPLATE_VIEW,
      P.TEMPLATE_MANAGE,
      P.AUDIT_VIEW,
    ],
  },
  {
    code: 'staff',
    name: 'Nhân viên',
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTRACT_VIEW_OWN,
      P.CONTRACT_CREATE,
      P.CONTRACT_UPDATE,
      P.CONTRACT_DELETE,
      P.PARTNER_VIEW,
      P.PARTNER_MANAGE,
      P.TEMPLATE_VIEW,
    ],
  },
];

// Mật khẩu dev mặc định; đổi bằng biến SEED_PASSWORD.
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'Saha@123456';

async function main() {
  await prisma.plan.upsert({
    where: { code: 'business' },
    update: {},
    create: {
      code: 'business',
      name: 'Business',
      maxUsers: 50,
      maxContractsYear: 5000,
      storageQuotaMb: 20480,
      priceMonthly: 2990000,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { code: 'saha' },
    update: {},
    create: { code: 'saha', name: 'Công ty SAHA', email: 'contact@saha.vn' },
  });
  const t = tenant.id;

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: t, code: 'HN' } },
    update: {},
    create: { tenantId: t, code: 'HN', name: 'Trụ sở Hà Nội' },
  });

  const depts = new Map<string, string>();
  for (const [code, name] of [
    ['BGD', 'Ban Giám đốc'],
    ['KD', 'Phòng Kinh doanh'],
    ['KT', 'Phòng Kế toán'],
    ['PC', 'Phòng Pháp chế'],
  ]) {
    const d = await prisma.department.upsert({
      where: { tenantId_code: { tenantId: t, code } },
      update: {},
      create: { tenantId: t, code, name, branchId: branch.id },
    });
    depts.set(code, d.id);
  }

  const roles = new Map<string, string>();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: t, code: r.code } },
      update: { name: r.name },
      create: { tenantId: t, code: r.code, name: r.name, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: r.permissions.map((permission) => ({ roleId: role.id, permission })),
    });
    roles.set(r.code, role.id);
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const users = [
    {
      email: 'admin@saha.vn',
      fullName: 'Quản trị hệ thống',
      jobTitle: 'Quản trị viên',
      dept: 'BGD',
      role: 'tenant_admin',
      platform: true,
    },
    {
      email: 'phapche@saha.vn',
      fullName: 'Nguyễn Thị Pháp Chế',
      jobTitle: 'Chuyên viên pháp chế',
      dept: 'PC',
      role: 'legal',
      platform: false,
    },
    {
      email: 'kinhdoanh@saha.vn',
      fullName: 'Trần Văn Kinh Doanh',
      jobTitle: 'Nhân viên kinh doanh',
      dept: 'KD',
      role: 'staff',
      platform: false,
    },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: t, email: u.email } },
      update: {},
      create: {
        tenantId: t,
        email: u.email,
        fullName: u.fullName,
        jobTitle: u.jobTitle,
        passwordHash,
        departmentId: depts.get(u.dept),
        branchId: branch.id,
        isPlatformAdmin: u.platform,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roles.get(u.role)! } },
      update: {},
      create: { userId: user.id, roleId: roles.get(u.role)! },
    });
  }

  for (const [code, name, codePattern] of [
    ['HDMB', 'Hợp đồng mua bán', 'HDMB-{YYYY}-{SEQUENCE:4}'],
    ['HDDV', 'Hợp đồng dịch vụ', 'HDDV-{YYYY}-{SEQUENCE:4}'],
    ['HDNT', 'Hợp đồng nguyên tắc', 'HDNT/{DEPT}/{YYYY}/{SEQUENCE:3}'],
    ['HDLD', 'Hợp đồng lao động', 'HDLD-{YYYY}-{SEQUENCE:4}'],
  ]) {
    await prisma.contractType.upsert({
      where: { tenantId_code: { tenantId: t, code } },
      update: {},
      create: { tenantId: t, code, name, codePattern },
    });
  }

  await prisma.partner.upsert({
    where: { tenantId_code: { tenantId: t, code: 'KH0001' } },
    update: {},
    create: {
      tenantId: t,
      code: 'KH0001',
      type: 'CUSTOMER',
      name: 'Công ty TNHH Xây dựng Minh Phát',
      taxCode: '0101234567',
      address: 'Cầu Giấy, Hà Nội',
      email: 'info@minhphat.vn',
      representative: 'Lê Văn Phát',
      position: 'Giám đốc',
    },
  });
  await prisma.partner.upsert({
    where: { tenantId_code: { tenantId: t, code: 'NCC0001' } },
    update: {},
    create: {
      tenantId: t,
      code: 'NCC0001',
      type: 'SUPPLIER',
      name: 'Công ty CP Hóa chất An Bình',
      taxCode: '0309876543',
      address: 'Thủ Đức, TP.HCM',
      email: 'sales@anbinh.vn',
      representative: 'Phạm Thị Bình',
      position: 'Tổng giám đốc',
    },
  });

  console.log(
    `Seed xong. Đăng nhập: mã DN "saha", email admin@saha.vn, mật khẩu ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : DEV_PASSWORD}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
