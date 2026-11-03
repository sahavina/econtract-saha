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
  type PaymentRequestCreate,
  paymentRequestCreateSchema,
  type PaymentRequestMarkPaid,
  paymentRequestMarkPaidSchema,
  type PaymentRequestMarkSent,
  paymentRequestMarkSentSchema,
  type PaymentRequestQuery,
  paymentRequestQuerySchema,
  type PaymentRequestSendEmail,
  paymentRequestSendEmailSchema,
  type PaymentRequestUpdate,
  paymentRequestUpdateSchema,
} from './payment-requests.schemas.js';
import { PaymentRequestsService } from './payment-requests.service.js';

/** Xem đề nghị: người lập hoặc người xem được mọi hợp đồng (giám đốc). */
const VIEW = [PERMISSIONS.PAYMENT_REQUEST_MANAGE, PERMISSIONS.CONTRACT_VIEW_ALL] as const;
/** Giấy đề nghị chỉ vài trang; giới hạn để email không quá lớn. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

@ApiTags('Payment requests')
@ApiBearerAuth()
@Controller('payment-requests')
class PaymentRequestsController {
  constructor(private readonly requests: PaymentRequestsService) {}

  @Get()
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(paymentRequestQuerySchema)) query: PaymentRequestQuery) {
    return this.requests.list(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(...VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYMENT_REQUEST_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(paymentRequestCreateSchema)) body: PaymentRequestCreate) {
    return this.requests.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_REQUEST_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(paymentRequestUpdateSchema)) body: PaymentRequestUpdate) {
    return this.requests.update(user, id, body);
  }

  @Post(':id/mark-sent')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYMENT_REQUEST_MANAGE)
  markSent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(paymentRequestMarkSentSchema)) body: PaymentRequestMarkSent) {
    return this.requests.markSent(user, id, body);
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYMENT_REQUEST_MANAGE)
  markPaid(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(paymentRequestMarkPaidSchema)) body: PaymentRequestMarkPaid) {
    return this.requests.markPaid(user, id, body);
  }

  @Post(':id/send-email')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYMENT_REQUEST_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1 } }))
  sendEmail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(paymentRequestSendEmailSchema)) body: PaymentRequestSendEmail,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.requests.sendEmail(user, id, body, file);
  }
}

@Module({ imports: [ContractsModule], controllers: [PaymentRequestsController], providers: [PaymentRequestsService] })
export class PaymentRequestsModule {}
