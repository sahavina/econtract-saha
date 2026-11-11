import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  ApprovalsService,
  type DecideInput,
  decideSchema,
  type ReopenInput,
  reopenSchema,
  type SubmitInput,
  submitSchema,
} from './approvals.service.js';

const VIEW = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN] as const;

@ApiTags('Approvals')
@ApiBearerAuth()
@Controller()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('approvals/my-tasks')
  @RequireAnyPermission(...VIEW)
  myTasks(@CurrentUser() user: AuthUser) {
    return this.approvals.myTasks(user);
  }

  @Get('contracts/:id/approval')
  @RequireAnyPermission(...VIEW)
  history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.history(user, id);
  }

  @Get('contracts/:id/approval/preview')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  preview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.preview(user, id);
  }

  @Post('contracts/:id/approval/submit')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(submitSchema)) body: SubmitInput,
  ) {
    return this.approvals.submit(user, id, body);
  }

  /** Duyệt ngay không qua quy trình – chỉ vai trò có quyền "Tự phê duyệt hợp đồng". */
  @Post('contracts/:id/approval/self-approve')
  @RequirePermissions(PERMISSIONS.CONTRACT_SELF_APPROVE)
  selfApprove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(submitSchema)) body: SubmitInput,
  ) {
    return this.approvals.selfApprove(user, id, body);
  }

  /** Quyền thực tế được kiểm tra theo nhiệm vụ được giao cho người dùng. */
  @Post('contracts/:id/approval/decide')
  @HttpCode(200)
  @RequireAnyPermission(...VIEW)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decideSchema)) body: DecideInput,
  ) {
    return this.approvals.decide(user, id, body);
  }

  @Post('contracts/:id/approval/cancel')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.cancel(user, id);
  }

  /** Mở lại hồ sơ đã phê duyệt để chỉnh sửa – về Nháp, phải duyệt lại. */
  @Post('contracts/:id/approval/reopen')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_REOPEN_APPROVED)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reopenSchema)) body: ReopenInput,
  ) {
    return this.approvals.reopen(user, id, body);
  }
}
