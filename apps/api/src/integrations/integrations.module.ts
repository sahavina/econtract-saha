import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type OdooConfigInput,
  odooConfigSchema,
  type OdooImportInput,
  odooImportSchema,
  type OdooLinkInput,
  odooLinkSchema,
  type OdooSearchInput,
  odooSearchSchema,
  IntegrationsService,
} from './integrations.service.js';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations/odoo')
class OdooIntegrationController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.PARTNER_VIEW)
  get(@CurrentUser() user: AuthUser) {
    return this.integrations.getConfig(user);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  save(@CurrentUser() user: AuthUser, @Body(new ZodPipe(odooConfigSchema)) body: OdooConfigInput) {
    return this.integrations.saveConfig(user, body);
  }

  @Delete()
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  remove(@CurrentUser() user: AuthUser) {
    return this.integrations.removeConfig(user);
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  test(@CurrentUser() user: AuthUser) {
    return this.integrations.test(user);
  }

  @Get('partners')
  @RequirePermissions(PERMISSIONS.PARTNER_VIEW)
  search(@CurrentUser() user: AuthUser, @Query(new ZodPipe(odooSearchSchema)) q: OdooSearchInput) {
    return this.integrations.searchPartners(user, q);
  }

  /** Nhập từ form hợp đồng cũng được: người tạo hợp đồng chọn đối tác Odoo mà không cần quyền quản lý đối tác. */
  @Post('partners/import')
  @RequireAnyPermission(PERMISSIONS.PARTNER_MANAGE, PERMISSIONS.CONTRACT_CREATE)
  import(@CurrentUser() user: AuthUser, @Body(new ZodPipe(odooImportSchema)) body: OdooImportInput) {
    return this.integrations.importPartner(user, body);
  }

  /** Ánh xạ tự động các đối tác chưa liên kết theo MST (đúng 1 kết quả trên Odoo). */
  @Post('partners/auto-link')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PARTNER_MANAGE)
  autoLink(@CurrentUser() user: AuthUser) {
    return this.integrations.autoLink(user);
  }

  /** Ánh xạ một đối tác có sẵn trong eContract với đối tác Odoo đã chọn. */
  @Post('partners/:id/link')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PARTNER_MANAGE)
  link(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(odooLinkSchema)) body: OdooLinkInput,
  ) {
    return this.integrations.linkPartner(user, id, body.odooId);
  }

  @Post('partners/:id/sync')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PARTNER_MANAGE)
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.syncPartner(user, id);
  }
}

@Module({
  controllers: [OdooIntegrationController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
