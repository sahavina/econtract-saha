import { mergePartnerType, partnerTypeFilter } from '@saha/shared';
import { vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { syncPartyPartners } from './contract-partners.js';
import type { PartyInput } from './contracts.schemas.js';

const user = { tenantId: 't1', userId: 'u1', fullName: 'Admin' } as AuthUser;
const party = (over: Partial<PartyInput> = {}): PartyInput =>
  ({ role: 'PARTY_B', isInternal: false, entityType: 'ORGANIZATION', name: 'CÔNG TY TNHH APOLLO', taxCode: '0101 234 567', ...over }) as PartyInput;

function setup(existing: Record<string, unknown> | null) {
  const tx = {
    partner: {
      findFirst: vi.fn().mockResolvedValue(existing),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new', ...a.data })),
      update: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ current: 7 }]),
  };
  const audit = { log: vi.fn() };
  return { tx, audit };
}

describe('partner type rules', () => {
  it('merges customer and supplier into BOTH', () => {
    expect(mergePartnerType('CUSTOMER', 'SUPPLIER')).toBe('BOTH');
    expect(mergePartnerType('SUPPLIER', 'SUPPLIER')).toBe('SUPPLIER');
    expect(mergePartnerType('BOTH', 'CUSTOMER')).toBe('BOTH');
    expect(mergePartnerType('OTHER', 'CUSTOMER')).toBe('CUSTOMER');
  });

  it('lists BOTH under customers and suppliers', () => {
    expect(partnerTypeFilter('SUPPLIER')).toEqual(['SUPPLIER', 'BOTH']);
    expect(partnerTypeFilter('OTHER')).toEqual(['OTHER']);
    expect(partnerTypeFilter(undefined)).toBeUndefined();
  });
});

describe('syncPartyPartners', () => {
  it('creates a supplier with code NCC0007, short name and normalized tax code, and links the party', async () => {
    const { tx, audit } = setup(null);
    const [p] = await syncPartyPartners(tx as never, user, audit as never, [party({ partnerType: 'SUPPLIER' })]);
    expect(tx.partner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'NCC0007', type: 'SUPPLIER', shortName: 'APOLLO', taxCode: '0101234567', tenantId: 't1' }),
    });
    expect(p).toMatchObject({ partnerId: 'new' });
    expect(p).not.toHaveProperty('partnerType');
    expect(audit.log).toHaveBeenCalledWith(user, expect.objectContaining({ action: 'partner.create' }), tx);
  });

  it('links an existing partner found by tax code and widens its type', async () => {
    const { tx } = setup({ id: 'p1', type: 'CUSTOMER' });
    const [p] = await syncPartyPartners(tx as never, user, { log: vi.fn() } as never, [party({ partnerType: 'SUPPLIER' })]);
    expect(tx.partner.findFirst).toHaveBeenCalledWith({ where: { tenantId: 't1', deletedAt: null, taxCode: '0101234567' } });
    expect(tx.partner.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { type: 'BOTH' } });
    expect(p.partnerId).toBe('p1');
  });

  it('leaves internal or unclassified parties alone', async () => {
    const { tx } = setup(null);
    const out = await syncPartyPartners(tx as never, user, { log: vi.fn() } as never, [
      party({ isInternal: true, partnerType: 'CUSTOMER' }),
      party({ partnerType: null }),
    ]);
    expect(tx.partner.findFirst).not.toHaveBeenCalled();
    expect(out.every((x) => !('partnerType' in x))).toBe(true);
  });
});
