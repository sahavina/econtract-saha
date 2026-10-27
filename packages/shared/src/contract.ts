export const CONTRACT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PENDING_SIGNATURE',
  'SIGNED',
  'ACTIVE',
  'EXPIRED',
  'LIQUIDATED',
  'CANCELLED',
  'ARCHIVED',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  PENDING_SIGNATURE: 'Chờ ký',
  SIGNED: 'Đã ký',
  ACTIVE: 'Đang hiệu lực',
  EXPIRED: 'Hết hiệu lực',
  LIQUIDATED: 'Đã thanh lý',
  CANCELLED: 'Đã hủy',
  ARCHIVED: 'Đã lưu trữ',
};

export const PARTNER_TYPES = ['CUSTOMER', 'SUPPLIER', 'BOTH', 'OTHER'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  CUSTOMER: 'Khách hàng',
  SUPPLIER: 'Nhà cung cấp',
  BOTH: 'Khách hàng & Nhà cung cấp',
  OTHER: 'Đối tác khác',
};

/** Phân loại hợp đồng theo đối tượng: bán cho khách hàng, mua của nhà cung cấp, hợp đồng lao động với nhân sự. */
export const CONTRACT_CATEGORIES = ['CUSTOMER', 'SUPPLIER', 'LABOR', 'OTHER'] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];
export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  CUSTOMER: 'Hợp đồng khách hàng',
  SUPPLIER: 'Hợp đồng nhà cung cấp',
  LABOR: 'Hợp đồng lao động',
  OTHER: 'Hợp đồng khác',
};
/** Nhãn ngắn cho cột/bộ lọc. */
export const CONTRACT_CATEGORY_SHORT: Record<ContractCategory, string> = {
  CUSTOMER: 'Khách hàng',
  SUPPLIER: 'Nhà cung cấp',
  LABOR: 'Lao động',
  OTHER: 'Khác',
};

/**
 * Suy phân loại khi người dùng không chọn: đơn đặt hàng là bán hàng; loại hợp đồng có chữ "lao động";
 * còn lại theo phân loại đối tác (khách hàng/nhà cung cấp) của bên đối tác đầu tiên đã phân loại.
 */
export function inferContractCategory(input: { kind?: string | null; typeName?: string | null; partyTypes: (string | null | undefined)[] }): ContractCategory | null {
  if (input.kind === 'ORDER') return 'CUSTOMER';
  if (input.typeName && /lao động/i.test(input.typeName)) return 'LABOR';
  const t = input.partyTypes.find((x) => x === 'CUSTOMER' || x === 'SUPPLIER');
  return (t as ContractCategory | undefined) ?? null;
}

/** Phân loại bên đối tác khi lập hợp đồng (SAHA bán ⇒ khách hàng, SAHA mua ⇒ nhà cung cấp). */
export type PartyPartnerType = 'CUSTOMER' | 'SUPPLIER';

/**
 * Gộp loại đối tác: đã là khách hàng nay có hợp đồng mua vào (hoặc ngược lại) ⇒ "Khách hàng & Nhà cung cấp";
 * "Đối tác khác" ⇒ lấy loại mới.
 */
export function mergePartnerType(current: PartnerType, wanted: PartyPartnerType): PartnerType {
  if (current === wanted || current === 'BOTH') return current;
  if (current === 'OTHER') return wanted;
  return 'BOTH';
}

/** Lọc danh sách theo loại: "Khách hàng"/"Nhà cung cấp" gồm cả đối tác vừa là khách hàng vừa là nhà cung cấp. */
export function partnerTypeFilter(type: PartnerType | undefined): PartnerType[] | undefined {
  if (!type) return undefined;
  return type === 'CUSTOMER' || type === 'SUPPLIER' ? [type, 'BOTH'] : [type];
}

/** Số ngày trước ngày hết hạn để coi là "sắp hết hạn". */
export const EXPIRING_SOON_DAYS = 30;
