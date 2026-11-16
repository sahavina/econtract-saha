import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { PartnersController } from './partners.controller.js';
import { PartnersService } from './partners.service.js';

@Module({
  imports: [ContractsModule],
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
