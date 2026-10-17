import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { type ReportQuery, reportQuerySchema, ReportsService } from './reports.service.js';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  summary(@CurrentUser() user: AuthUser, @Query(new ZodPipe(reportQuerySchema)) q: ReportQuery) {
    return this.reports.summary(user, q);
  }
}

@Module({
  imports: [ContractsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
