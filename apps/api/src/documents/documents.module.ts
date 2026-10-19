import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DocConvertController, DocConvertService } from './doc-convert.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [ContractsModule],
  controllers: [DocumentsController, DocConvertController],
  providers: [DocumentsService, DocConvertService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
