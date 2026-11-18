import { Injectable } from '@nestjs/common';
import { DOCUMENT_FONT_FAMILIES, DOCUMENT_FONT_LABELS, DOCUMENT_FONT_SIZES, type DocumentFont, parseDocumentFont } from '@saha/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

/** Thông tin pháp nhân của doanh nghiệp – tự điền khi đánh dấu "Bên nội bộ" trong hợp đồng. */
export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên doanh nghiệp').max(255),
  taxCode: text(20),
  address: text(500),
  email: z.preprocess((v) => (v === '' ? null : v), z.email('Email không hợp lệ').nullable()),
  phone: text(30),
  representative: text(255),
  position: text(255),
  bankAccount: text(255),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

/** Phông chữ văn bản khi xem/in/xuất PDF (Cấu hình → Phông chữ văn bản). */
export const documentFontSchema = z.object({
  family: z.enum(DOCUMENT_FONT_FAMILIES, 'Chọn phông chữ'),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (DOCUMENT_FONT_SIZES as readonly number[]).includes(n), `Cỡ chữ phải là ${DOCUMENT_FONT_SIZES.join(', ')}`),
});

type TenantSettings = { companyProfile?: Partial<CompanyProfile>; documentFont?: unknown } & Record<string, unknown>;

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Hồ sơ đã khai báo; trường chưa khai báo lấy từ thông tin doanh nghiệp lúc đăng ký. */
  async get(user: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const p = ((t.settings ?? {}) as TenantSettings).companyProfile;
    const profile: CompanyProfile = {
      name: p?.name || t.name,
      taxCode: p?.taxCode ?? t.taxCode,
      address: p?.address ?? t.address,
      email: p?.email ?? t.email,
      phone: p?.phone ?? t.phone,
      representative: p?.representative ?? null,
      position: p?.position ?? null,
      bankAccount: p?.bankAccount ?? null,
    };
    return { ...profile, configured: !!p };
  }

  async update(user: AuthUser, input: CompanyProfile) {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
      const settings = { ...((t.settings ?? {}) as TenantSettings), companyProfile: input };
      await tx.tenant.update({ where: { id: user.tenantId }, data: { settings: settings as Prisma.InputJsonValue } });
      await this.audit.log(
        user,
        { action: 'company.update', entityType: 'tenant', entityId: user.tenantId, data: { name: input.name } },
        tx,
      );
    });
    return this.get(user);
  }

  async documentFont(user: AuthUser): Promise<DocumentFont> {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
    return parseDocumentFont(((t.settings ?? {}) as TenantSettings).documentFont);
  }

  async updateDocumentFont(user: AuthUser, input: DocumentFont) {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
      const prev = (t.settings ?? {}) as TenantSettings;
      const before = parseDocumentFont(prev.documentFont);
      await tx.tenant.update({ where: { id: user.tenantId }, data: { settings: { ...prev, documentFont: { ...input } } as unknown as Prisma.InputJsonValue } });
      const label = (f: DocumentFont) => `${DOCUMENT_FONT_LABELS[f.family]} ${f.size}pt`;
      await this.audit.log(user, { action: 'company.document_font', entityType: 'tenant', entityId: user.tenantId, data: { font: `${label(before)} → ${label(input)}` } }, tx);
    });
    return this.documentFont(user);
  }
}
