import type { Prisma } from '../generated/prisma/client.js';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@saha/shared';

/** Vai trò hệ thống tạo sẵn cho mỗi doanh nghiệp (seed và khi Super Admin tạo doanh nghiệp mới). */
const P = PERMISSIONS;
export const DEFAULT_ROLES: { code: string; name: string; permissions: Permission[] }[] = [
  { code: 'tenant_admin', name: 'Quản trị doanh nghiệp', permissions: ALL_PERMISSIONS },
  {
    code: 'legal',
    name: 'Pháp chế',
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTRACT_VIEW_ALL,
      P.CONTRACT_CREATE,
      P.CONTRACT_UPDATE,
      P.CONTRACT_SHARE,
      P.CONTRACT_ARCHIVE,
      P.CONTRACT_EXPORT,
      P.CONTRACT_LIQUIDATE,
      P.PARTNER_VIEW,
      P.PARTNER_MANAGE,
      P.PRODUCT_MANAGE,
      P.DELIVERY_MANAGE,
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
      P.CONTRACT_SHARE,
      P.CONTRACT_DELETE,
      P.PARTNER_VIEW,
      P.PARTNER_MANAGE,
      P.PRODUCT_MANAGE,
      P.DELIVERY_MANAGE,
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
      P.CONTRACT_SHARE,
      P.CONTRACT_DELETE,
      P.PARTNER_VIEW,
      P.PARTNER_MANAGE,
      P.PRODUCT_MANAGE,
      P.DELIVERY_MANAGE,
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
      P.CONTRACT_SELF_APPROVE,
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

/** Loại hợp đồng mặc định: [mã, tên, mẫu đánh số, loại (hợp đồng/đơn đặt hàng)]. */
export const DEFAULT_CONTRACT_TYPES: [string, string, string, ('CONTRACT' | 'ORDER')?][] = [
  ['HDMB', 'Hợp đồng mua bán', 'HDMB-{YYYY}-{SEQUENCE:4}'],
  ['HDDV', 'Hợp đồng dịch vụ', 'HDDV-{YYYY}-{SEQUENCE:4}'],
  ['HDNT', 'Hợp đồng nguyên tắc', 'HDNT/{DEPT}/{YYYY}/{SEQUENCE:3}'],
  ['HDLD', 'Hợp đồng lao động', 'HDLD-{YYYY}-{SEQUENCE:4}'],
  ['DDH', 'Đơn đặt hàng', 'DDH-{YYYY}-{SEQUENCE:4}', 'ORDER'],
];

/** Gói dịch vụ mặc định (seed và bootstrap production); không ghi đè gói đã có. */
export const DEFAULT_PLANS = [
  {
    code: 'trial',
    name: 'Dùng thử',
    description: 'Dùng thử 30 ngày',
    maxUsers: 5,
    maxContractsYear: 50,
    storageQuotaMb: 1024,
    priceMonthly: 0,
  },
  {
    code: 'starter',
    name: 'Starter',
    description: 'Doanh nghiệp nhỏ',
    maxUsers: 10,
    maxContractsYear: 500,
    storageQuotaMb: 5120,
    priceMonthly: 990000,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'Doanh nghiệp vừa',
    maxUsers: 50,
    maxContractsYear: 5000,
    storageQuotaMb: 20480,
    priceMonthly: 2990000,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Tập đoàn, nhiều chi nhánh',
    maxUsers: 500,
    maxContractsYear: 100000,
    storageQuotaMb: 204800,
    priceMonthly: 9990000,
  },
];

export interface ProvisionTenantInput {
  tenant: {
    code: string;
    name: string;
    taxCode?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  admin: { email: string; fullName: string; passwordHash: string; isPlatformAdmin?: boolean };
  subscription: { planId: string; status: 'TRIAL' | 'ACTIVE'; startsAt: Date; endsAt: Date | null };
}

/**
 * Khởi tạo doanh nghiệp mới trong một transaction: vai trò hệ thống, loại hợp đồng mặc định,
 * tài khoản quản trị đầu tiên (vai trò tenant_admin) và subscription.
 */
export async function provisionTenant(tx: Prisma.TransactionClient, input: ProvisionTenantInput) {
  const tenant = await tx.tenant.create({
    data: {
      code: input.tenant.code,
      name: input.tenant.name,
      taxCode: input.tenant.taxCode ?? null,
      address: input.tenant.address ?? null,
      email: input.tenant.email ?? null,
      phone: input.tenant.phone ?? null,
    },
  });
  let adminRoleId = '';
  for (const r of DEFAULT_ROLES) {
    const role = await tx.role.create({
      data: {
        tenantId: tenant.id,
        code: r.code,
        name: r.name,
        isSystem: true,
        permissions: { create: r.permissions.map((permission) => ({ permission })) },
      },
    });
    if (r.code === 'tenant_admin') adminRoleId = role.id;
  }
  await tx.contractType.createMany({
    data: DEFAULT_CONTRACT_TYPES.map(([code, name, codePattern, kind]) => ({ tenantId: tenant.id, code, name, codePattern, kind })),
  });
  const admin = await tx.user.create({
    data: {
      tenantId: tenant.id,
      email: input.admin.email,
      fullName: input.admin.fullName,
      jobTitle: 'Quản trị viên',
      passwordHash: input.admin.passwordHash,
      isPlatformAdmin: input.admin.isPlatformAdmin ?? false,
      roles: { create: { roleId: adminRoleId } },
    },
    select: { id: true, email: true, fullName: true },
  });
  await tx.subscription.create({ data: { tenantId: tenant.id, ...input.subscription } });
  return { tenant, admin };
}
