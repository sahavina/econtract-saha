import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PlatformAdminOnly } from '../common/decorators.js';
import { PermissionsGuard } from '../common/guards.js';
import {
  invoiceCreateSchema,
  invoicePeriodEnd,
  planUpdateSchema,
  subscriptionUpdateSchema,
  tenantCreateSchema,
} from './platform.schemas.js';

const uuid = '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b';

describe('platform schemas', () => {
  const tenant = {
    code: 'Cong-Ty-ABC',
    name: 'Công ty ABC',
    planId: uuid,
    admin: { fullName: 'Quản trị', email: 'Admin@ABC.vn', password: 'Matkhau123' },
  };

  it('normalizes tenant code/email and defaults to trial', () => {
    const t = tenantCreateSchema.parse(tenant);
    expect(t.code).toBe('cong-ty-abc');
    expect(t.admin.email).toBe('admin@abc.vn');
    expect(t.subscriptionStatus).toBe('TRIAL');
  });

  it('rejects bad tenant codes and weak admin passwords', () => {
    expect(tenantCreateSchema.safeParse({ ...tenant, code: 'công ty' }).success).toBe(false);
    expect(tenantCreateSchema.safeParse({ ...tenant, code: '-abc' }).success).toBe(false);
    expect(tenantCreateSchema.safeParse({ ...tenant, admin: { ...tenant.admin, password: '123' } }).success).toBe(false);
  });

  it('update schemas inject no defaults', () => {
    expect(planUpdateSchema.parse({ name: 'X' })).toEqual({ name: 'X' });
    expect(subscriptionUpdateSchema.parse({ status: 'PAST_DUE' })).toEqual({ status: 'PAST_DUE' });
  });

  it('computes invoice periods by calendar month', () => {
    expect(invoicePeriodEnd('2026-01-01', 1).toISOString().slice(0, 10)).toBe('2026-01-31');
    expect(invoicePeriodEnd('2026-01-15', 1).toISOString().slice(0, 10)).toBe('2026-02-14');
    expect(invoicePeriodEnd('2026-11-01', 3).toISOString().slice(0, 10)).toBe('2027-01-31');
    expect(invoiceCreateSchema.safeParse({ tenantId: uuid, periodStart: '2026-01-01', months: 0 }).success).toBe(false);
  });
});

describe('PlatformAdminOnly guard', () => {
  class Ctl {
    @PlatformAdminOnly()
    handler() {}
  }
  const ctx = (isPlatformAdmin: boolean) =>
    ({
      getHandler: () => Ctl.prototype.handler,
      getClass: () => Ctl,
      switchToHttp: () => ({ getRequest: () => ({ user: { isPlatformAdmin, permissions: new Set() } }) }),
    }) as unknown as ExecutionContext;
  const guard = new PermissionsGuard(new Reflector());

  it('allows only platform admins', () => {
    expect(guard.canActivate(ctx(true))).toBe(true);
    expect(() => guard.canActivate(ctx(false))).toThrow(ForbiddenException);
  });
});
