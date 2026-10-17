import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Env } from '../config/env.js';
import { AuthService, type ClientMeta, type LoginInput, loginSchema } from './auth.service.js';

export const REFRESH_COOKIE = 'saha_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(body, this.meta(req));
    this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.meta(req));
      this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
      return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  private meta(req: Request): ClientMeta {
    return { ip: req.ip, userAgent: req.get('user-agent') };
  }

  private setRefreshCookie(res: Response, token: string, expires: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: REFRESH_COOKIE_PATH,
      expires,
    });
  }
}
