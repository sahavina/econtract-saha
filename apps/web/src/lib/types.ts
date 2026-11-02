import type { ContractCategory, ContractStatus, PartnerType, Permission } from '@saha/shared';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  isPlatformAdmin: boolean;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  roles: { code: string; name: string }[];
  tenant: { id: string; code: string; name: string };
  permissions: Permission[];
}

export type ApprovalStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
export type SignatureStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'EXPIRED';
export type Confidentiality = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET';
export type PartyRole = 'PARTY_A' | 'PARTY_B' | 'PARTY_C' | 'RELATED';
export type LegalEntityType = 'ORGANIZATION' | 'INDIVIDUAL';

export type ContractKind = 'CONTRACT' | 'ORDER';

/** Dòng hàng của đơn đặt hàng (số dạng chuỗi Decimal). */
export interface OrderItem {
  id: string;
  productId: string | null;
  sortOrder: number;
  code: string | null;
  name: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  deliveredQty: string;
  note: string | null;
}

export interface ContractListItem {
  id: string;
  code: string;
  title: string;
  kind: ContractKind;
  category: ContractCategory | null;
  vatRate: string | null;
  deliveryDate: string | null;
  parentContract: { id: string; code: string } | null;
  items: Pick<OrderItem, 'quantity' | 'unitPrice' | 'amount' | 'deliveredQty'>[];
  value: string;
  currency: string;
  status: ContractStatus;
  approvalStatus: ApprovalStatus;
  signatureStatus: SignatureStatus;
  createdAt: string;
  signedDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  tags: string[];
  contractType: { id: string; code: string; name: string } | null;
  department: { id: string; name: string } | null;
  owner: { id: string; fullName: string } | null;
  parties: { name: string; partnerId: string | null }[];
  /** Số tài liệu đính kèm (danh sách hợp đồng/đơn). */
  _count?: { documents: number };
}

export interface ContractParty {
  id?: string;
  role: PartyRole;
  partnerId: string | null;
  /** Loại của đối tác trong danh mục (nếu bên đã liên kết). */
  partner?: { type: PartnerType } | null;
  isInternal: boolean;
  entityType: LegalEntityType;
  name: string;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  representative: string | null;
  position: string | null;
  authorizationRef: string | null;
  bankAccount: string | null;
}

export interface ContractDetail extends Omit<ContractListItem, 'parties' | 'items' | 'parentContract' | '_count'> {
  items: OrderItem[];
  parentContract: { id: string; code: string; title: string; signedDate: string | null } | null;
  parentContractId: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  _count?: { orders: number };
  contractTypeId: string | null;
  departmentId: string | null;
  ownerId: string | null;
  group: string | null;
  description: string | null;
  vatRate: string | null;
  expectedSignDate: string | null;
  confidentiality: Confidentiality;
  note: string | null;
  contentHtml: string | null;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  template: { id: string; code: string; name: string; version: number; requiredVariables: string[] } | null;
  templateVersion: number | null;
  department: { id: string; code: string; name: string } | null;
  owner: { id: string; fullName: string; email: string } | null;
  parties: ContractParty[];
}

export interface Lookups {
  contractTypes: { id: string; code: string; name: string; codePattern: string; kind: ContractKind }[];
  departments: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string; email: string }[];
}

export interface Partner {
  id: string;
  code: string;
  shortName: string | null;
  type: PartnerType;
  entityType: LegalEntityType;
  name: string;
  taxCode: string | null;
  idNumber: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  representative: string | null;
  position: string | null;
  /** Liên kết hệ thống ngoài, ví dụ "odoo:1831". */
  externalRef: string | null;
  note: string | null;
  createdAt: string;
  _count?: { contractParties: number };
}

export interface PartnerContact {
  id: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface PartnerDetail extends Partner {
  contacts: PartnerContact[];
}

export interface TimelineEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  entityId?: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardSummary {
  kpis: {
    total: number;
    newThisMonth: number;
    draft: number;
    pendingApproval: number;
    pendingSignature: number;
    signed: number;
    active: number;
    expiringSoon: number;
    overdue: number;
    totalValue: string;
    valueThisMonth: string;
    signSuccessRate: number | null;
  };
  byStatus: { status: ContractStatus; count: number }[];
  monthly: { month: string; count: number; value: number }[];
  expiringContracts: { id: string; code: string; title: string; expiryDate: string; owner: { fullName: string } | null }[];
  recentActivity: TimelineEntry[];
  myApprovals: { id: string; stepName: string; dueAt: string | null; request: { contract: { id: string; code: string; title: string } } }[];
}

export interface ContractDocument {
  id: string;
  kind: 'MAIN' | 'ATTACHMENT';
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  version: number;
  scanStatus: 'NOT_SCANNED' | 'CLEAN' | 'INFECTED';
  createdAt: string;
  uploadedBy: { id: string; fullName: string };
}

export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface TemplateListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: TemplateStatus;
  version: number;
  requiredVariables: string[];
  departmentIds: string[];
  updatedAt: string;
  contractType: { id: string; code: string; name: string } | null;
  createdBy: { id: string; fullName: string };
  _count: { contracts: number };
}

