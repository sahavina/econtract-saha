import {
  Body,
  Controller,
  Get,
  Global,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PlatformAdminOnly, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PlanLimitsService } from './plan-limits.service.js';
import {
  type InvoiceCreate,
  invoiceCreateSchema,
  type InvoiceQuery,
  invoiceQuerySchema,
  invoiceVoidSchema,
  type PlanCreate,
  planCreateSchema,
  type PlanUpdate,
  planUpdateSchema,
  type PlatformAuditQuery,
  platformAuditQuerySchema,
  type SubscriptionCreate,
  subscriptionCreateSchema,
  type SubscriptionUpdate,
  subscriptionUpdateSchema,
  type TenantCreate,
  tenantCreateSchema,
  type TenantQuery,
  tenantQuerySchema,
  type TenantStatusInput,
  tenantStatusSchema,
  type TenantUpdate,
  tenantUpdateSchema,
} from './platform.schemas.js';
import { PlatformService } from './platform.service.js';

/** API vận hành nền tảng (liên doanh nghiệp) – chỉ Super Admin. */
@ApiTags('Platform (Super Admin)')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('platform')
class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('tenants')
  listTenants(@Query(new ZodPipe(tenantQuerySchema)) q: TenantQuery) {
    return this.platform.listTenants(q);
  }

  @Get('tenants/:id')
  getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getTenant(id);
  }

  @Post('tenants')
  createTenant(@CurrentUser() user: AuthUser, @Body(new ZodPipe(tenantCreateSchema)) body: TenantCreate) {
    return this.platform.createTenant(user, body);
  }

  @Patch('tenants/:id')
  updateTenant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tenantUpdateSchema)) body: TenantUpdate,
  ) {
    return this.platform.updateTenant(user, id, body);
  }

  @Post('tenants/:id/status')
  @HttpCode(200)
  setTenantStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tenantStatusSchema)) body: TenantStatusInput,
  ) {
    return this.platform.setTenantStatus(user, id, body);
  }

  @Post('tenants/:id/subscriptions')
  createSubscription(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(subscriptionCreateSchema)) body: SubscriptionCreate,
  ) {
    return this.platform.createSubscription(user, id, body);
  }

  @Patch('subscriptions/:id')
  updateSubscription(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(subscriptionUpdateSchema)) body: SubscriptionUpdate,
  ) {
    return this.platform.updateSubscription(user, id, body);
  }

  @Get('plans')
  listPlans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentUser() user: AuthUser, @Body(new ZodPipe(planCreateSchema)) body: PlanCreate) {
    return this.platform.createPlan(user, body);
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(planUpdateSchema)) body: PlanUpdate,
  ) {
    return this.platform.updatePlan(user, id, body);
  }

  @Get('invoices')
  listInvoices(@Query(new ZodPipe(invoiceQuerySchema)) q: InvoiceQuery) {
    return this.platform.listInvoices(q);
  }

  @Post('invoices')
  createInvoice(@CurrentUser() user: AuthUser, @Body(new ZodPipe(invoiceCreateSchema)) body: InvoiceCreate) {
    return this.platform.createInvoice(user, body);
  }

  @Post('invoices/:id/pay')
  @HttpCode(200)
  payInvoice(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.payInvoice(user, id);
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  voidInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(invoiceVoidSchema)) body: { reason: string },
  ) {
    return this.platform.voidInvoice(user, id, body.reason);
  }

  @Get('audit-logs')
  auditLogs(@Query(new ZodPipe(platformAuditQuerySchema)) q: PlatformAuditQuery) {
    return this.platform.auditLogs(q);
  }
}

/** Gói dịch vụ & hóa đơn của chính doanh nghiệp (quản trị viên doanh nghiệp xem). */
@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
class BillingController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  mine(@CurrentUser() user: AuthUser) {
    return this.platform.myBilling(user);
  }
}

@Global()
@Module({
  controllers: [PlatformController, BillingController],
  providers: [PlatformService, PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlatformModule {}
