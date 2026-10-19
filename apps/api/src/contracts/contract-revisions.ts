import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Hai lần sửa của cùng một người cách nhau dưới khoảng này được gộp vào một phiên bản (nội dung tự lưu liên tục). */
export const REVISION_SESSION_MS = 15 * 60 * 1000;

/** Một thay đổi hiển thị cho người dùng: giá trị cũ → mới (đã định dạng sẵn, null = trống). */
export interface RevisionChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

const ROLE_LABELS: Record<string, string> = { PARTY_A: 'Bên A', PARTY_B: 'Bên B', PARTY_C: 'Bên C', RELATED: 'Bên liên quan' };
const CONFIDENTIALITY: Record<string, string> = { PUBLIC: 'Công khai', INTERNAL: 'Nội bộ', CONFIDENTIAL: 'Mật', SECRET: 'Tối mật' };

/** Trường thông tin chung được theo dõi (thứ tự hiển thị). */
const FIELDS: [key: keyof ContractSnapshot, label: string][] = [
  ['code', 'Mã hợp đồng'],
  ['title', 'Tên hợp đồng'],
  ['contractType', 'Loại hợp đồng'],
  ['group', 'Nhóm hợp đồng'],
  ['value', 'Giá trị hợp đồng'],
  ['currency', 'Tiền tệ'],
  ['vatRate', 'Thuế VAT (%)'],
  ['expectedSignDate', 'Ngày dự kiến ký'],
  ['effectiveDate', 'Ngày hiệu lực'],
  ['expiryDate', 'Ngày hết hạn'],
  ['department', 'Phòng ban phụ trách'],
  ['owner', 'Nhân viên phụ trách'],
  ['confidentiality', 'Mức độ bảo mật'],
  ['tags', 'Tags'],
  ['description', 'Mô tả'],
  ['note', 'Ghi chú'],
];

const PARTY_FIELDS: [key: keyof PartySnapshot, label: string][] = [
  ['name', 'Tên'],
  ['isInternal', 'Bên nội bộ'],
  ['taxCode', 'Mã số thuế'],
  ['address', 'Địa chỉ'],
  ['email', 'Email'],
  ['phone', 'Điện thoại'],
  ['representative', 'Người đại diện'],
  ['position', 'Chức vụ'],
  ['authorizationRef', 'Căn cứ đại diện'],
  ['bankAccount', 'Số tài khoản'],
];

export interface PartySnapshot {
  role: string;
  name: string | null;
  isInternal: string | null;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  representative: string | null;
  position: string | null;
  authorizationRef: string | null;
  bankAccount: string | null;
}

export interface ContractSnapshot {
  /** Không có trong phiên bản lưu trước khi cho sửa mã ⇒ tùy chọn. */
  code?: string | null;
  title: string | null;
  contractType: string | null;
  group: string | null;
  value: string | null;
  currency: string | null;
  vatRate: string | null;
  expectedSignDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  department: string | null;
  owner: string | null;
  confidentiality: string | null;
  tags: string | null;
  description: string | null;
  note: string | null;
  parties: PartySnapshot[];
}

/** Dữ liệu hợp đồng tối thiểu để chụp trạng thái (khớp kết quả ContractsService.get). */
export interface SnapshotSource {
  code: string;
  title: string;
  group: string | null;
  value: { toString(): string };
  currency: string;
  vatRate: { toString(): string } | null;
  expectedSignDate: Date | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  confidentiality: string;
  tags: string[];
  description: string | null;
  note: string | null;
  contractType: { name: string } | null;
  department: { name: string } | null;
  owner: { fullName: string } | null;
  parties: {
    role: string;
    name: string;
    isInternal: boolean;
    taxCode: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    representative: string | null;
    position: string | null;
    authorizationRef: string | null;
    bankAccount: string | null;
  }[];
}

const txt = (v: string | null | undefined) => (v === null || v === undefined || v.trim() === '' ? null : v.trim());
const pad = (n: number) => String(n).padStart(2, '0');
/** Ngày @db.Date lưu nửa đêm UTC ⇒ định dạng theo UTC. */
const day = (d: Date | null) => (d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : null);
const num = (v: { toString(): string } | null) => {
  if (v === null) return null;
  const [int, frac] = v.toString().split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac && Number(frac) !== 0 ? `${grouped},${frac.replace(/0+$/, '')}` : grouped;
};