export interface TemplateDetail extends TemplateListItem {
  contractTypeId: string | null;
  contentHtml: string;
  variables: string[];
  versions: { id: string; version: number; createdAt: string; createdBy: { fullName: string } }[];
}

export type ClauseStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

export interface Clause {
  id: string;
  code: string;
  title: string;
  category: import('@saha/shared').ClauseCategory;
  contentHtml: string;
  version: number;
  status: ClauseStatus;
  reviewNote: string | null;
  approvedAt: string | null;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
}

export interface ClauseDetail extends Clause {
  versions: { id: string; version: number; title: string; contentHtml: string; createdAt: string; createdBy: { fullName: string } }[];
}

// ───────── Phê duyệt ─────────

export interface ResolvedStep {
  order: number;
  name: string;
  mode: 'ALL' | 'ANY';
  dueHours: number | null;
  approvers: { id: string; fullName: string }[];
  skipped?: string;
  error?: string;
}

export interface ApprovalPreview {
  canSubmit: boolean;
  issues: string[];
  workflow: { id: string; name: string } | null;
  steps: ResolvedStep[];
}

export type ApprovalTaskStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SKIPPED';
export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'CANCELLED';

export interface ApprovalRequest {
  id: string;
  workflowName: string;
  status: ApprovalRequestStatus;
  currentStep: number;
  totalSteps: number;
  submitNote: string | null;
  submittedAt: string;
  completedAt: string | null;
  submittedBy: { id: string; fullName: string };
  steps: ResolvedStep[];
  tasks: {
    id: string;
    stepOrder: number;
    stepName: string;
    mode: 'ALL' | 'ANY';
    status: ApprovalTaskStatus;
    comment: string | null;
    dueAt: string | null;
    decidedAt: string | null;
    approver: { id: string; fullName: string; jobTitle: string | null };
  }[];
}

export interface MyApprovalTask {
  id: string;
  stepName: string;
  stepOrder: number;
  dueAt: string | null;
  createdAt: string;
  request: {
    id: string;
    workflowName: string;
    totalSteps: number;
    submittedAt: string;
    submittedBy: { fullName: string };
    contract: { id: string; code: string; title: string; value: string; currency: string; department: { name: string } | null };
  };
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  priority: number;
  contractTypeIds: string[];
  minValue: string | null;
  maxValue: string | null;
  steps: import('@saha/shared').ApprovalStepConfig[];
  _count?: { requests: number };
}

export interface WorkflowLookups {
  roles: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string; jobTitle: string | null }[];
  contractTypes: { id: string; name: string }[];
  departments: { id: string; name: string; manager: { id: string; fullName: string } | null }[];
}

// ───────── Ký điện tử ─────────

export type SignerStatus = 'WAITING' | 'PENDING' | 'SIGNED' | 'REJECTED' | 'SKIPPED';
export type SignatureRequestStatus = 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface SignerInfo {
  id: string;
  order: number;
  partyRole: PartyRole | null;
  name: string;
  email: string;
  title: string | null;
  userId: string | null;
  method: 'INTERNAL_PASSWORD' | 'EMAIL_OTP' | 'MISA_ESIGN';
  status: SignerStatus;
  signatureImage: string | null;
  signedAt: string | null;
  signedHash: string | null;
  ip: string | null;
  rejectReason: string | null;
  /** Ký số MISA: mã giao dịch, chứng thư, SHA-256 bản PDF đã ký. */
  evidence?: { transactionId?: string | null; certSubject?: string | null; pdfSha256?: string; documentId?: string } | null;
}

export interface SignatureRequestInfo {
  id: string;
  provider: string;
  status: SignatureRequestStatus;
  signingOrder: 'SEQUENTIAL' | 'PARALLEL';
  message: string | null;
  documentHash: string;
  contentSnapshot: string;
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
  /** Bản PDF ký số (phiên bản mới nhất) khi có người ký MISA eSign. */
  signedDocumentId?: string | null;
  createdBy: { id: string; fullName: string };
  signers: SignerInfo[];
}

export interface SignatureListItem {
  id: string;
  status: SignatureRequestStatus;
  signingOrder: 'SEQUENTIAL' | 'PARALLEL';
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
  createdBy: { fullName: string };
  contract: { id: string; code: string; title: string };
  signers: { id: string; name: string; status: SignerStatus; userId: string | null; order: number }[];
}

