/**
 * Danh mục quyền (permission) của SAHA eContract.
 * Quyền được gán cho Role; backend kiểm tra bằng @RequirePermissions().
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  CONTRACT_VIEW_ALL: 'contract.view_all',
  CONTRACT_VIEW_OWN: 'contract.view_own',
  CONTRACT_CREATE: 'contract.create',
  CONTRACT_UPDATE: 'contract.update',
  CONTRACT_DELETE: 'contract.delete',
  CONTRACT_PURGE: 'contract.purge',
  CONTRACT_ARCHIVE: 'contract.archive',
  CONTRACT_EXPORT: 'contract.export',
  CONTRACT_LIQUIDATE: 'contract.liquidate',
  CONTRACT_SHARE: 'contract.share',

  PARTNER_VIEW: 'partner.view',
  PARTNER_MANAGE: 'partner.manage',

  TEMPLATE_VIEW: 'template.view',
  TEMPLATE_MANAGE: 'template.manage',
  CLAUSE_APPROVE: 'clause.approve',

  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  ORG_MANAGE: 'org.manage',
  SETTINGS_MANAGE: 'settings.manage',
  WORKFLOW_MANAGE: 'workflow.manage',
  AUDIT_VIEW: 'audit.view',
  REPORT_VIEW: 'report.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'Xem dashboard',
  'contract.view_all': 'Xem tất cả hợp đồng',
  'contract.view_own': 'Xem hợp đồng của mình',
  'contract.create': 'Tạo hợp đồng',
  'contract.update': 'Sửa hợp đồng',
  'contract.delete': 'Xóa hợp đồng',
  'contract.purge': 'Xóa vĩnh viễn hợp đồng trong thùng rác',
  'contract.archive': 'Lưu trữ hợp đồng',
  'contract.export': 'Xuất dữ liệu hợp đồng',
  'contract.liquidate': 'Thanh lý hợp đồng',
  'contract.share': 'Gửi khách hàng xem trước, xử lý góp ý của khách',
  'partner.view': 'Xem đối tác',
  'partner.manage': 'Quản lý đối tác',
  'template.view': 'Xem mẫu hợp đồng, điều khoản',
  'template.manage': 'Quản lý mẫu hợp đồng, điều khoản',
  'clause.approve': 'Phê duyệt điều khoản',
  'user.view': 'Xem người dùng',
  'user.manage': 'Quản lý người dùng',
  'role.manage': 'Quản lý vai trò',
  'org.manage': 'Quản lý phòng ban, chi nhánh',
  'settings.manage': 'Quản lý cấu hình',
  'workflow.manage': 'Cấu hình quy trình phê duyệt',
  'audit.view': 'Xem nhật ký hoạt động',
  'report.view': 'Xem báo cáo',
};
