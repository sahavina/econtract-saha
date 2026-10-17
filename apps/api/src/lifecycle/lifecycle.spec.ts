import {
  appendixCreateSchema,
  liquidateSchema,
  obligationUpdateSchema,
  paymentCreateSchema,
  recordPaymentSchema,
} from './lifecycle.schemas.js';

describe('lifecycle schemas', () => {
  it('requires new expiry date for extension appendices', () => {
    expect(appendixCreateSchema.safeParse({ title: 'Gia hạn', kind: 'EXTENSION' }).success).toBe(false);
    expect(
      appendixCreateSchema.safeParse({ title: 'Gia hạn', kind: 'EXTENSION', newExpiryDate: '2027-12-31' }).success,
    ).toBe(true);
    expect(
      appendixCreateSchema.safeParse({ title: 'Giảm giá', kind: 'AMENDMENT', valueChange: '-2000000' }).success,
    ).toBe(true);
  });

  it('validates payment amounts', () => {
    expect(paymentCreateSchema.safeParse({ title: 'Đợt 1', amount: '0' }).success).toBe(false);
    expect(paymentCreateSchema.safeParse({ title: 'Đợt 1', amount: '-5' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ amount: '1000000.50', paidDate: '2026-10-17' }).success).toBe(true);
  });

  it('partial obligation update injects no defaults; liquidation needs a note', () => {
    expect(obligationUpdateSchema.parse({ progress: 50 })).toEqual({ progress: 50 });
    expect(liquidateSchema.safeParse({ liquidationDate: '2026-10-17', note: '' }).success).toBe(false);
    expect(liquidateSchema.parse({ liquidationDate: '2026-10-17', note: 'OK' }).force).toBe(false);
  });
});
