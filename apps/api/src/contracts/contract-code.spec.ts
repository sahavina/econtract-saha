import { partnerAbbreviation, renderCode, sequenceKey, validateCodePattern, withDuplicateSuffix } from './contract-code.js';

describe('contract code', () => {
  const ctx = { date: new Date(2026, 9, 17), typeCode: 'HDMB', departmentCode: 'KD' };

  it('renders default pattern with zero padding', () => {
    expect(renderCode('HD-{YYYY}-{SEQUENCE:5}', ctx, 12)).toBe('HD-2026-00012');
  });

  it('renders type, department, month tokens', () => {
    expect(renderCode('{TYPE}/{DEPT}/{YY}{MM}/{SEQUENCE:3}', ctx, 7)).toBe('HDMB/KD/2610/007');
  });

  it('separates counters by year and type', () => {
    const p = '{TYPE}-{YYYY}-{SEQUENCE}';
    expect(sequenceKey(p, ctx)).toBe('contract:HDMB-2026-#');
    expect(sequenceKey(p, { ...ctx, date: new Date(2027, 0, 1) })).toBe('contract:HDMB-2027-#');
    expect(sequenceKey(p, { ...ctx, typeCode: 'HDDV' })).toBe('contract:HDDV-2026-#');
  });

  it('validates patterns', () => {
    expect(validateCodePattern('HD-{YYYY}-{SEQUENCE:5}')).toBeNull();
    expect(validateCodePattern('HD-{YYYY}')).toBeNull(); // không có {SEQUENCE}: trùng thì thêm hậu tố -2, -3…
    expect(validateCodePattern('')).not.toBeNull();
    expect(validateCodePattern('HD-{SEQUENCE}-{SEQUENCE}')).not.toBeNull();
    expect(validateCodePattern('HD-{FOO}-{SEQUENCE}')).toContain('{FOO}');
  });
});

describe('date and partner tokens', () => {
  it('renders the HĐNT pattern: day+month, year, partner short name, no sequence', () => {
    const c = { date: new Date(2026, 0, 5), partnerCode: 'APOLLO' };
    expect(renderCode('{DD}{MM}/{YYYY}/HĐNT/{PARTNER}-SAHA', c, 0)).toBe('0501/2026/HĐNT/APOLLO-SAHA');
    expect(renderCode('{DD}{MM}/{YYYY}/HĐNT/{PARTNER}-SAHA', { date: c.date }, 0)).toBe('0501/2026/HĐNT/DOITAC-SAHA');
  });

  it('adds -2, -3… to duplicates', () => {
    expect(withDuplicateSuffix('A', [])).toBe('A');
    expect(withDuplicateSuffix('A', ['A'])).toBe('A-2');
    expect(withDuplicateSuffix('A', ['A', 'A-2', 'A-3'])).toBe('A-4');
  });

  it('abbreviates company names', () => {
    expect(partnerAbbreviation('CÔNG TY CỔ PHẦN TẬP ĐOÀN THUẬN THÀNH')).toBe('THUANTHANH');
    expect(partnerAbbreviation('Công ty TNHH Thương mại Apollo')).toBe('APOLLO');
    expect(partnerAbbreviation('  ')).toBeNull();
  });
});

describe('contract schemas', () => {
  it('partial update does not inject defaults', async () => {
    const { contractUpdateSchema, contractCreateSchema } = await import('./contracts.schemas.js');
    expect(contractUpdateSchema.parse({ title: 'x' })).toEqual({ title: 'x' });
    const created = contractCreateSchema.parse({ title: 'x' });
    expect(created).toMatchObject({ value: '0', currency: 'VND', tags: [], parties: [] });
  });

  it('partner partial update does not inject defaults', async () => {
    const { partnerUpdateSchema } = await import('../partners/partners.schemas.js');
    expect(partnerUpdateSchema.parse({ name: 'A' })).toEqual({ name: 'A' });
  });
});