export function snapshotOf(c: SnapshotSource): ContractSnapshot {
  return {
    code: txt(c.code),
    title: txt(c.title),
    contractType: c.contractType?.name ?? null,
    group: txt(c.group),
    value: num(c.value),
    currency: c.currency,
    vatRate: num(c.vatRate),
    expectedSignDate: day(c.expectedSignDate),
    effectiveDate: day(c.effectiveDate),
    expiryDate: day(c.expiryDate),
    department: c.department?.name ?? null,
    owner: c.owner?.fullName ?? null,
    confidentiality: CONFIDENTIALITY[c.confidentiality] ?? c.confidentiality,
    tags: c.tags.length ? c.tags.join(', ') : null,
    description: txt(c.description),
    note: txt(c.note),
    parties: c.parties.map((p) => ({
      role: p.role,
      name: txt(p.name),
      isInternal: p.isInternal ? 'Có' : null,
      taxCode: txt(p.taxCode),
      address: txt(p.address),
      email: txt(p.email),
      phone: txt(p.phone),
      representative: txt(p.representative),
      position: txt(p.position),
      authorizationRef: txt(p.authorizationRef),
      bankAccount: txt(p.bankAccount),
    })),
  };
}

/** Ghép các bên theo vai trò + thứ tự trong cùng vai trò ("Bên liên quan 2"). */
function partyKeys(parties: PartySnapshot[]) {
  const seen: Record<string, number> = {};
  return parties.map((p) => {
    seen[p.role] = (seen[p.role] ?? 0) + 1;
    const n = seen[p.role];
    const label = `${ROLE_LABELS[p.role] ?? p.role}${n > 1 ? ` ${n}` : ''}`;
    return { key: `${p.role}#${n}`, label, party: p };
  });
}

export function diffSnapshots(a: ContractSnapshot, b: ContractSnapshot): RevisionChange[] {
  const out: RevisionChange[] = [];
  for (const [key, label] of FIELDS) {
    const before = (a[key] ?? null) as string | null;
    const after = (b[key] ?? null) as string | null;
    if (before !== after) out.push({ field: key, label, before, after });
  }
  const pa = new Map(partyKeys(a.parties).map((x) => [x.key, x]));
  const pb = new Map(partyKeys(b.parties).map((x) => [x.key, x]));
  for (const key of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(key);
    const y = pb.get(key);
    const label = (y ?? x)!.label;
    if (!x || !y) {
      out.push({ field: `party.${key}`, label: `${label} (${x ? 'xóa bên' : 'thêm bên'})`, before: x?.party.name ?? null, after: y?.party.name ?? null });
      continue;
    }
    for (const [f, fl] of PARTY_FIELDS) {
      if (x.party[f] !== y.party[f]) out.push({ field: `party.${key}.${f}`, label: `${label} – ${fl}`, before: x.party[f], after: y.party[f] });
    }
  }
  return out;
}

/** Gộp thay đổi trong cùng phiên: giữ giá trị "cũ" đầu tiên, "mới" sau cùng; bỏ trường đã đổi rồi đổi lại như cũ. */
export function mergeChanges(prev: RevisionChange[], next: RevisionChange[]): RevisionChange[] {
  const map = new Map(prev.map((c) => [c.field, { ...c }]));
  for (const c of next) {
    const p = map.get(c.field);
    if (p) p.after = c.after;
    else map.set(c.field, { ...c });
  }
  return [...map.values()].filter((c) => c.before !== c.after);
}

type Tx = Prisma.TransactionClient;

export interface RecordInput {
  contractId: string;
  tenantId: string;
  before: ContractSnapshot;
  after: ContractSnapshot;
  /** Nội dung trước/sau khi lưu (đã làm sạch). */
  contentBefore: string | null;
  contentAfter: string | null;
  /** Người tạo + thời điểm tạo hợp đồng – dùng làm phiên bản gốc cho hợp đồng chưa có lịch sử. */
  baseline: { authorId: string | null; authorName: string | null; at: Date };
  restoredFromSeq?: number;
  now?: Date;
}

