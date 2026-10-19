import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type SmtpConfigInput,
  smtpConfigSchema,
  SmtpSettingsService,
  type SmtpTestInput,
  smtpTestSchema,
} from './smtp-settings.service.js';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations/smtp')
export class SmtpSettingsController {
  constructor(private readonly settings: SmtpSettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  get(@CurrentUser() user: AuthUser) {
    return this.settings.getConfig(user);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  save(@CurrentUser() user: AuthUser, @Body(new ZodPipe(smtpConfigSchema)) body: SmtpConfigInput) {
    return this.settings.saveConfig(user, body);
  }

  @Delete()
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  remove(@CurrentUser() user: AuthUser) {
    return this.settings.removeConfig(user);
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  test(@CurrentUser() user: AuthUser, @Body(new ZodPipe(smtpTestSchema)) body: SmtpTestInput) {
    return this.settings.test(user, body);
  }
}
