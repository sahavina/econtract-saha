import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';

@Module({
  imports: [TemplatesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
