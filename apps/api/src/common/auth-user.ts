import type { Permission } from '@saha/shared';

/** Ngữ cảnh người dùng đã xác thực – nguồn tin cậy duy nhất cho tenantId. */
export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  departmentId: string | null;
  isPlatformAdmin: boolean;
  permissions: Set<Permission>;
  ip?: string;
  userAgent?: string;
}
