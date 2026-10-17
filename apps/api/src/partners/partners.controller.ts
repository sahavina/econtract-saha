import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type PartnerInput,
  partnerInputSchema,
  type PartnerQuery,
  partnerQuerySchema,
  type PartnerUpdate,
  partnerUpdateSchema,
} from './partners.schemas.js';
import { PartnersService } from './partners.service.js';

@ApiTags('Partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PARTNER_VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(partnerQuerySchema)) query: PartnerQuery) {
    return this.partners.list(user, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PARTNER_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PARTNER_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(partnerInputSchema)) body: PartnerInput) {
    return this.partners.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PARTNER_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(partnerUpdateSchema)) body: PartnerUpdate,
  ) {
    return this.partners.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PARTNER_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.remove(user, id);
  }
}