export interface PublicSignView {
  organization: string;
  contract: { code: string; title: string };
  request: { status: SignatureRequestStatus; expiresAt: string; documentHash: string; message: string | null; contentSnapshot: string };
  signer: { id: string; name: string; email: string; status: SignerStatus; otpSentAt: string | null };
  signers: { id: string; order: number; name: string; title: string | null; partyRole: PartyRole | null; status: SignerStatus; signedAt: string | null; signatureImage: string | null }[];
  /** Tài liệu đính kèm đã đóng băng khi gửi ký. */
  documents: PublicSignDocument[];
}

export interface PublicSignDocument {
  id: string;
  fileName: string;
  version: number;
  size: number;
  mimeType: string;
  sha256: string;
}

// ───────── Quản trị ─────────

export type UserStatus = 'ACTIVE' | 'INVITED' | 'LOCKED' | 'DISABLED';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  departmentId: string | null;
  branchId: string | null;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  roles: { id: string; code: string; name: string }[];
}

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  locked: boolean;
  permissions: string[];
  _count: { users: number };
}

export interface AdminDepartment {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  branchId: string | null;
  parentId: string | null;
  managerId: string | null;
  branch: { id: string; name: string } | null;
  parent: { id: string; name: string } | null;
  manager: { id: string; fullName: string } | null;
  _count: { users: number; contracts: number };
}

export interface AdminBranch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  _count: { departments: number; users: number };
}

export interface AdminContractType {
  id: string;
  code: string;
  name: string;
  codePattern: string;
  kind: ContractKind;
  isActive: boolean;
  example: string;
  _count: { contracts: number };
}

// ───────── Vòng đời ─────────

export interface Appendix {
  id: string;
  seq: number;
  code: string;
  title: string;
  kind: 'AMENDMENT' | 'EXTENSION' | 'OTHER';
  contentHtml: string | null;
  valueChange: string | null;
  newExpiryDate: string | null;
  effectiveDate: string | null;
  status: 'DRAFT' | 'EFFECTIVE' | 'CANCELLED';
  appliedAt: string | null;
  createdAt: string;
}

export interface Obligation {
  id: string;
  title: string;
  description: string | null;
  partyRole: PartyRole | null;
  assigneeId: string | null;
  assignee: { id: string; fullName: string } | null;
  dueDate: string | null;
  progress: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  completedAt: string | null;
  overdue: boolean;
}

export interface Payment {
  id: string;
  seq: number;
  title: string;
  amount: string;
  dueDate: string | null;
  paidAmount: string;
  paidDate: string | null;
  invoiceNo: string | null;
  status: 'PLANNED' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  note: string | null;
  overdue: boolean;
}

/** Đợt thanh toán trong danh sách `/lifecycle?kind=payments` (không kèm cờ overdue). */
export interface PaymentListItem extends Omit<Payment, 'overdue'> {
  contract: { id: string; code: string; title: string; currency: string };
}

export interface Acceptance {
  id: string;
  title: string;
  acceptedDate: string;
  result: 'PASSED' | 'CONDITIONAL' | 'FAILED';
  note: string | null;
}

export interface LifecycleOverview {
  contract: { id: string; code: string; status: ContractStatus; value: string; currency: string; expiryDate: string | null; liquidatedAt: string | null; liquidationNote: string | null };
  appendices: Appendix[];
  obligations: Obligation[];
  payments: Payment[];
  acceptances: Acceptance[];
  summary: {
    scheduled: string;
    paid: string;
    remaining: string;
    scheduleMismatch: boolean;
    overduePayments: number;
    progress: number | null;
    openObligations: number;
    overdueObligations: number;
  };
}

export interface CalendarEvent {
  date: string;
  type: 'EXPIRY' | 'EFFECTIVE' | 'PAYMENT' | 'OBLIGATION';
  title: string;
  contractId: string;
  contractCode: string;
  done: boolean;
}

// ───────── Thông báo & báo cáo ─────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface ReportGroup {
  name: string;
  count: number;
  value: string;
}

export interface ReportSummary {
  totals: { count: number; value: string; avgApprovalHours: number | null; avgSigningHours: number | null; signSuccessRate: number | null };
  byStatus: { status: ContractStatus; count: number; value: string }[];
  byDepartment: (ReportGroup & { id: string | null; signedCount: number; signedValue: string; avgApprovalHours: number | null; avgSigningHours: number | null })[];
  byType: (ReportGroup & { id: string | null })[];
  byOwner: (ReportGroup & { id: string | null })[];
  byPartner: ReportGroup[];
  payments: { scheduled: string; collected: string; overdueCount: number; overdueAmount: string };
}

// ───────── Khách hàng xem trước & góp ý ─────────

export type ShareLinkState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type FeedbackKind = 'CHANGE_REQUEST' | 'AGREE';
export type FeedbackStatus = 'NEW' | 'RESOLVED';

