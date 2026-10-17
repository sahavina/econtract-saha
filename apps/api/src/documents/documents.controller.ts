import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { DocumentsService } from './documents.service.js';
import { MAX_UPLOAD_BYTES } from './file-types.js';

@ApiTags('Contract documents')
@ApiBearerAuth()
@Controller('contracts/:contractId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN)
  list(@CurrentUser() user: AuthUser, @Param('contractId', ParseUUIDPipe) contractId: string) {
    return this.documents.list(user, contractId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.documents.upload(user, contractId, file);
  }

  @Get(':documentId/download')
  @RequireAnyPermission(PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN)
  async download(
    @CurrentUser() user: AuthUser,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { doc, stream } = await this.documents.getForDownload(user, contractId, documentId);
    const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    );
    res.setHeader('Content-Length', String(doc.size));
    res.setHeader('X-Content-SHA256', doc.sha256);
    return new StreamableFile(stream);
  }

  @Delete(':documentId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.documents.remove(user, contractId, documentId);
  }
}
