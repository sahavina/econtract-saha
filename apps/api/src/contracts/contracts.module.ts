import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module.js';
import { ContractRevisionsService } from './contract-revisions.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';

@Module({
  imports: [TemplatesModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractRevisionsService],
  exports: [ContractsService],
})
export class ContractsModule {}
