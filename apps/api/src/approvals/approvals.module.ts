import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { WorkflowsModule } from '../workflows/workflows.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

@Module({
  imports: [ContractsModule, WorkflowsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
