import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CONTRACT_STATUS_LABELS, PERMISSIONS } from '@saha/shared';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type ContractCreate,
  contractCreateSchema,
  type ContractExportQuery,
  contractExportSchema,
  type ContractQuery,
  contractQuerySchema,
  type ContractUpdate,
  contractUpdateSchema,
} from './contracts.schemas.js';
import { ContractsService } from './contracts.service.js';

const VIEW = [PERMISSIONS.CONTRACT_VIEW_ALL, PERMISSIONS.CONTRACT_VIEW_OWN] as const;

const csvCell = (v: string | number | Date | null | undefined) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Chống CSV/formula injection khi mở bằng Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
};

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(contractQuerySchema)) query: ContractQuery) {
    return this.contracts.list(user, query);
  }

  @Get('lookups')
  @RequireAnyPermission(...VIEW)
  lookups(@CurrentUser() user: AuthUser) {
    return this.contracts.lookups(user);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.CONTRACT_EXPORT)
  async export(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(contractExportSchema)) query: ContractExportQuery,
    @Res() res: Response,
  ) {
    const rows = await this.contracts.exportRows(user, query);
    const header = [
      'Mã hợp đồng',
      'Tên hợp đồng',
      'Loại',
      'Đối tác',
      'Giá trị',
      'Tiền tệ',
      'Người phụ trách',
      'Phòng ban',
      'Ngày tạo',
      'Ngày ký',
      'Ngày hiệu lực',
      'Ngày hết hạn',
      'Trạng thái',
    ];
    const lines = rows.map((r) =>
      [
        r.code,
        r.title,
        r.contractType?.name,
        r.parties[0]?.name,
        r.value.toString(),
        r.currency,
        r.owner?.fullName,
        r.department?.name,
        r.createdAt,
        r.signedDate,
        r.effectiveDate,
        r.expiryDate,
        CONTRACT_STATUS_LABELS[r.status],
      ]
        .map(csvCell)
        .join(','),
    );
    const filename = `hop-dong-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM để Excel hiển thị đúng tiếng Việt.
    res.send('﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n'));
  }

  @Get(':id')
  @RequireAnyPermission(...VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.get(user, id);
  }

  @Get(':id/timeline')
  @RequireAnyPermission(...VIEW)
  timeline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.timeline(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACT_CREATE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(contractCreateSchema)) body: ContractCreate) {
    return this.contracts.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTRACT_UPDATE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(contractUpdateSchema)) body: ContractUpdate,
  ) {
    return this.contracts.update(user, id, body);
  }

  @Post(':id/duplicate')
  @RequirePermissions(PERMISSIONS.CONTRACT_CREATE)
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.duplicate(user, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CONTRACT_ARCHIVE)
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.setArchived(user, id, true);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CONTRACT_ARCHIVE)
  unarchive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.setArchived(user, id, false);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_DELETE)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.softDelete(user, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CONTRACT_DELETE)
  restore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.restore(user, id);
  }
}
