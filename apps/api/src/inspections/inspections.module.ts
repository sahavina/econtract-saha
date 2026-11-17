import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import {
  type InspectionCreate,
  inspectionCreateSchema,
  type InspectionQuery,
  inspectionQuerySchema,
  type InspectionResult,
  inspectionResultSchema,
  type InspectionUpdate,
  inspectionUpdateSchema,
} from './inspections.schemas.js';
import { InspectionsService } from './inspections.service.js';

/**
 * Yêu cầu kiểm tra. Xem/xử lý không cần quyền riêng: ai cũng thấy việc được giao cho mình hoặc mình gửi
 * (lọc trong service); quyền inspection.manage thấy và xử lý mọi yêu cầu; gửi yêu cầu cần inspection.create.
 */
@ApiTags('Inspections')
@ApiBearerAuth()
@Controller('inspections')
class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(inspectionQuerySchema)) query: InspectionQuery) {
    return this.inspections.list(user, query);
  }

  @Get('open-count')
  openCount(@CurrentUser() user: AuthUser) {
    return this.inspections.openCount(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INSPECTION_CREATE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(inspectionCreateSchema)) body: InspectionCreate) {
    return this.inspections.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(inspectionUpdateSchema)) body: InspectionUpdate) {
    return this.inspections.update(user, id, body);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.start(user, id);
  }

  @Post(':id/result')
  saveResult(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(inspectionResultSchema)) body: InspectionResult) {
    return this.inspections.saveResult(user, id, body);
  }

  @Post(':id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.reopen(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.cancel(user, id);
  }
}

@Module({ imports: [ContractsModule], controllers: [InspectionsController], providers: [InspectionsService] })
export class InspectionsModule {}
