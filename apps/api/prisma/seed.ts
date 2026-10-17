/**
 * Seed dữ liệu khởi tạo cho môi trường phát triển.
 * Chạy: pnpm --filter @saha/api prisma:seed
 * Idempotent: chạy lại không tạo trùng.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@saha/shared';
import bcrypt from 'bcryptjs';
import { type ClauseCategory, PrismaClient } from '../src/generated/prisma/client.js';

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
      P.CONTRACT_LIQUIDATE,
      P.PARTNER_VIEW,
      P.PARTNER_MANAGE,
      P.TEMPLATE_VIEW,
      P.TEMPLATE_MANAGE,
      P.CLAUSE_APPROVE,
      P.AUDIT_VIEW,
      P.REPORT_VIEW,
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
  {
    code: 'manager',
    name: 'Trưởng phòng',
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
  {
    code: 'accountant',
    name: 'Kế toán',
    permissions: [P.DASHBOARD_VIEW, P.CONTRACT_VIEW_ALL, P.CONTRACT_EXPORT, P.PARTNER_VIEW, P.REPORT_VIEW],
  },
  {
    code: 'director',
    name: 'Giám đốc',
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTRACT_VIEW_ALL,
      P.CONTRACT_EXPORT,
      P.PARTNER_VIEW,
      P.TEMPLATE_VIEW,
      P.AUDIT_VIEW,
      P.REPORT_VIEW,
    ],
  },
  {
    code: 'ceo',
    name: 'Tổng giám đốc',
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTRACT_VIEW_ALL,
      P.CONTRACT_EXPORT,
      P.PARTNER_VIEW,
      P.TEMPLATE_VIEW,
      P.AUDIT_VIEW,
      P.REPORT_VIEW,
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
    {
      email: 'truongkd@saha.vn',
      fullName: 'Lê Văn Trưởng Phòng',
      jobTitle: 'Trưởng phòng Kinh doanh',
      dept: 'KD',
      role: 'manager',
      platform: false,
    },
    {
      email: 'ketoan@saha.vn',
      fullName: 'Phạm Thị Kế Toán',
      jobTitle: 'Kế toán trưởng',
      dept: 'KT',
      role: 'accountant',
      platform: false,
    },
    {
      email: 'giamdoc@saha.vn',
      fullName: 'Hoàng Văn Giám Đốc',
      jobTitle: 'Giám đốc',
      dept: 'BGD',
      role: 'director',
      platform: false,
    },
    {
      email: 'tonggiamdoc@saha.vn',
      fullName: 'Vũ Thị Tổng Giám Đốc',
      jobTitle: 'Tổng giám đốc',
      dept: 'BGD',
      role: 'ceo',
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

  // ── Trưởng phòng ban (dùng cho bước duyệt "Trưởng phòng") ──
  const userId = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: t, email } } })).id;
  for (const [dept, email] of [
    ['KD', 'truongkd@saha.vn'],
    ['KT', 'ketoan@saha.vn'],
    ['PC', 'phapche@saha.vn'],
    ['BGD', 'giamdoc@saha.vn'],
  ]) {
    await prisma.department.update({ where: { id: depts.get(dept)! }, data: { managerId: await userId(email) } });
  }

  // ── Quy trình phê duyệt theo giá trị hợp đồng (ví dụ trong đặc tả) ──
  if ((await prisma.approvalWorkflow.count({ where: { tenantId: t } })) === 0) {
    const manager = { name: 'Trưởng phòng', approverType: 'DEPARTMENT_MANAGER', mode: 'ANY', dueHours: 24 };
    const byRole = (name: string, code: string) => ({
      name,
      approverType: 'ROLE',
      roleId: roles.get(code)!,
      mode: 'ANY',
      dueHours: 48,
    });
    await prisma.approvalWorkflow.createMany({
      data: [
        { tenantId: t, name: 'Hợp đồng dưới 50 triệu', priority: 10, maxValue: 50_000_000, steps: [manager] },
        {
          tenantId: t,
          name: 'Hợp đồng 50 – 500 triệu',
          priority: 20,
          minValue: 50_000_000,
          maxValue: 500_000_000,
          steps: [manager, byRole('Kế toán', 'accountant'), byRole('Giám đốc', 'director')],
        },
        {
          tenantId: t,
          name: 'Hợp đồng từ 500 triệu',
          priority: 30,
          minValue: 500_000_000,
          steps: [
            manager,
            byRole('Pháp chế', 'legal'),
            byRole('Kế toán', 'accountant'),
            byRole('Tổng giám đốc', 'ceo'),
          ],
        },
      ],
    });
  }

  // ── Mẫu hợp đồng & điều khoản mẫu ──
  const admin = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId: t, email: 'admin@saha.vn' } },
  });
  const clauses: [string, string, ClauseCategory, string][] = [
    [
      'DK-TT-01',
      'Thanh toán chuyển khoản 2 đợt',
      'PAYMENT',
      '<p>Bên B thanh toán cho Bên A làm 02 đợt bằng chuyển khoản: đợt 1 tạm ứng 30% giá trị hợp đồng trong vòng 05 ngày làm việc kể từ ngày ký; đợt 2 thanh toán 70% còn lại trong vòng 15 ngày kể từ ngày nghiệm thu, bàn giao.</p>',
    ],
    [
      'DK-BM-01',
      'Bảo mật thông tin',
      'CONFIDENTIALITY',
      '<p>Các bên cam kết giữ bí mật mọi thông tin trao đổi trong quá trình thực hiện hợp đồng, không tiết lộ cho bên thứ ba khi chưa có sự đồng ý bằng văn bản của bên kia, trừ trường hợp theo yêu cầu của cơ quan nhà nước có thẩm quyền.</p>',
    ],
    [
      'DK-BKK-01',
      'Bất khả kháng',
      'FORCE_MAJEURE',
      '<p>Sự kiện bất khả kháng là sự kiện xảy ra một cách khách quan, không thể lường trước và không thể khắc phục được mặc dù đã áp dụng mọi biện pháp cần thiết. Bên gặp sự kiện bất khả kháng phải thông báo cho bên kia trong vòng 07 ngày.</p>',
    ],
    [
      'DK-TC-01',
      'Giải quyết tranh chấp',
      'DISPUTE',
      '<p>Mọi tranh chấp phát sinh được giải quyết trước hết bằng thương lượng. Trường hợp không thương lượng được trong 30 ngày, tranh chấp sẽ được đưa ra Tòa án nhân dân có thẩm quyền nơi Bên A đặt trụ sở.</p>',
    ],
  ];
  for (const [code, title, category, contentHtml] of clauses) {
    const exists = await prisma.clause.findUnique({ where: { tenantId_code: { tenantId: t, code } } });
    if (exists) continue;
    await prisma.clause.create({
      data: {
        tenantId: t,
        code,
        title,
        category,
        contentHtml,
        status: 'APPROVED',
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
        versions: { create: { version: 1, title, contentHtml, createdById: admin.id } },
      },
    });
  }

  const hdmb = await prisma.contractType.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code: 'HDMB' } } });
  const templateHtml = [
    '<p style="text-align:center"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>Độc lập – Tự do – Hạnh phúc</p>',
    '<h1 style="text-align:center">HỢP ĐỒNG MUA BÁN HÀNG HÓA</h1>',
    '<p style="text-align:center">Số: {{contract.code}}</p>',
    '<h3>BÊN BÁN (BÊN A): {{party_a.name}}</h3><p>Mã số thuế: {{party_a.tax_code}} – Địa chỉ: {{party_a.address}}</p><p>Đại diện: {{party_a.representative}} – Chức vụ: {{party_a.position}}</p>',
    '<h3>BÊN MUA (BÊN B): {{party_b.name}}</h3><p>Mã số thuế: {{party_b.tax_code}} – Địa chỉ: {{party_b.address}}</p><p>Đại diện: {{party_b.representative}} – Chức vụ: {{party_b.position}}</p>',
    '<h2>Điều 1. Giá trị hợp đồng</h2><p>Tổng giá trị hợp đồng: {{contract.value}} {{contract.currency}} (đã bao gồm thuế VAT {{contract.vat_rate}}%).</p>',
    '<h2>Điều 2. Thời hạn</h2><p>Hợp đồng có hiệu lực từ ngày {{contract.start_date}} đến hết ngày {{contract.end_date}}.</p>',
    '<h2>Điều 3. Thanh toán</h2>' + clauses[0][3],
    '<h2>Điều 4. Giải quyết tranh chấp</h2>' + clauses[3][3],
  ].join('');
  const tpl = await prisma.contractTemplate.findUnique({
    where: { tenantId_code: { tenantId: t, code: 'MAU-HDMB-01' } },
  });
  if (!tpl) {
    await prisma.contractTemplate.create({
      data: {
        tenantId: t,
        code: 'MAU-HDMB-01',
        name: 'Hợp đồng mua bán hàng hóa (chuẩn)',
        contractTypeId: hdmb.id,
        description: 'Mẫu hợp đồng mua bán keo, silicone cho khách hàng doanh nghiệp',
        contentHtml: templateHtml,
        status: 'ACTIVE',
        createdById: admin.id,
        requiredVariables: ['party_a.name', 'party_b.name', 'party_b.tax_code', 'contract.value'],
        versions: { create: { version: 1, contentHtml: templateHtml, createdById: admin.id } },
      },
    });
  }

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
