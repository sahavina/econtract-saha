import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PERMISSIONS } from '@saha/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { setFileHeaders } from '../documents/send-file.js';
import {
  type CreateSignatureInput,
  createSignatureSchema,
  type ExternalSignInput,
  externalSignSchema,
  type InternalSignInput,
  internalSignSchema,
  type RejectInput,
  rejectSchema,
  type SignatureListQuery,
  signatureListSchema,
} from './signatures.schemas.js';
import { SignaturesService } from './signatures.service.js';

const VIEW = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN] as const;
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });
/** Token ký: chuỗi base64url 43 ký tự. */
const tokenPipe = new ZodPipe(z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết ký không hợp lệ'));

@ApiTags('E-signature')
@Controller()
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  // ───── Người dùng trong hệ thống ─────

  @ApiBearerAuth()
  @Get('signatures')
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(signatureListSchema)) q: SignatureListQuery) {
    return this.signatures.list(user, q);
  }

  @ApiBearerAuth()
  @Get('contracts/:id/signature')
  @RequireAnyPermission(...VIEW)
  forContract(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.getForContract(user, id);
  }

  @ApiBearerAuth()
  @Post('contracts/:id/signature')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createSignatureSchema)) body: CreateSignatureInput,
  ) {
    return this.signatures.create(user, id, body);
  }

  @ApiBearerAuth()
  @Post('contracts/:id/signature/signers/:signerId/resend')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  resend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signerId', ParseUUIDPipe) signerId: string,
  ) {
    return this.signatures.resendLink(user, id, signerId);
  }

  @ApiBearerAuth()
  @Post('contracts/:id/signature/cancel')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.cancel(user, id);
  }

  /** Quyền ký thực tế được kiểm tra theo người ký được chỉ định. */
  @ApiBearerAuth()
  @Post('contracts/:id/signature/sign')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireAnyPermission(...VIEW)
  signInternal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(internalSignSchema)) body: InternalSignInput,
    @Req() req: Request,
  ) {
    return this.signatures.signInternal(user, id, body, meta(req));
  }

  @ApiBearerAuth()
  @Post('contracts/:id/signature/reject')
  @HttpCode(204)
  @RequireAnyPermission(...VIEW)
  rejectInternal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rejectSchema)) body: RejectInput,
  ) {
    return this.signatures.rejectInternal(user, id, body);
  }

  // ───── Người ký bên ngoài (công khai, xác thực bằng token + OTP) ─────

  @Public()
  @Get('public/sign/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param('token', tokenPipe) token: string) {
    return this.signatures.publicView(token);
  }

  /** Tài liệu đính kèm đã đóng băng khi gửi ký – đối tác xem/tải để đọc trước khi ký. */
  @Public()
  @Get('public/sign/:token/documents/:documentId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async document(
    @Param('token', tokenPipe) token: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { doc, stream } = await this.signatures.publicDocument(token, documentId, meta(req));
    setFileHeaders(res, doc);
    return new StreamableFile(stream);
  }

  @Public()
  @Post('public/sign/:token/otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  otp(@Param('token', tokenPipe) token: string) {
    return this.signatures.sendOtp(token);
  }

  @Public()
  @Post('public/sign/:token')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sign(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(externalSignSchema)) body: ExternalSignInput,
    @Req() req: Request,
  ) {
    return this.signatures.signExternal(token, body, meta(req));
  }

  @Public()
  @Post('public/sign/:token/reject')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reject(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(rejectSchema)) body: RejectInput,
    @Req() req: Request,
  ) {
    return this.signatures.rejectExternal(token, body, meta(req));
  }
}
