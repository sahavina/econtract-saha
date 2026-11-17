/** Yêu cầu kiểm tra hợp đồng/đơn hàng: giao cho người phụ trách, xử lý trên trang hàng chờ, in phiếu kèm QR. */
export const INSPECTION_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'ISSUE', 'CANCELLED'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang kiểm tra',
  DONE: 'Đạt – hoàn tất',
  ISSUE: 'Có vấn đề',
  CANCELLED: 'Đã hủy',
};

/** Cột trên trang hàng chờ (đã hủy không hiện trên bảng). */
export const INSPECTION_BOARD: InspectionStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE', 'ISSUE'];

/** Kết quả kiểm tra từng dòng hàng. */
export interface InspectionItemResult {
  itemId: string;
  /** true = đạt, false = không đạt, null = chưa kiểm. */
  ok: boolean | null;
  note?: string | null;
}

export const DEFAULT_INSPECTION_CODE_PATTERN = 'KT-{YYYY}-{SEQUENCE:4}';
