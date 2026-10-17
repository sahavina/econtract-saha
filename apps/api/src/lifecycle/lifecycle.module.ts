import { Controller, HttpCode, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import { RequirePermissions } from '../common/decorators.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { LifecycleController } from './lifecycle.controller.js';
import { LifecycleJobs } from './lifecycle.jobs.js';
import { LifecycleService } from './lifecycle.service.js';

/** Chạy tác vụ vòng đời ngay (quản trị/kiểm thử) thay vì chờ lịch 01:00. */
@ApiTags('Contract lifecycle')
@ApiBearerAuth()
@Controller('lifecycle/jobs')
class LifecycleJobsController {
  constructor(private readonly jobs: LifecycleJobs) {}

  @Post('run')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  run() {
    return this.jobs.run();
  }
}

@Module({
  imports: [ContractsModule],
  controllers: [LifecycleController, LifecycleJobsController],
  providers: [LifecycleService, LifecycleJobs],
})
export class LifecycleModule {}
