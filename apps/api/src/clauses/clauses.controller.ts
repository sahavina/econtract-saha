import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type ClauseCreate,
  clauseCreateSchema,
  type ClauseQuery,
  clauseQuerySchema,
  type ClauseReject,
  clauseRejectSchema,
  type ClauseUpdate,
  clauseUpdateSchema,
} from './clauses.schemas.js';
import { ClausesService } from './clauses.service.js';

@ApiTags('Clauses')
@ApiBearerAuth()
@Controller('clauses')
export class ClausesController {
  constructor(private readonly clauses: ClausesService) {}

  /** Người soạn hợp đồng cũng tra cứu được (chỉ điều khoản đã duyệt) để chèn vào nội dung. */
  @Get()
  @RequireAnyPermission(PERMISSIONS.TEMPLATE_VIEW, PERMISSIONS.CONTRACT_UPDATE)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(clauseQuerySchema)) query: ClauseQuery) {
    return this.clauses.list(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.TEMPLATE_VIEW, PERMISSIONS.CONTRACT_UPDATE)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clauses.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(clauseCreateSchema)) body: ClauseCreate) {
    return this.clauses.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(clauseUpdateSchema)) body: ClauseUpdate,
  ) {
    return this.clauses.update(user, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clauses.submit(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CLAUSE_APPROVE)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clauses.approve(user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CLAUSE_APPROVE)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(clauseRejectSchema)) body: ClauseReject,
  ) {
    return this.clauses.reject(user, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clauses.archive(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.TEMPLATE_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clauses.remove(user, id);
  }
}
