import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ALL_PERMISSIONS, parseDocumentFont, type Permission } from '@saha/shared';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const loginSchema = z.object({
  tenantCode: z.string().trim().min(1, 'Vui lòng nhập mã doanh nghiệp').toLowerCase(),
  email: z.email('Email không hợp lệ').trim().toLowerCase(),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface JwtPayload {
  sub: string;
  tid: string;
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const INVALID_CREDENTIALS = 'Thông tin đăng nhập không chính xác';
// Hash giả để so sánh khi không tìm thấy user, tránh lộ thông tin qua thời gian phản hồi.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: ClientMeta) {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: input.tenantCode } });
    const user =
      tenant && tenant.status === 'ACTIVE'
        ? await this.prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: input.email } } })
        : null;

    const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Tài khoản tạm khóa do đăng nhập sai nhiều lần, vui lòng thử lại sau');
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Tài khoản không ở trạng thái hoạt động');

    if (!passwordOk) {
      const failedLogins = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failedLogins >= MAX_FAILED_LOGINS ? 0 : failedLogins,
          lockedUntil: failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const authUser = await this.loadAuthUser(user.id, user.tenantId);
    await this.audit.log({ ...authUser!, ...meta }, { action: 'auth.login', entityType: 'user', entityId: user.id });
    return this.issueTokens(user.id, user.tenantId, meta);
  }

  /** Xoay vòng refresh token. Token đã thu hồi bị dùng lại ⇒ thu hồi toàn bộ phiên của user. */
  async refresh(refreshToken: string | undefined, meta: ClientMeta) {
    if (!refreshToken) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { include: { tenant: true } } },
    });
    if (!session) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');

    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    if (session.user.status !== 'ACTIVE' || session.user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản không ở trạng thái hoạt động');
    }

    const tokens = await this.issueTokens(session.userId, session.user.tenantId, meta);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedBy: tokens.sessionId },
    });
    return tokens;
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Nạp ngữ cảnh user + quyền từ DB (mỗi request) để thay đổi quyền/khóa tài khoản có hiệu lực ngay. */
  async loadAuthUser(userId: string, tenantId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      include: { roles: { include: { role: { include: { permissions: true } } } } },
    });
    if (!user) return null;
    const permissions = new Set<Permission>();
    for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission as Permission);
    // Quản trị doanh nghiệp luôn có toàn bộ quyền, kể cả quyền mới bổ sung sau này.
    if (user.roles.some((ur) => ur.role.code === 'tenant_admin')) for (const p of ALL_PERMISSIONS) permissions.add(p);
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      departmentId: user.departmentId,
      isPlatformAdmin: user.isPlatformAdmin,
      permissions,
    };
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        jobTitle: true,
        isPlatformAdmin: true,
        department: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        roles: { select: { role: { select: { code: true, name: true } } } },
        tenant: { select: { id: true, code: true, name: true, settings: true } },
      },
    });
    const { settings, ...tenant } = user.tenant;
    return {
      ...user,
      tenant,
      // Phông chữ văn bản của doanh nghiệp: áp dụng khi xem/in/xuất PDF ở mọi trang.
      documentFont: parseDocumentFont((settings as { documentFont?: unknown } | null)?.documentFont),
      roles: user.roles.map((r) => r.role),
      permissions: [...authUser.permissions].sort(),
    };
  }

  private async issueTokens(userId: string, tenantId: string, meta: ClientMeta) {
    const payload: JwtPayload = { sub: userId, tid: tenantId };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
      },
    });
    return {
      accessToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      refreshToken,
      refreshExpiresAt: expiresAt,
      sessionId: session.id,
    };
  }
}
