import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@saha/shared';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissionsMode';
export const PLATFORM_ADMIN_KEY = 'platformAdmin';

/** Bỏ qua xác thực JWT cho endpoint. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Yêu cầu người dùng có TẤT CẢ quyền được liệt kê. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Yêu cầu người dùng có ÍT NHẤT MỘT quyền được liệt kê. */
export const RequireAnyPermission =
  (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key as string, descriptor as PropertyDescriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, 'any')(target, key as string, descriptor as PropertyDescriptor);
  };

/** Chỉ Super Admin (quản trị nền tảng, isPlatformAdmin) được gọi; dùng cho các API liên doanh nghiệp. */
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
