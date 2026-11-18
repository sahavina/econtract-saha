import { Body, Controller, Get, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type DocumentFont } from '@saha/shared';
import { type CompanyProfile, companyProfileSchema, CompanyService, documentFontSchema } from './company.service.js';

@ApiTags('Company')
@ApiBearerAuth()
@Controller('company-profile')
class CompanyController {
  constructor(private readonly company: CompanyService) {}

  /** Đọc để tự điền "Bên nội bộ" khi lập/sửa hợp đồng, hoặc để khai báo trong Cài đặt. */
  @Get()
  @RequireAnyPermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.CONTRACT_CREATE, PERMISSIONS.CONTRACT_UPDATE)
  get(@CurrentUser() user: AuthUser) {
    return this.company.get(user);
  }

  /** Phông chữ văn bản: mọi người dùng nhận qua /auth/me; ở đây để quản trị đổi. */
  @Put('document-font')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateDocumentFont(@CurrentUser() user: AuthUser, @Body(new ZodPipe(documentFontSchema)) body: DocumentFont) {
    return this.company.updateDocumentFont(user, body);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(companyProfileSchema)) body: CompanyProfile) {
    return this.company.update(user, body);
  }
}

@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
