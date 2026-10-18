import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OdooClient, OdooError, type OdooPartner } from './odoo.client.js';
import { SecretBox } from './secret-box.js';
import { assertSafeIntegrationUrl } from './url-guard.js';

const ODOO = 'odoo';
const refOf = (odooId: number) => `odoo:${odooId}`;

export const odooConfigSchema = z.object({
  url: z.string().trim().url('URL Odoo không hợp lệ').max(300),
  db: z.string().trim().min(1, 'Nhập tên database Odoo').max(100),
  username: z.string().trim().min(1, 'Nhập tài khoản Odoo').max(200),
  /** Bỏ trống khi sửa ⇒ giữ API key đã lưu. */
  apiKey: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(8, 'API key không hợp lệ').max(500).optional(),
  ),
  enabled: z.boolean().default(true),
});
export type OdooConfigInput = z.infer<typeof odooConfigSchema>;

export const odooSearchSchema = z.object({
  q: z.preprocess((v) => (v === undefined ? '' : v), z.string().trim().max(100)),
  type: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['CUSTOMER', 'SUPPLIER']).optional()),
});
export type OdooSearchInput = z.infer<typeof odooSearchSchema>;

export const odooImportSchema = z.object({
  odooId: z.coerce.number().int().positive(),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'OTHER']).optional(),
});
export type OdooImportInput = z.infer<typeof odooImportSchema>;

interface StoredConfig {
  url: string;
  db: string;
  username: string;
}

