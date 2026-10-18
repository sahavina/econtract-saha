/**
 * Client JSON-RPC tối giản cho Odoo (endpoint /jsonrpc, dịch vụ common + object/execute_kw).
 * Chỉ đọc res.partner – không ghi ngược về Odoo.
 */

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

/** Đối tác Odoo đã chuẩn hóa sang trường của eContract. */
export interface OdooPartner {
  odooId: number;
  name: string;
  isCompany: boolean;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  ref: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  /** Loại gợi ý khi nhập: vừa mua vừa bán ⇒ theo chiều giao dịch nhiều hơn (rank cao hơn). */
  suggestedType: 'CUSTOMER' | 'SUPPLIER' | 'OTHER';
}

export type OdooPartnerKind = 'CUSTOMER' | 'SUPPLIER';

type Many2one = [number, string] | false;
interface RawPartner {
  id: number;
  name: string | false;
  is_company: boolean;
  vat: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  state_id: Many2one;
  country_id: Many2one;
  email: string | false;
  phone: string | false;
  mobile?: string | false;
  ref: string | false;
  customer_rank?: number;
  supplier_rank?: number;
}

const PARTNER_FIELDS = [
  'name',
  'is_company',
  'vat',
  'street',
  'street2',
  'city',
  'state_id',
  'country_id',
  'email',
  'phone',
  'mobile',
  'ref',
  'customer_rank',
  'supplier_rank',
];

export class OdooError extends Error {}

