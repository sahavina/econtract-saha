import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PERMISSIONS } from '@saha/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type CreateShareLinkInput,
  createShareLinkSchema,
  type SubmitFeedbackInput,
  submitFeedbackSchema,
  type UpdateFeedbackInput,
  updateFeedbackSchema,
} from './contract-share.schemas.js';
import { ContractShareService } from './contract-share.service.js';

const VIEW = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN] as const;
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });
/** Token xem trước: chuỗi base64url 43 ký tự. */
const tokenPipe = new ZodPipe(z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết xem trước không hợp lệ'));

@ApiTags('Contract preview')
@Controller()
export class ContractShareController {
  constructor(private readonly share: ContractShareService) {}

  // ───── Người dùng nội bộ ─────

  @ApiBearerAuth()
  @Get('contracts/:id/share-links')
  @RequireAnyPermission(...VIEW)
  links(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.share.listLinks(user, id);
  }

  @ApiBearerAuth()
  @Post('contracts/:id/share-links')
  @RequirePermissions(PERMISSIONS.CONTRACT_SHARE)
  createLink(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createShareLinkSchema)) body: CreateShareLinkInput,
  ) {
    return this.share.createLink(user, id, body);
  }

  @ApiBearerAuth()
  @Post('contracts/:id/share-links/:linkId/revoke')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_SHARE)
  revokeLink(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    return this.share.revokeLink(user, id, linkId);
  }

  @ApiBearerAuth()
  @Get('contracts/:id/feedback')
  @RequireAnyPermission(...VIEW)
  feedback(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.share.listFeedback(user, id);
  }

  @ApiBearerAuth()
  @Patch('contracts/:id/feedback/:feedbackId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_SHARE)
  updateFeedback(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
    @Body(new ZodPipe(updateFeedbackSchema)) body: UpdateFeedbackInput,
  ) {
    return this.share.updateFeedback(user, id, feedbackId, body);
  }

  // ───── Khách hàng (công khai, tenant suy ra từ token) ─────

  @Public()
  @Get('public/preview/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param('token', tokenPipe) token: string, @Req() req: Request) {
    return this.share.publicView(token, meta(req));
  }

  @Public()
  @Post('public/preview/:token/feedback')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(submitFeedbackSchema)) body: SubmitFeedbackInput,
    @Req() req: Request,
  ) {
    return this.share.submitFeedback(token, body, meta(req));
  }
}
