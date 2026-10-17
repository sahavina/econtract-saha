import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type DashboardQuery, dashboardQuerySchema, DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  summary(@CurrentUser() user: AuthUser, @Query(new ZodPipe(dashboardQuerySchema)) query: DashboardQuery) {
    return this.dashboard.summary(user, query);
  }
}
