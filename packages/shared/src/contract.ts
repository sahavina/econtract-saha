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
