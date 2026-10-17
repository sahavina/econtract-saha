import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { SignaturesController } from './signatures.controller.js';
import { SignaturesService } from './signatures.service.js';

@Module({
  imports: [ContractsModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
})
export class SignaturesModule {}
