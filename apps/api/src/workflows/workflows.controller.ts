import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type WorkflowCreate,
  workflowCreateSchema,
  type WorkflowUpdate,
  workflowUpdateSchema,
} from './workflows.schemas.js';
import { WorkflowsService } from './workflows.service.js';

@ApiTags('Approval workflows')
@ApiBearerAuth()
@Controller('workflows')
@RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workflows.list(user);
  }

  @Get('lookups')
  lookups(@CurrentUser() user: AuthUser) {
    return this.workflows.lookups(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(workflowCreateSchema)) body: WorkflowCreate) {
    return this.workflows.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(workflowUpdateSchema)) body: WorkflowUpdate,
  ) {
    return this.workflows.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.remove(user, id);
  }
}
