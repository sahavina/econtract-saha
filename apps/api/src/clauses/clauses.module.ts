import { Module } from '@nestjs/common';
import { ClausesController } from './clauses.controller.js';
import { ClausesService } from './clauses.service.js';

@Module({
  controllers: [ClausesController],
  providers: [ClausesService],
})
export class ClausesModule {}
