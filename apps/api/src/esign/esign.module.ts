import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import {
  EsignService,
  type MisaConfigInput,
  misaCertSchema,
  misaConfigSchema,
  misaLoginSchema,
  misaOtpSchema,
  type MisaSignInput,
  misaSignSchema,
} from './esign.service.js';

const VIEW = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN] as const;

@ApiTags('E-sign (MISA eSign)')
@ApiBearerAuth()
@Controller('esign/misa')
class EsignController {
  constructor(private readonly esign: EsignService) {}

  // Cấu hình doanh nghiệp (ClientID/ClientSecret do quản trị nhập).
  @Get('config')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  getConfig(@CurrentUser() user: AuthUser) {
    return this.esign.getConfig(user);
  }

  @Put('config')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  saveConfig(@CurrentUser() user: AuthUser, @Body(new ZodPipe(misaConfigSchema)) body: MisaConfigInput) {
    return this.esign.saveConfig(user, body);
  }

  @Delete('config')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  removeConfig(@CurrentUser() user: AuthUser) {
    return this.esign.removeConfig(user);
  }

  @Post('config/test')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  test(@CurrentUser() user: AuthUser) {
    return this.esign.test(user);
  }

  // Tài khoản MISA eSign của chính người dùng.
  @Get('status')
  @RequireAnyPermission(...VIEW)
  status(@CurrentUser() user: AuthUser) {
    return this.esign.status(user);
  }

  @Post('account/login')
  @HttpCode(200)
  @RequireAnyPermission(...VIEW)
  login(@CurrentUser() user: AuthUser, @Body(new ZodPipe(misaLoginSchema)) body: z.infer<typeof misaLoginSchema>) {
    return this.esign.login(user, body);
  }

  @Post('account/otp')
  @HttpCode(200)
  @RequireAnyPermission(...VIEW)
  otp(@CurrentUser() user: AuthUser, @Body(new ZodPipe(misaOtpSchema)) body: z.infer<typeof misaOtpSchema>) {
    return this.esign.verifyOtp(user, body);
  }

  @Post('account/resend-otp')
  @HttpCode(200)
  @RequireAnyPermission(...VIEW)
  resendOtp(@CurrentUser() user: AuthUser) {
    return this.esign.resendOtp(user);
  }

  @Get('account/certificates')
  @RequireAnyPermission(...VIEW)
  certificates(@CurrentUser() user: AuthUser) {
    return this.esign.certificates(user);
  }

  @Put('account/certificate')
  @RequireAnyPermission(...VIEW)
  selectCertificate(@CurrentUser() user: AuthUser, @Body(new ZodPipe(misaCertSchema)) body: z.infer<typeof misaCertSchema>) {
    return this.esign.selectCertificate(user, body.keyAlias);
  }

  @Delete('account')
  @HttpCode(204)
  @RequireAnyPermission(...VIEW)
  unlink(@CurrentUser() user: AuthUser) {
    return this.esign.unlink(user);
  }

  // Ký số tệp PDF trong tab Tài liệu.
  @Post('contracts/:contractId/documents/:documentId/sign')
  @HttpCode(200)
  @RequireAnyPermission(...VIEW)
  sign(
    @CurrentUser() user: AuthUser,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(new ZodPipe(misaSignSchema)) body: MisaSignInput,
  ) {
    return this.esign.start(user, contractId, documentId, body);
  }

  @Get('sessions/:id')
  @RequireAnyPermission(...VIEW)
  session(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.esign.session(user, id);
  }
}

@Module({
  imports: [ContractsModule, DocumentsModule],
  controllers: [EsignController],
  providers: [EsignService],
})
export class EsignModule {}
