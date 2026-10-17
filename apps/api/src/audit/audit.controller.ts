import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuditQuery, auditQuerySchema, AuditService } from './audit.service.js';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(auditQuerySchema)) query: AuditQuery) {
    return this.audit.list(user, query);
  }
}
