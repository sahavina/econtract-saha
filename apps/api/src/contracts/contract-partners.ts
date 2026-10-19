import { mergePartnerType, partnerAbbreviation, type PartyPartnerType } from '@saha/shared';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PartyInput } from './contracts.schemas.js';

type Tx = Prisma.TransactionClient;

const CODE_PREFIX: Record<PartyPartnerType, string> = { CUSTOMER: 'KH', SUPPLIER: 'NCC' };
const normTax = (v: string | null | undefined) => v?.replace(/\s+/g, '') || null;

/** Mã đối tác mới: KH0001 / NCC0001… (bộ đếm riêng theo tiền tố, bỏ qua mã đã tồn tại). */
async function nextPartnerCode(tx: Tx, tenantId: string, type: PartyPartnerType) {
  const prefix = CODE_PREFIX[type];
  for (let i = 0; i < 50; i++) {
    const rows = await tx.$queryRaw<{ current: number }[]>`
      INSERT INTO "NumberSequence" ("tenantId", "key", "current", "updatedAt")
      VALUES (${tenantId}::uuid, ${`partner:${prefix}`}, 1, now())
      ON CONFLICT ("tenantId", "key") DO UPDATE SET "current" = "NumberSequence"."current" + 1, "updatedAt" = now()
      RETURNING "current"`;
    const code = `${prefix}${String(rows[0].current).padStart(4, '0')}`;
    if (!(await tx.partner.count({ where: { tenantId, code } }))) return code;
  }
  throw new Error('Không sinh được mã đối tác');
}

/**
 * Lưu các bên đối tác (không phải nội bộ, đã chọn Khách hàng/Nhà cung cấp) vào danh mục Đối tác khi lưu hợp đồng:
 * - đã liên kết đối tác ⇒ cập nhật loại (gộp thành "Khách hàng & Nhà cung cấp" nếu khác);
 * - chưa liên kết ⇒ tìm theo MST (không có MST thì theo tên) để liên kết, không thấy thì tạo đối tác mới.
 * Trả về danh sách bên đã gắn partnerId, bỏ trường partnerType (không lưu trên bên tham gia).
 */
export async function syncPartyPartners(tx: Tx, user: AuthUser, audit: AuditService, parties: PartyInput[]) {
  const tenantId = user.tenantId;
  const out: Omit<PartyInput, 'partnerType'>[] = [];
  for (const { partnerType, ...party } of parties) {
    if (!partnerType || party.isInternal || !party.name.trim()) {
      out.push(party);
      continue;
    }
    let partner = party.partnerId
      ? await tx.partner.findFirst({ where: { id: party.partnerId, tenantId, deletedAt: null } })
      : null;
    if (!partner) {
      const tax = normTax(party.taxCode);
      partner = tax
        ? await tx.partner.findFirst({ where: { tenantId, deletedAt: null, taxCode: tax } })
        : await tx.partner.findFirst({ where: { tenantId, deletedAt: null, name: { equals: party.name.trim(), mode: 'insensitive' } } });
    }
    if (partner) {
      const type = mergePartnerType(partner.type, partnerType);
      if (type !== partner.type) {
        await tx.partner.update({ where: { id: partner.id }, data: { type } });
        await audit.log(
          user,
          { action: 'partner.update', entityType: 'partner', entityId: partner.id, data: { changes: ['type'], type, source: 'contract' } },
          tx,
        );
      }
    } else {
      const code = await nextPartnerCode(tx, tenantId, partnerType);
      partner = await tx.partner.create({
        data: {
          tenantId,
          code,
          type: partnerType,
          entityType: party.entityType ?? 'ORGANIZATION',
          name: party.name.trim(),
          shortName: partnerAbbreviation(party.name),
          taxCode: normTax(party.taxCode),
          address: party.address ?? null,
          email: party.email ?? null,
          phone: party.phone ?? null,
          representative: party.representative ?? null,
          position: party.position ?? null,
        },
      });
      await audit.log(
        user,
        { action: 'partner.create', entityType: 'partner', entityId: partner.id, data: { code, name: partner.name, source: 'contract' } },
        tx,
      );
    }
    out.push({ ...party, partnerId: partner.id });
  }
  return out;
}
