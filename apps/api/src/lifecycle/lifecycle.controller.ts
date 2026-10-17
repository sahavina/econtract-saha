import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type AcceptanceCreate,
  acceptanceCreateSchema,
  type AppendixCreate,
  appendixCreateSchema,
  type AppendixUpdate,
  appendixUpdateSchema,
  calendarSchema,
  type LifecycleListQuery,
  lifecycleListSchema,
  type LiquidateInput,
  liquidateSchema,
  type ObligationCreate,
  obligationCreateSchema,
  type ObligationUpdate,
  obligationUpdateSchema,
  type PaymentCreate,
  paymentCreateSchema,
  type PaymentUpdate,
  paymentUpdateSchema,
  type RecordPayment,
  recordPaymentSchema,
} from './lifecycle.schemas.js';
import { LifecycleService } from './lifecycle.service.js';

const VIEW = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN] as const;
const UUID = new ParseUUIDPipe();

@ApiTags('Contract lifecycle')
@ApiBearerAuth()
@Controller()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get('lifecycle')
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(lifecycleListSchema)) q: LifecycleListQuery) {
    return this.lifecycle.list(user, q);
  }

  @Get('lifecycle/calendar')
  @RequireAnyPermission(...VIEW)
  calendar(@CurrentUser() user: AuthUser, @Query(new ZodPipe(calendarSchema)) q: z.infer<typeof calendarSchema>) {
    return this.lifecycle.calendar(user, q.month);
  }

  @Get('contracts/:id/lifecycle')
  @RequireAnyPermission(...VIEW)
  overview(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string) {
    return this.lifecycle.overview(user, id);
  }

  // ───── Phụ lục ─────
  @Post('contracts/:id/appendices')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  createAppendix(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body(new ZodPipe(appendixCreateSchema)) body: AppendixCreate,
  ) {
    return this.lifecycle.createAppendix(user, id, body);
  }

  @Patch('contracts/:id/appendices/:itemId')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  updateAppendix(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
    @Body(new ZodPipe(appendixUpdateSchema)) body: AppendixUpdate,
  ) {
    return this.lifecycle.updateAppendix(user, id, itemId, body);
  }

  @Post('contracts/:id/appendices/:itemId/apply')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  applyAppendix(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string, @Param('itemId', UUID) itemId: string) {
    return this.lifecycle.applyAppendix(user, id, itemId);
  }

  @Post('contracts/:id/appendices/:itemId/cancel')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  cancelAppendix(@CurrentUser() user: AuthUser, @Param('id', UUID) id: string, @Param('itemId', UUID) itemId: string) {
    return this.lifecycle.cancelAppendix(user, id, itemId);
  }

  // ───── Nghĩa vụ ─────
  @Post('contracts/:id/obligations')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  createObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body(new ZodPipe(obligationCreateSchema)) body: ObligationCreate,
  ) {
    return this.lifecycle.createObligation(user, id, body);
  }

  @Patch('contracts/:id/obligations/:itemId')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  updateObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
    @Body(new ZodPipe(obligationUpdateSchema)) body: ObligationUpdate,
  ) {
    return this.lifecycle.updateObligation(user, id, itemId, body);
  }

  @Delete('contracts/:id/obligations/:itemId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  deleteObligation(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
  ) {
    return this.lifecycle.deleteObligation(user, id, itemId);
  }

  // ───── Thanh toán ─────
  @Post('contracts/:id/payments')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  createPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body(new ZodPipe(paymentCreateSchema)) body: PaymentCreate,
  ) {
    return this.lifecycle.createPayment(user, id, body);
  }

  @Patch('contracts/:id/payments/:itemId')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  updatePayment(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
    @Body(new ZodPipe(paymentUpdateSchema)) body: PaymentUpdate,
  ) {
    return this.lifecycle.updatePayment(user, id, itemId, body);
  }

  @Post('contracts/:id/payments/:itemId/record')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
    @Body(new ZodPipe(recordPaymentSchema)) body: RecordPayment,
  ) {
    return this.lifecycle.recordPayment(user, id, itemId, body);
  }

  // ───── Nghiệm thu ─────
  @Post('contracts/:id/acceptances')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  createAcceptance(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body(new ZodPipe(acceptanceCreateSchema)) body: AcceptanceCreate,
  ) {
    return this.lifecycle.createAcceptance(user, id, body);
  }

  @Delete('contracts/:id/acceptances/:itemId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  deleteAcceptance(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
  ) {
    return this.lifecycle.deleteAcceptance(user, id, itemId);
  }

  // ───── Thanh lý ─────
  @Post('contracts/:id/liquidate')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_LIQUIDATE)
  liquidate(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID) id: string,
    @Body(new ZodPipe(liquidateSchema)) body: LiquidateInput,
  ) {
    return this.lifecycle.liquidate(user, id, body);
  }
}