@Injectable()
export class ContractRevisionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Phiên bản đầu tiên khi tạo hợp đồng. */
  async recordCreate(tx: Tx, user: AuthUser, contractId: string, contentHtml: string | null) {
    await tx.contractRevision.create({
      data: {
        tenantId: user.tenantId,
        contractId,
        seq: 1,
        kind: 'CREATE',
        authorId: user.userId,
        authorName: user.fullName,
        contentHtml: contentHtml ?? '',
      },
    });
  }

  /**
   * Ghi một lần sửa: không có gì thay đổi ⇒ bỏ qua; cùng người sửa tiếp trong 15 phút ⇒ gộp vào phiên bản đang mở;
   * khôi phục phiên bản luôn tạo phiên bản riêng. Trả về số phiên bản (hoặc null nếu không ghi).
   */
  async recordEdit(tx: Tx, user: AuthUser, input: RecordInput): Promise<number | null> {
    const changes = diffSnapshots(input.before, input.after);
    const contentChanged = (input.contentBefore ?? '') !== (input.contentAfter ?? '');
    if (!changes.length && !contentChanged) return null;
    const now = input.now ?? new Date();
    const restore = input.restoredFromSeq !== undefined;

    let last = await tx.contractRevision.findFirst({ where: { contractId: input.contractId }, orderBy: { seq: 'desc' } });
    if (!last) {
      // Hợp đồng tạo trước khi có lịch sử: chụp trạng thái trước lần sửa này làm phiên bản gốc.
      last = await tx.contractRevision.create({
        data: {
          tenantId: input.tenantId,
          contractId: input.contractId,
          seq: 1,
          kind: 'BASELINE',
          authorId: input.baseline.authorId,
          authorName: input.baseline.authorName,
          contentHtml: input.contentBefore ?? '',
          startedAt: input.baseline.at,
        },
      });
    }

    const sameSession =
      !restore &&
      last.kind === 'EDIT' &&
      last.authorId === user.userId &&
      now.getTime() - last.updatedAt.getTime() < REVISION_SESSION_MS;
    if (sameSession) {
      await tx.contractRevision.update({
        where: { id: last.id },
        data: {
          changes: mergeChanges(last.changes as unknown as RevisionChange[], changes) as unknown as Prisma.InputJsonValue,
          ...(contentChanged && { contentHtml: input.contentAfter ?? '' }),
        },
      });
      return last.seq;
    }
    const seq = last.seq + 1;
    await tx.contractRevision.create({
      data: {
        tenantId: input.tenantId,
        contractId: input.contractId,
        seq,
        kind: restore ? 'RESTORE' : 'EDIT',
        authorId: user.userId,
        authorName: user.fullName,
        changes: changes as unknown as Prisma.InputJsonValue,
        contentHtml: contentChanged ? (input.contentAfter ?? '') : null,
        restoredFromSeq: input.restoredFromSeq ?? null,
        startedAt: now,
      },
    });
    return seq;
  }

  /** Danh sách phiên bản (mới nhất trước), không kèm nội dung. */
  async list(tenantId: string, contractId: string) {
    const rows = await this.prisma.contractRevision.findMany({
      where: { tenantId, contractId },
      orderBy: { seq: 'desc' },
      select: {
        seq: true,
        kind: true,
        authorName: true,
        changes: true,
        restoredFromSeq: true,
        startedAt: true,
        updatedAt: true,
        contentHtml: true,
      },
    });
    return rows.map(({ contentHtml, ...r }) => ({ ...r, contentChanged: contentHtml !== null }));
  }

  /** Nội dung hợp đồng tại phiên bản seq = ảnh chụp nội dung gần nhất tính đến phiên bản đó. */
  async contentAt(tenantId: string, contractId: string, seq: number) {
    const exists = await this.prisma.contractRevision.findFirst({ where: { tenantId, contractId, seq }, select: { seq: true } });
    if (!exists) throw new NotFoundException('Không tìm thấy phiên bản');
    const snap = await this.prisma.contractRevision.findFirst({
      where: { tenantId, contractId, seq: { lte: seq }, contentHtml: { not: null } },
      orderBy: { seq: 'desc' },
      select: { seq: true, contentHtml: true },
    });
    if (!snap) throw new BadRequestException('Phiên bản này không có ảnh chụp nội dung');
    return { seq, contentSeq: snap.seq, contentHtml: snap.contentHtml ?? '' };
  }
}
