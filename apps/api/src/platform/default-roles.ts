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

/** Loại hợp đồng mặc định: [mã, tên, mẫu đánh số]. */
export const DEFAULT_CONTRACT_TYPES: [string, string, string][] = [
  ['HDMB', 'Hợp đồng mua bán', 'HDMB-{YYYY}-{SEQUENCE:4}'],
  ['HDDV', 'Hợp đồng dịch vụ', 'HDDV-{YYYY}-{SEQUENCE:4}'],
  ['HDNT', 'Hợp đồng nguyên tắc', 'HDNT/{DEPT}/{YYYY}/{SEQUENCE:3}'],
  ['HDLD', 'Hợp đồng lao động', 'HDLD-{YYYY}-{SEQUENCE:4}'],
];
