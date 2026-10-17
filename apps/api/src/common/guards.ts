import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Permission } from '@saha/shared';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from './decorators.js';

/** Guard toàn cục: mọi endpoint yêu cầu JWT trừ khi gắn @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

/** Guard toàn cục: kiểm tra quyền khai báo bằng @RequirePermissions / @RequireAnyPermission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Không có quyền truy cập');

    const mode = this.reflector.getAllAndOverride<'any' | undefined>(PERMISSIONS_MODE_KEY, targets);
    const ok =
      mode === 'any' ? required.some((p) => user.permissions.has(p)) : required.every((p) => user.permissions.has(p));
    if (!ok) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    return true;
  }
}
