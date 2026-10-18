import { Body, Controller, Get, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type CompanyProfile, companyProfileSchema, CompanyService } from './company.service.js';

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

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(companyProfileSchema)) body: CompanyProfile) {
    return this.company.update(user, body);
  }
}

@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
