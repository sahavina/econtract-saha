import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import {
  type PaymentRequestCreate,
  paymentRequestCreateSchema,
  type PaymentRequestQuery,
  paymentRequestQuerySchema,
  type PaymentRequestUpdate,
  paymentRequestUpdateSchema,
} from './payment-requests.schemas.js';
import { PaymentRequestsService } from './payment-requests.service.js';

/** Xem đề nghị: người lập hoặc người xem được mọi hợp đồng (giám đốc). */
const VIEW = [PERMISSIONS.PAYMENT_REQUEST_MANAGE, PERMISSIONS.CONTRACT_VIEW_ALL] as const;

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
}

@Module({ imports: [ContractsModule], controllers: [PaymentRequestsController], providers: [PaymentRequestsService] })
export class PaymentRequestsModule {}
