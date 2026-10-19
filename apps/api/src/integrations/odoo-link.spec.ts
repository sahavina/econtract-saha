import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { IntegrationsService } from './integrations.service.js';

const user = { tenantId: 't1', userId: 'u1', fullName: 'Admin' } as AuthUser;
const odoo = (odooId: number, taxCode: string, name: string) => ({
  odooId,
  taxCode,
  name,
  address: 'Địa chỉ Odoo',
  email: 'odoo@x.vn',
  phone: '0900',
  isCompany: true,
});

function setup(partners: Record<string, Record<string, unknown>>, taken: Record<string, unknown> | null = null) {
  const tx = { partner: { update: vi.fn((a: { where: { id: string }; data: object }) => Promise.resolve({ ...partners[a.where.id], ...a.data })) } };
  const prisma = {
    partner: {
      findMany: vi.fn().mockResolvedValue(Object.values(partners)),
      findFirst: vi.fn((a: { where: { id?: string; externalRef?: string } }) =>
        Promise.resolve(a.where.id && !a.where.externalRef ? partners[a.where.id] : taken),
      ),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: vi.fn() };
  const client = {
    searchPartners: vi.fn((q: string) =>
      Promise.resolve(
        q === '0315764418' ? [odoo(5, 'VN 0315764418', 'TẬP ĐOÀN THUẬN THÀNH'), odoo(6, '0315764418999', 'Khác')] : q === '0101' ? [odoo(7, '0101', 'A'), odoo(8, '0101', 'B')] : [],
      ),
    ),
    readPartner: vi.fn((id: number) => Promise.resolve(odoo(id, '0315764418', 'TẬP ĐOÀN THUẬN THÀNH'))),
  };
  const svc = new IntegrationsService(prisma as never, audit as never, {} as never);
  (svc as unknown as { client: () => Promise<unknown> }).client = () => Promise.resolve(client);
  return { svc, tx, audit };
}

describe('Odoo partner linking', () => {
  it('auto-links by tax code only when exactly one Odoo partner matches (ignoring "VN" prefix)', async () => {
    const { svc, tx, audit } = setup({
      a: { id: 'a', code: 'NCC0001', taxCode: '0315764418', address: null, email: 'giu@ncc.vn', phone: null, externalRef: null },
      b: { id: 'b', code: 'KH0009', taxCode: '9999', externalRef: null },
      c: { id: 'c', code: 'KH0010', taxCode: '0101', externalRef: null },
    });
    const r = await svc.autoLink(user);
    expect(r).toEqual({ linked: [{ code: 'NCC0001', odooName: 'TẬP ĐOÀN THUẬN THÀNH' }], ambiguous: ['KH0010'], notFound: ['KH0009'], failed: [] });
    // Chỉ điền trường trống: email đã có được giữ nguyên.
    expect(tx.partner.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { externalRef: 'odoo:5', taxCode: '0315764418', address: 'Địa chỉ Odoo', email: 'giu@ncc.vn', phone: '0900' },
    });
    expect(audit.log).toHaveBeenCalledWith(user, expect.objectContaining({ action: 'partner.odoo_link' }), tx);
  });

  it('refuses an Odoo partner already mapped to another partner', async () => {
    const { svc } = setup({ a: { id: 'a', code: 'KH0004', externalRef: null } }, { code: 'KH0001', deletedAt: null });
    await expect(svc.linkPartner(user, 'a', 5)).rejects.toThrow(new BadRequestException('Đối tác Odoo này đã ánh xạ với KH0001'));
  });
});