/** Tích hợp Odoo (chỉ đọc): tìm đối tác trên Odoo và nhập vào danh mục đối tác của doanh nghiệp. */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private box() {
    const secret = this.config.get('INTEGRATION_SECRET', { infer: true });
    if (!secret) throw new BadRequestException('Máy chủ chưa cấu hình INTEGRATION_SECRET – liên hệ quản trị hệ thống');
    return new SecretBox(secret);
  }

  private allowPrivate() {
    return this.config.get('INTEGRATION_ALLOW_PRIVATE_HOSTS', { infer: true });
  }

  private find(tenantId: string) {
    return this.prisma.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: ODOO } } });
  }

  async getConfig(user: AuthUser) {
    const row = await this.find(user.tenantId);
    if (!row) return { configured: false as const };
    const c = row.config as unknown as StoredConfig;
    return {
      configured: true as const,
      enabled: row.enabled,
      url: c.url,
      db: c.db,
      username: c.username,
      hasApiKey: !!row.secretEnc,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
    };
  }

  async saveConfig(user: AuthUser, input: OdooConfigInput) {
    const url = await this.safeUrl(input.url);
    const existing = await this.find(user.tenantId);
    if (!input.apiKey && !existing?.secretEnc) throw new BadRequestException('Nhập API key Odoo');
    const config: StoredConfig = { url: url.origin, db: input.db, username: input.username };
    const secretEnc = input.apiKey ? this.box().seal(input.apiKey) : existing!.secretEnc;
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantIntegration.upsert({
        where: { tenantId_provider: { tenantId: user.tenantId, provider: ODOO } },
        create: { tenantId: user.tenantId, provider: ODOO, enabled: input.enabled, config: { ...config }, secretEnc },
        update: { enabled: input.enabled, config: { ...config }, secretEnc, lastTestedAt: null, lastTestOk: null },
      });
      await this.audit.log(
        user,
        {
          action: 'integration.odoo_config',
          entityType: 'integration',
          data: {
            url: config.url,
            db: config.db,
            username: config.username,
            apiKeyChanged: !!input.apiKey,
            enabled: input.enabled,
          },
        },
        tx,
      );
    });
    return this.getConfig(user);
  }

  async removeConfig(user: AuthUser) {
    const row = await this.find(user.tenantId);
    if (!row) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantIntegration.delete({ where: { id: row.id } });
      await this.audit.log(user, { action: 'integration.odoo_remove', entityType: 'integration' }, tx);
    });
  }

  /** Thử kết nối: phiên bản Odoo, đăng nhập, đếm đối tác. */
  async test(user: AuthUser) {
    const row = await this.find(user.tenantId);
    if (!row) throw new BadRequestException('Chưa cấu hình kết nối Odoo');
    try {
      const client = await this.client(user.tenantId, { requireEnabled: false });
      const version = await client.version();
      await client.authenticate();
      const partners = await client.countPartners();
      await this.prisma.tenantIntegration.update({
        where: { id: row.id },
        data: { lastTestedAt: new Date(), lastTestOk: true },
      });
      return { ok: true, version, partners };
    } catch (e) {
      await this.prisma.tenantIntegration.update({
        where: { id: row.id },
        data: { lastTestedAt: new Date(), lastTestOk: false },
      });
      return { ok: false, error: e instanceof Error ? e.message : 'Lỗi không xác định' };
    }
  }

  async searchPartners(user: AuthUser, input: OdooSearchInput) {
    const client = await this.client(user.tenantId);
    const found = await this.wrap(() => client.searchPartners(input.q, input.type));
    const imported = await this.prisma.partner.findMany({
      where: { tenantId: user.tenantId, externalRef: { in: found.map((p) => refOf(p.odooId)) }, deletedAt: null },
      select: { id: true, code: true, externalRef: true },
    });
    const byRef = new Map(imported.map((p) => [p.externalRef, p]));
    return found.map((p) => ({ ...p, imported: byRef.get(refOf(p.odooId)) ?? null }));
  }

  /** Nhập (hoặc cập nhật nếu đã nhập trước đó, kể cả bản đã xóa mềm) một đối tác từ Odoo. */
  async importPartner(user: AuthUser, input: OdooImportInput) {
    const client = await this.client(user.tenantId);
    const p = await this.wrap(() => client.readPartner(input.odooId));
    if (!p) throw new NotFoundException('Không tìm thấy đối tác trên Odoo');
    const rep = p.isCompany ? await this.wrap(() => client.findRepresentative(p.odooId)) : null;
    const externalRef = refOf(p.odooId);
    const existing = await this.prisma.partner.findUnique({
      where: { tenantId_externalRef: { tenantId: user.tenantId, externalRef } },
    });
    const type = input.type ?? existing?.type ?? p.suggestedType;
    const data = {
      type,
      entityType: p.isCompany ? ('ORGANIZATION' as const) : ('INDIVIDUAL' as const),
      name: p.name,
      taxCode: p.taxCode,
      address: p.address,
      email: p.email,
      phone: p.phone,
      ...(rep && { representative: rep.name, position: rep.position }),
    } satisfies Prisma.PartnerUpdateInput;

    return this.prisma.$transaction(async (tx) => {
      const partner = existing
        ? await tx.partner.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } })
        : await tx.partner.create({
            data: { ...data, tenantId: user.tenantId, externalRef, code: await this.freeCode(tx, user.tenantId, p) },
          });
      await this.audit.log(
        user,
        {
          action: existing ? 'partner.odoo_sync' : 'partner.odoo_import',
          entityType: 'partner',
          entityId: partner.id,
          data: { code: partner.code, name: partner.name, odooId: p.odooId },
        },
        tx,
      );
      return partner;
    });
  }

  /** Cập nhật lại một đối tác đã nhập từ Odoo theo dữ liệu mới nhất. */
  async syncPartner(user: AuthUser, partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!partner) throw new NotFoundException('Không tìm thấy đối tác');
    const odooId = Number(partner.externalRef?.match(/^odoo:(\d+)$/)?.[1]);
    if (!odooId) throw new BadRequestException('Đối tác này không liên kết với Odoo');
    return this.importPartner(user, { odooId, type: partner.type });
  }

  /** Mã đối tác: dùng "Reference" của Odoo nếu chưa trùng, ngược lại ODOO-<id>. */
  private async freeCode(tx: Prisma.TransactionClient, tenantId: string, p: OdooPartner) {
    for (const code of [p.ref, `ODOO-${p.odooId}`]) {
      if (code && !(await tx.partner.findUnique({ where: { tenantId_code: { tenantId, code } } }))) return code;
    }
    return `ODOO-${p.odooId}-${Date.now().toString(36)}`;
  }

  private async safeUrl(raw: string) {
    try {
      return await assertSafeIntegrationUrl(raw, this.allowPrivate());
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'URL không hợp lệ');
    }
  }

  private async client(tenantId: string, opts: { requireEnabled?: boolean } = {}) {
    const row = await this.find(tenantId);
    if (!row?.secretEnc)
      throw new BadRequestException('Doanh nghiệp chưa cấu hình kết nối Odoo (Cấu hình → Tích hợp Odoo)');
    if ((opts.requireEnabled ?? true) && !row.enabled) throw new BadRequestException('Kết nối Odoo đang tắt');
    const c = row.config as unknown as StoredConfig;
    // Kiểm tra lại mỗi lần dùng: tên miền có thể đã đổi sang trỏ vào mạng nội bộ.
    const url = await this.safeUrl(c.url);
    let apiKey: string;
    try {
      apiKey = this.box().open(row.secretEnc);
    } catch {
      throw new BadRequestException('Không giải mã được API key Odoo (khóa máy chủ đã đổi?) – hãy nhập lại API key');
    }
    return new OdooClient({ url: url.origin, db: c.db, username: c.username, apiKey });
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof OdooError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