const str = (v: string | false | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** "TP Hồ Chí Minh (VN)" → "TP Hồ Chí Minh" */
const m2oName = (v: Many2one) => (v ? v[1].replace(/\s*\([A-Z]{2}\)$/, '').trim() : null);

/** So khớp không dấu, không khoảng trắng: "Việt Nam" ≡ "Vietnam", "TP Hồ Chí Minh" ≡ "tp ho chi minh". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[\s.,-]+/g, '');

/** Ghép địa chỉ, bỏ phần đã có trong chuỗi trước (Odoo VN thường ghi đủ địa chỉ trong "street"). */
export function composeAddress(r: Pick<RawPartner, 'street' | 'street2' | 'city' | 'state_id' | 'country_id'>) {
  const parts: string[] = [];
  for (const p of [str(r.street), str(r.street2), str(r.city), m2oName(r.state_id), m2oName(r.country_id)]) {
    if (!p) continue;
    if (!fold(parts.join(',')).includes(fold(p))) parts.push(p);
  }
  return parts.length ? parts.join(', ') : null;
}

/** Odoo cho phép nhiều email "a@x.vn; b@y.vn" – lấy email hợp lệ đầu tiên. */
export function firstEmail(v: string | false | undefined) {
  const found = (str(v) ?? '').split(/[;,\s]+/).find((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return found ?? null;
}

export function suggestType(customerRank: number, supplierRank: number) {
  if (supplierRank > customerRank) return 'SUPPLIER' as const;
  return customerRank > 0 ? ('CUSTOMER' as const) : ('OTHER' as const);
}

export function mapPartner(r: RawPartner): OdooPartner {
  return {
    odooId: r.id,
    name: str(r.name) ?? `Đối tác Odoo #${r.id}`,
    isCompany: !!r.is_company,
    taxCode: str(r.vat)?.replace(/\s+/g, '').slice(0, 20) ?? null,
    address: composeAddress(r)?.slice(0, 500) ?? null,
    email: firstEmail(r.email),
    phone: (str(r.phone) ?? str(r.mobile))?.slice(0, 30) ?? null,
    ref: str(r.ref)?.slice(0, 50) ?? null,
    isCustomer: (r.customer_rank ?? 0) > 0,
    isSupplier: (r.supplier_rank ?? 0) > 0,
    suggestedType: suggestType(r.customer_rank ?? 0, r.supplier_rank ?? 0),
  };
}

export class OdooClient {
  private uid: number | null = null;

  constructor(
    private readonly cfg: OdooConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  private async rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const endpoint = new URL('/jsonrpc', this.cfg.url).toString();
    let res: Response;
    try {
      res = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      throw new OdooError(
        name === 'TimeoutError' ? 'Odoo không phản hồi (quá thời gian chờ)' : 'Không kết nối được tới Odoo',
      );
    }
    if (!res.ok) throw new OdooError(`Odoo trả lỗi HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as {
      result?: T;
      error?: { data?: { message?: string }; message?: string };
    } | null;
    if (!body) throw new OdooError('Phản hồi Odoo không hợp lệ');
    if (body.error) {
      const msg = body.error.data?.message ?? body.error.message ?? 'Lỗi không xác định';
      throw new OdooError(
        /access|denied|not allowed/i.test(msg)
          ? 'Tài khoản Odoo không có quyền đọc đối tác'
          : `Odoo báo lỗi: ${msg.slice(0, 200)}`,
      );
    }
    return body.result as T;
  }

  async version(): Promise<string> {
    const v = await this.rpc<{ server_version?: string }>('common', 'version', []);
    return v.server_version ?? 'không rõ';
  }

  async authenticate(): Promise<number> {
    if (this.uid) return this.uid;
    const uid = await this.rpc<number | false>('common', 'authenticate', [
      this.cfg.db,
      this.cfg.username,
      this.cfg.apiKey,
      {},
    ]);
    if (!uid) throw new OdooError('Sai database, tài khoản hoặc API key Odoo');
    this.uid = uid;
    return uid;
  }

  private async execute<T>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    const uid = await this.authenticate();
    return this.rpc<T>('object', 'execute_kw', [this.cfg.db, uid, this.cfg.apiKey, model, method, args, kwargs]);
  }

  /** Tìm công ty/cá nhân cấp cao nhất (không phải liên hệ con) theo tên, MST, email, mã tham chiếu. */
  async searchPartners(q: string, kind: OdooPartnerKind | undefined, limit = 20): Promise<OdooPartner[]> {
    const domain: unknown[] = [
      ['active', '=', true],
      ['parent_id', '=', false],
    ];
    if (kind === 'CUSTOMER') domain.push(['customer_rank', '>', 0]);
    if (kind === 'SUPPLIER') domain.push(['supplier_rank', '>', 0]);
    const term = q.trim();
    if (term)
      domain.push(
        '|',
        '|',
        '|',
        ['name', 'ilike', term],
        ['vat', 'ilike', term],
        ['email', 'ilike', term],
        ['ref', 'ilike', term],
      );
    const rows = await this.execute<RawPartner[]>('res.partner', 'search_read', [domain], {
      fields: PARTNER_FIELDS,
      limit,
      order: kind === 'SUPPLIER' ? 'supplier_rank desc, name' : 'customer_rank desc, name',
    });
    return rows.map(mapPartner);
  }

  async readPartner(odooId: number): Promise<OdooPartner | null> {
    const rows = await this.execute<RawPartner[]>('res.partner', 'read', [[odooId]], { fields: PARTNER_FIELDS });
    return rows[0] ? mapPartner(rows[0]) : null;
  }

  /** Người đại diện: liên hệ con có chức vụ giám đốc/CEO (Odoo hiếm khi ghi – có thể không có). */
  async findRepresentative(odooId: number): Promise<{ name: string; position: string } | null> {
    const rows = await this.execute<{ name: string | false; function: string | false }[]>(
      'res.partner',
      'search_read',
      [
        [
          ['parent_id', '=', odooId],
          ['active', '=', true],
          '|',
          '|',
          ['function', 'ilike', 'giám đốc'],
          ['function', 'ilike', 'director'],
          ['function', 'ilike', 'ceo'],
        ],
      ],
      { fields: ['name', 'function'], limit: 1 },
    );
    const r = rows[0];
    return r && str(r.name) ? { name: str(r.name)!, position: str(r.function) ?? 'Giám đốc' } : null;
  }

  async countPartners(): Promise<number> {
    return this.execute<number>('res.partner', 'search_count', [
      [
        ['active', '=', true],
        ['parent_id', '=', false],
      ],
    ]);
  }
}
