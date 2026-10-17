import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { AuthService, type JwtPayload } from './auth.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthUser> {
    const user = await this.auth.loadAuthUser(payload.sub, payload.tid);
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    user.ip = req.ip;
    user.userAgent = req.get('user-agent')?.slice(0, 500);
    return user;
  }
}
