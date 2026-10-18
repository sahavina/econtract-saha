import { describe, expect, it, vi } from 'vitest';
import { composeAddress, firstEmail, mapPartner, OdooClient, OdooError } from './odoo.client.js';
import { SecretBox } from './secret-box.js';
import { assertSafeIntegrationUrl, isPrivateAddress } from './url-guard.js';

describe('SecretBox', () => {
  it('round-trips and rejects tampering or a different key', () => {
    const box = new SecretBox('a'.repeat(40));
    const sealed = box.seal('odoo-api-key-123');
    expect(sealed).not.toContain('odoo-api-key-123');
    expect(box.open(sealed)).toBe('odoo-api-key-123');
    expect(box.seal('x')).not.toBe(box.seal('x')); // IV ngẫu nhiên
    const parts = sealed.split('.');
    parts[3] = Buffer.from('khac').toString('base64url');
    expect(() => box.open(parts.join('.'))).toThrow();
    expect(() => new SecretBox('b'.repeat(40)).open(sealed)).toThrow();
  });
});

describe('url guard', () => {
  it('classifies private addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '217.216.39.53', '2001:4860::8888']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('requires https and public hosts unless private hosts are allowed', async () => {
    await expect(assertSafeIntegrationUrl('http://odoo.example.vn', false)).rejects.toThrow(/HTTPS/);
    await expect(assertSafeIntegrationUrl('https://127.0.0.1:8069', false)).rejects.toThrow(/nội bộ/);
    await expect(assertSafeIntegrationUrl('https://user:pw@8.8.8.8', false)).rejects.toThrow(/tài khoản/);
    await expect(assertSafeIntegrationUrl('https://8.8.8.8', false)).resolves.toBeInstanceOf(URL);
    await expect(assertSafeIntegrationUrl('http://localhost:8069', true)).resolves.toBeInstanceOf(URL);
  });
});

describe('Odoo partner mapping', () => {
  const raw = {
    id: 836,
    name: 'CÔNG TY TNHH ĐẦU TƯ XÂY DỰNG ANH ANH',
    is_company: true,
    vat: '0700 654 375',
    street: 'Tổ dân phố số 1, Phường Lý Thường Kiệt, Tỉnh Ninh Bình, Việt Nam',
    street2: false as const,
    city: false as const,
    state_id: [1087, 'Ninh Bình (VN)'] as [number, string],
    country_id: [241, 'Vietnam'] as [number, string],
    email: 'ketoan.anhanh@example.vn; hoadon@example.vn',
    phone: false as const,
    mobile: '+84 226 6277 677',
    ref: false as const,
    customer_rank: 127,
    supplier_rank: 6,
  };

  it('normalizes fields', () => {
    expect(mapPartner(raw)).toEqual({
      odooId: 836,
      name: 'CÔNG TY TNHH ĐẦU TƯ XÂY DỰNG ANH ANH',
      isCompany: true,
      taxCode: '0700654375',
      address: 'Tổ dân phố số 1, Phường Lý Thường Kiệt, Tỉnh Ninh Bình, Việt Nam',
      email: 'ketoan.anhanh@example.vn',
      phone: '+84 226 6277 677',
      ref: null,
      isCustomer: true,
      isSupplier: true,
    });
  });

  it('composes address without repeating parts already in street', () => {
    expect(
      composeAddress({
        street: '12 Lê Lợi',
        street2: false,
        city: 'Quận 1',
        state_id: [1, 'TP Hồ Chí Minh (VN)'],
        country_id: false,
      }),
    ).toBe('12 Lê Lợi, Quận 1, TP Hồ Chí Minh');
    expect(
      composeAddress({ street: false, street2: false, city: false, state_id: false, country_id: false }),
    ).toBeNull();
    expect(firstEmail('khong-phai-email; a@b.vn')).toBe('a@b.vn');
    expect(firstEmail(false)).toBeNull();
  });
});

describe('OdooClient', () => {
  const cfg = { url: 'https://odoo.example.vn', db: 'saha', username: 'api@saha.vn', apiKey: 'k'.repeat(20) };
  const reply = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));

  it('authenticates once and searches top-level partners by kind and term', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(7))
      .mockResolvedValueOnce(
        reply([
          {
            id: 1,
            name: 'A',
            is_company: true,
            vat: false,
            street: false,
            street2: false,
            city: false,
            state_id: false,
            country_id: false,
            email: false,
            phone: false,
            ref: 'KH01',
            customer_rank: 1,
            supplier_rank: 0,
          },
        ]),
      )
      .mockResolvedValueOnce(reply([]));
    const client = new OdooClient(cfg, fetchMock as unknown as typeof fetch);
    const res = await client.searchPartners('anh anh', 'CUSTOMER');
    await client.searchPartners('', 'SUPPLIER');
    expect(res[0]).toMatchObject({ odooId: 1, ref: 'KH01', isCustomer: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://odoo.example.vn/jsonrpc');
    const auth = JSON.parse(fetchMock.mock.calls[0][1].body).params;
    expect(auth).toMatchObject({
      service: 'common',
      method: 'authenticate',
      args: ['saha', 'api@saha.vn', cfg.apiKey, {}],
    });
    const search = JSON.parse(fetchMock.mock.calls[1][1].body).params.args;
    expect(search.slice(0, 5)).toEqual(['saha', 7, cfg.apiKey, 'res.partner', 'search_read']);
    expect(search[5][0]).toEqual(
      expect.arrayContaining([
        ['parent_id', '=', false],
        ['customer_rank', '>', 0],
        ['name', 'ilike', 'anh anh'],
        ['vat', 'ilike', 'anh anh'],
      ]),
    );
    const supplierDomain = JSON.parse(fetchMock.mock.calls[2][1].body).params.args[5][0];
    expect(supplierDomain).toContainEqual(['supplier_rank', '>', 0]);
    expect(supplierDomain).not.toContainEqual(expect.arrayContaining(['name']));
  });

  it('maps failures to readable errors', async () => {
    const wrongLogin = new OdooClient(cfg, vi.fn().mockResolvedValue(reply(false)) as unknown as typeof fetch);
    await expect(wrongLogin.authenticate()).rejects.toThrow(/Sai database, tài khoản hoặc API key/);
    const denied = new OdooClient(
      cfg,
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { data: { message: 'Access Denied' } } })),
        ) as unknown as typeof fetch,
    );
    await expect(denied.version()).rejects.toThrow(/không có quyền/);
    const down = new OdooClient(
      cfg,
      vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch,
    );
    await expect(down.version()).rejects.toBeInstanceOf(OdooError);
  });
});
