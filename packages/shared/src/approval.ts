/** Cấu hình một bước trong quy trình phê duyệt (lưu JSON trong ApprovalWorkflow.steps). */
export const APPROVER_TYPES = ['DEPARTMENT_MANAGER', 'ROLE', 'USERS'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  DEPARTMENT_MANAGER: 'Trưởng phòng ban phụ trách hợp đồng',
  ROLE: 'Theo vai trò / chức danh',
  USERS: 'Người dùng chỉ định',
};

export type ApprovalModeValue = 'ALL' | 'ANY';

export const APPROVAL_MODE_LABELS: Record<ApprovalModeValue, string> = {
  ANY: 'Một người duyệt là đủ',
  ALL: 'Tất cả phải duyệt (song song)',
};

export interface ApprovalStepConfig {
  name: string;
  approverType: ApproverType;
  roleId?: string | null;
  userIds?: string[];
  mode: ApprovalModeValue;
  /** Hạn xử lý (giờ) kể từ khi bước bắt đầu; không đặt = không giới hạn. */
  dueHours?: number | null;
}

export const APPROVAL_DECISIONS = ['APPROVE', 'REJECT', 'REQUEST_CHANGES'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
  APPROVE: 'Phê duyệt',
  REJECT: 'Từ chối',
  REQUEST_CHANGES: 'Yêu cầu chỉnh sửa',
};

export const APPROVAL_REQUEST_STATUS_LABELS = {
  PENDING: 'Đang phê duyệt',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Bị từ chối',
  CHANGES_REQUESTED: 'Yêu cầu chỉnh sửa',
  CANCELLED: 'Đã rút lại',
} as const;

export const APPROVAL_TASK_STATUS_LABELS = {
  WAITING: 'Chưa tới lượt',
  PENDING: 'Chờ xử lý',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CHANGES_REQUESTED: 'Yêu cầu sửa',
  SKIPPED: 'Bỏ qua',
} as const;
