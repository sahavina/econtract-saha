import { vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import {
  ContractRevisionsService,
  type ContractSnapshot,
  diffSnapshots,
  mergeChanges,
  REVISION_SESSION_MS,
  snapshotOf,
  type SnapshotSource,
} from './contract-revisions.js';

const party = (role: string, name: string, extra: Partial<SnapshotSource['parties'][number]> = {}) => ({
  role,
  name,
  isInternal: false,
  taxCode: null,
  address: null,
  email: null,
  phone: null,
  representative: null,
  position: null,
  authorizationRef: null,
  bankAccount: null,
  ...extra,
});

const base: SnapshotSource = {
  code: 'HD-2026-00001',
  title: 'HĐMB keo',
  group: null,
  value: { toString: () => '26400000' },
  currency: 'VND',
  vatRate: { toString: () => '8' },
  expectedSignDate: new Date('2026-10-15T00:00:00Z'),
  effectiveDate: null,
  expiryDate: null,
  confidentiality: 'INTERNAL',
  tags: [],
  description: null,
  note: null,
  contractType: { name: 'Hợp đồng mua bán' },
  department: { name: 'Phòng Kinh doanh' },
  owner: { fullName: 'Trần Văn Kinh Doanh' },
  parties: [party('PARTY_A', 'Thuận Nhật'), party('PARTY_B', 'SAHA', { isInternal: true })],
};

describe('diffSnapshots', () => {
  it('reports formatted old → new values for general fields and parties', () => {
    const after = snapshotOf({
      ...base,
      value: { toString: () => '28512000.50' },
      expectedSignDate: new Date('2026-10-20T00:00:00Z'),
      owner: { fullName: 'Lê Văn Trưởng Phòng' },
      parties: [party('PARTY_A', 'Thuận Nhật', { bankAccount: '153629529 ACB' }), party('PARTY_B', 'SAHA', { isInternal: true })],
    });
    expect(diffSnapshots(snapshotOf(base), after)).toEqual([
      { field: 'value', label: 'Giá trị hợp đồng', before: '26.400.000', after: '28.512.000,5' },
      { field: 'expectedSignDate', label: 'Ngày dự kiến ký', before: '15/10/2026', after: '20/10/2026' },
      { field: 'owner', label: 'Nhân viên phụ trách', before: 'Trần Văn Kinh Doanh', after: 'Lê Văn Trưởng Phòng' },
      { field: 'party.PARTY_A#1.bankAccount', label: 'Bên A – Số tài khoản', before: null, after: '153629529 ACB' },
    ]);
  });

  it('reports added and removed parties', () => {
    const after = snapshotOf({ ...base, parties: [party('PARTY_A', 'Thuận Nhật'), party('PARTY_C', 'Vận tải X')] });
    expect(diffSnapshots(snapshotOf(base), after)).toEqual([
      { field: 'party.PARTY_B#1', label: 'Bên B (xóa bên)', before: 'SAHA', after: null },
      { field: 'party.PARTY_C#1', label: 'Bên C (thêm bên)', before: null, after: 'Vận tải X' },
    ]);
  });

  it('ignores whitespace-only differences', () => {
    expect(diffSnapshots(snapshotOf(base), snapshotOf({ ...base, title: '  HĐMB keo ', note: '   ' }))).toEqual([]);
  });
});

describe('mergeChanges', () => {
  it('keeps the first old value and the last new value, dropping changes reverted in the same session', () => {
    const merged = mergeChanges(
      [
        { field: 'title', label: 'Tên', before: 'A', after: 'B' },
        { field: 'note', label: 'Ghi chú', before: null, after: 'x' },
      ],
      [
        { field: 'title', label: 'Tên', before: 'B', after: 'C' },
        { field: 'note', label: 'Ghi chú', before: 'x', after: null },
      ],
    );
    expect(merged).toEqual([{ field: 'title', label: 'Tên', before: 'A', after: 'C' }]);
  });
});

describe('ContractRevisionsService.recordEdit', () => {
  const user = { tenantId: 't1', userId: 'u1', fullName: 'Admin' } as AuthUser;
  const snap = snapshotOf(base);
  const changed: ContractSnapshot = { ...snap, title: 'HĐMB keo (sửa)' };
  const input = (over: Record<string, unknown> = {}) => ({
    contractId: 'c1',
    tenantId: 't1',
    before: snap,
    after: changed,
    contentBefore: '<p>a</p>',
    contentAfter: '<p>b</p>',
    baseline: { authorId: 'u0', authorName: 'Người tạo', at: new Date('2026-10-01T00:00:00Z') },
    now: new Date('2026-10-19T03:00:00Z'),
    ...over,
  });
  const setup = (last: Record<string, unknown> | null) => {
    const tx = {
      contractRevision: {
        findFirst: vi.fn().mockResolvedValue(last),
        create: vi.fn((a: { data: Record<string, unknown> }) => Promise.resolve({ ...a.data, updatedAt: new Date() })),
        update: vi.fn(),
      },
    };
    return { svc: new ContractRevisionsService({} as never), tx };
  };

  it('does nothing when nothing changed (autosave of identical content)', async () => {
    const { svc, tx } = setup(null);
    expect(await svc.recordEdit(tx as never, user, input({ after: snap, contentAfter: '<p>a</p>' }))).toBeNull();
    expect(tx.contractRevision.create).not.toHaveBeenCalled();
  });

  it('creates a baseline from the pre-edit state for contracts without history, then version 2', async () => {
    const { svc, tx } = setup(null);
    expect(await svc.recordEdit(tx as never, user, input())).toBe(2);
    const [baseline, edit] = tx.contractRevision.create.mock.calls.map((c) => c[0].data);
    expect(baseline).toMatchObject({ seq: 1, kind: 'BASELINE', authorName: 'Người tạo', contentHtml: '<p>a</p>' });
    expect(edit).toMatchObject({ seq: 2, kind: 'EDIT', authorId: 'u1', contentHtml: '<p>b</p>' });
  });

  it('merges into the open session of the same author within 15 minutes', async () => {
    const last = { id: 'r3', seq: 3, kind: 'EDIT', authorId: 'u1', updatedAt: new Date(input().now.getTime() - REVISION_SESSION_MS + 60_000), changes: [] };
    const { svc, tx } = setup(last);
    expect(await svc.recordEdit(tx as never, user, input())).toBe(3);
    expect(tx.contractRevision.create).not.toHaveBeenCalled();
    expect(tx.contractRevision.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r3' }, data: expect.objectContaining({ contentHtml: '<p>b</p>' }) }));
  });

  it('starts a new version after 15 minutes, for another author, or when restoring', async () => {
    const old = { id: 'r3', seq: 3, kind: 'EDIT', authorId: 'u1', updatedAt: new Date(input().now.getTime() - REVISION_SESSION_MS - 1), changes: [] };
    for (const [last, over] of [
      [old, {}],
      [{ ...old, updatedAt: input().now, authorId: 'u2' }, {}],
      [{ ...old, updatedAt: input().now }, { restoredFromSeq: 1 }],
    ] as const) {
      const { svc, tx } = setup(last);
      expect(await svc.recordEdit(tx as never, user, input(over))).toBe(4);
    }
  });
});
