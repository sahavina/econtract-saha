import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import {
  type ShippingNoteCreate,
  shippingNoteCreateSchema,
  type ShippingNoteQuery,
  shippingNoteQuerySchema,
  type ShippingNoteUpdate,
  shippingNoteUpdateSchema,
  type StockIssueCancel,
  stockIssueCancelSchema,
  type StockIssueCreate,
  stockIssueCreateSchema,
  type StockIssueQuery,
  stockIssueQuerySchema,
  type StockIssueUpdate,
  stockIssueUpdateSchema,
} from './deliveries.schemas.js';
import { DeliveriesService } from './deliveries.service.js';

/** Xem phiếu: người lập phiếu hoặc người xem được mọi hợp đồng (kế toán, giám đốc). */
const VIEW = [PERMISSIONS.DELIVERY_MANAGE, PERMISSIONS.CONTRACT_VIEW_ALL] as const;

@ApiTags('Stock issues')
@ApiBearerAuth()
@Controller('stock-issues')
class StockIssuesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(stockIssueQuerySchema)) query: StockIssueQuery) {
    return this.deliveries.listIssues(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(...VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.getIssue(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(stockIssueCreateSchema)) body: StockIssueCreate) {
    return this.deliveries.createIssue(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(stockIssueUpdateSchema)) body: StockIssueUpdate) {
    return this.deliveries.updateIssue(user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(stockIssueCancelSchema)) body: StockIssueCancel) {
    return this.deliveries.cancelIssue(user, id, body);
  }
}

@ApiTags('Shipping notes')
@ApiBearerAuth()
@Controller('shipping-notes')
class ShippingNotesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(shippingNoteQuerySchema)) query: ShippingNoteQuery) {
    return this.deliveries.listNotes(user, query);
  }

  @Get(':id')
  @RequireAnyPermission(...VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.getNote(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(shippingNoteCreateSchema)) body: ShippingNoteCreate) {
    return this.deliveries.createNote(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(shippingNoteUpdateSchema)) body: ShippingNoteUpdate) {
    return this.deliveries.updateNote(user, id, body);
  }
}

@Module({ imports: [ContractsModule], controllers: [StockIssuesController, ShippingNotesController], providers: [DeliveriesService] })
export class DeliveriesModule {}
