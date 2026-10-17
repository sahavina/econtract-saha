import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type TemplateCreate,
  templateCreateSchema,
  type TemplateQuery,
  templateQuerySchema,
  type TemplateUpdate,
  templateUpdateSchema,
} from './templates.schemas.js';
import { TemplatesService } from './templates.service.js';

@ApiTags('Contract templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** Người có quyền tạo hợp đồng cũng xem được (chỉ các mẫu họ được dùng). */
  @Get()
  @RequireAnyPermission(PERMISSIONS.TEMPLATE_VIEW, PERMISSIONS.CONTRACT_CREATE)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(templateQuerySchema)) query: TemplateQuery) {
    return this.templates.list(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.TEMPLATE_VIEW, PERMISSIONS.CONTRACT_CREATE)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(user, id);
  }

  @Get(':id/versions/:version')
  @RequirePermissions(PERMISSIONS.TEMPLATE_VIEW)
  version(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.templates.getVersion(user, id, version);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(templateCreateSchema)) body: TemplateCreate) {
    return this.templates.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(templateUpdateSchema)) body: TemplateUpdate,
  ) {
    return this.templates.update(user, id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  activate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.activate(user, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.archive(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(user, id);
  }
}
