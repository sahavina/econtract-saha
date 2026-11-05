import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import { memoryStorage } from 'multer';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import {
  type QuoteCreate,
  quoteCreateSchema,
  type QuoteDecision,
  quoteDecisionSchema,
  type QuoteLinkOrder,
  quoteLinkOrderSchema,
  type QuoteMarkSent,
  quoteMarkSentSchema,
  type QuoteQuery,
  quoteQuerySchema,
  type QuoteSendEmail,
  quoteSendEmailSchema,
  type QuoteUpdate,
  quoteUpdateSchema,
} from './quotes.schemas.js';
import { QuotesService } from './quotes.service.js';

/** Xem báo giá: người lập hoặc người xem được mọi hợp đồng (giám đốc). */
const VIEW = [PERMISSIONS.QUOTE_MANAGE, PERMISSIONS.CONTRACT_VIEW_ALL] as const;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('quotes')
class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(quoteQuerySchema)) query: QuoteQuery) {
    return this.quotes.list(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(...VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotes.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.QUOTE_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(quoteCreateSchema)) body: QuoteCreate) {
    return this.quotes.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.QUOTE_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(quoteUpdateSchema)) body: QuoteUpdate) {
    return this.quotes.update(user, id, body);
  }

  @Post(':id/mark-sent')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTE_MANAGE)
  markSent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(quoteMarkSentSchema)) body: QuoteMarkSent) {
    return this.quotes.markSent(user, id, body);
  }

  @Post(':id/decide')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTE_MANAGE)
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(quoteDecisionSchema)) body: QuoteDecision) {
    return this.quotes.decide(user, id, body);
  }

  @Post(':id/link-order')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTE_MANAGE)
  linkOrder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(quoteLinkOrderSchema)) body: QuoteLinkOrder) {
    return this.quotes.linkOrder(user, id, body);
  }

  @Post(':id/send-email')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTE_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1 } }))
  sendEmail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(quoteSendEmailSchema)) body: QuoteSendEmail,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.quotes.sendEmail(user, id, body, file);
  }
}

@Module({ imports: [ContractsModule], controllers: [QuotesController], providers: [QuotesService] })
export class QuotesModule {}