export interface ShareLink {
  id: string;
  recipientName: string | null;
  recipientEmail: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  createdByName: string;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  state: ShareLinkState;
  feedbackCount: number;
}

export interface ContractFeedbackItem {
  id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  name: string;
  contact: string;
  clauseRef: string | null;
  message: string | null;
  revisionSeq: number | null;
  response: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** Nội dung hợp đồng đã thay đổi so với bản khách xem. */
  outdated: boolean;
  link: { id: string; recipientName: string | null; recipientEmail: string | null };
}

export interface PreviewVersion {
  seq: number | null;
  hash: string;
}

export interface PublicPreviewView {
  organization: string;
  link: { recipientName: string | null; expiresAt: string };
  acceptsFeedback: boolean;
  contract: {
    code: string;
    title: string;
    contractType: string | null;
    value: string;
    currency: string;
    vatRate: string | null;
    expectedSignDate: string | null;
    effectiveDate: string | null;
    expiryDate: string | null;
  };
  parties: {
    role: PartyRole;
    isInternal: boolean;
    entityType: string;
    name: string;
    taxCode: string | null;
    address: string | null;
    representative: string | null;
    position: string | null;
    authorizationRef: string | null;
    phone: string | null;
    email: string | null;
    bankAccount: string | null;
  }[];
  contentHtml: string;
  version: PreviewVersion;
  feedback: {
    id: string;
    kind: FeedbackKind;
    status: FeedbackStatus;
    name: string;
    clauseRef: string | null;
    message: string | null;
    response: string | null;
    revisionSeq: number | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
}

// ───────── Đơn đặt hàng ─────────

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  unitPrice: string;
  vatRate: string | null;
  description: string | null;
  isActive: boolean;
}

export interface OrderSummary {
  count: number;
  signed: number;
  value: string;
  deliveredValue: string;
  remainingValue: string;
  byFulfillment: { NONE: number; PARTIAL: number; DONE: number };
}

// ───────── Kho & giao hàng ─────────

export type StockIssueStatus = 'ISSUED' | 'CANCELLED';

export interface StockIssueListItem {
  id: string;
  code: string;
  issueDate: string;
  receiverName: string;
  receiverUnit: string | null;
  reason: string | null;
  warehouse: string | null;
  status: StockIssueStatus;
  totalAmount: string;
  createdAt: string;
  order: { id: string; code: string } | null;
  createdBy: { id: string; fullName: string };
  _count: { items: number; shippingNotes: number };
}

export interface StockIssueItem {
  id: string;
  productId: string | null;
  orderItemId: string | null;
  code: string | null;
  name: string;
  unit: string | null;
  requestedQty: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

export interface StockIssueDetail extends Omit<StockIssueListItem, 'order' | '_count'> {
  orderId: string | null;
  receiverAddress: string | null;
  warehouseAddress: string | null;
  debitAccount: string | null;
  creditAccount: string | null;
  attachments: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: StockIssueItem[];
  order: { id: string; code: string; title: string } | null;
  shippingNotes: { id: string; code: string; status: import('@saha/shared').ShippingNoteStatus; sendDate: string }[];
}

export interface ShippingNoteListItem {
  id: string;
  code: string;
  sendDate: string;
  toCompany: string;
  toAddress: string;
  toPhones: string | null;
  boxes: number;
  carrier: string | null;
  vehicle: string | null;
  trackingNo: string | null;
  freight: string | null;
  status: import('@saha/shared').ShippingNoteStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  order: { id: string; code: string } | null;
  stockIssue: { id: string; code: string } | null;
  createdBy: { id: string; fullName: string };
}

export interface ShippingNoteDetail extends ShippingNoteListItem {
  orderId: string | null;
  stockIssueId: string | null;
  fromContact: string | null;
  fromPhone: string | null;
  fromCompany: string | null;
  fromAddress: string | null;
  warning: string | null;
  toContact: string | null;
  footNote: string | null;
  showBoxNumber: boolean;
  layout: 'A4' | 'A5x2';
  carrierPhone: string | null;
  freightPayer: import('@saha/shared').FreightPayer | null;
  note: string | null;
}

export interface PaymentRequestListItem {
  id: string;
  number: string;
  date: string;
  recipient: string;
  basis: string | null;
  amount: string;
  status: import('@saha/shared').PaymentRequestStatus;
  createdAt: string;
  contract: { id: string; code: string; kind: ContractKind } | null;
  createdBy: { id: string; fullName: string };
}

export interface PaymentRequestDetail extends PaymentRequestListItem {
  place: string | null;
  company: string;
  beneficiary: string;
  account: string | null;
  accountHolder: string | null;
  signerPosition: string | null;
  signerName: string | null;
  contractId: string | null;
  templateId: string | null;
}
