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

export const PARTNER_TYPES = ['CUSTOMER', 'SUPPLIER', 'OTHER'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  CUSTOMER: 'Khách hàng',
  SUPPLIER: 'Nhà cung cấp',
  OTHER: 'Đối tác khác',
};

/** Số ngày trước ngày hết hạn để coi là "sắp hết hạn". */
export const EXPIRING_SOON_DAYS = 30;
