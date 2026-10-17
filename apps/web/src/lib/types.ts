import type { ContractStatus, PartnerType, Permission } from '@saha/shared';

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

export interface ContractListItem {
  id: string;
  code: string;
  title: string;
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
}

export interface ContractParty {
  id?: string;
  role: PartyRole;
  partnerId: string | null;
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
}

export interface ContractDetail extends Omit<ContractListItem, 'parties'> {
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
  department: { id: string; code: string; name: string } | null;
  owner: { id: string; fullName: string; email: string } | null;
  parties: ContractParty[];
}

export interface Lookups {
  contractTypes: { id: string; code: string; name: string; codePattern: string }[];
  departments: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string; email: string }[];
}

export interface Partner {
  id: string;
  code: string;
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
  note: string | null;
  createdAt: string;
  _count?: { contractParties: number };
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
