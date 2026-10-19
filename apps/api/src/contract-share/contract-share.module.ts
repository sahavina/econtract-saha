import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { ContractShareController } from './contract-share.controller.js';
import { ContractShareService } from './contract-share.service.js';

@Module({
  imports: [ContractsModule],
  controllers: [ContractShareController],
  providers: [ContractShareService],
})
export class ContractShareModule {}
