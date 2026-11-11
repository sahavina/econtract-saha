import { workflowCreateSchema, workflowUpdateSchema } from '../workflows/workflows.schemas.js';
import { ApprovalsService, decideSchema, reopenSchema } from './approvals.service.js';

describe('approval schemas', () => {
  it('requires a comment when rejecting or requesting changes', () => {
    expect(decideSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
    expect(decideSchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(decideSchema.safeParse({ decision: 'REQUEST_CHANGES', comment: 'Bổ sung bảo hành' }).success).toBe(true);
  });

  it('validates workflow steps and value range', () => {
    const base = {
      name: 'Q',
      steps: [{ name: 'Kế toán', approverType: 'ROLE', roleId: '6f1c1b1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b', mode: 'ANY' }],
    };
    expect(workflowCreateSchema.safeParse(base).success).toBe(true);
    expect(workflowCreateSchema.safeParse({ ...base, minValue: '500', maxValue: '100' }).success).toBe(false);
    expect(
      workflowCreateSchema.safeParse({
        ...base,
        steps: [{ name: 'A', approverType: 'USERS', mode: 'ALL', userIds: [] }],
      }).success,
    ).toBe(false);
    expect(workflowCreateSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
  });

  it('partial update does not inject defaults', () => {
    expect(workflowUpdateSchema.parse({ name: 'Mới' })).toEqual({ name: 'Mới' });
  });
});

describe('reopen – mở lại hồ sơ đã phê duyệt', () => {
  const user = { userId: 'u1', fullName: 'A', tenantId: 't1' };
  const setup = (count: number) => {
    const updateMany = vi.fn().mockResolvedValue({ count });
    const log = vi.fn().mockResolvedValue(undefined);
    const prisma = { $transaction: (fn: (tx: unknown) => unknown) => fn({ contract: { updateMany } }) };
    const contracts = { get: vi.fn().mockResolvedValue({ id: 'c1', code: 'HD-01' }) };
    const service = new ApprovalsService(prisma as never, contracts as never, {} as never, { log } as never, {} as never);
    return { service, updateMany, log };
  };

  it('bắt buộc có lý do', () => {
    expect(reopenSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(reopenSchema.safeParse({ reason: 'Sai đơn giá' }).success).toBe(true);
  });

  it('chỉ chuyển hồ sơ Đã phê duyệt về Nháp, cùng tenant, và ghi nhật ký kèm lý do', async () => {
    const { service, updateMany, log } = setup(1);
    await service.reopen(user as never, 'c1', { reason: 'Sai đơn giá' });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ id: 'c1', tenantId: 't1', status: 'APPROVED', approvalStatus: 'APPROVED', deletedAt: null, archivedAt: null });
    expect(updateMany.mock.calls[0][0].data).toEqual({ status: 'DRAFT', approvalStatus: 'NOT_SUBMITTED' });
    expect(log.mock.calls[0][1]).toMatchObject({ action: 'contract.approval_reopen', data: { comment: 'Sai đơn giá' } });
  });

  it('từ chối hồ sơ không còn ở trạng thái Đã phê duyệt và không ghi nhật ký', async () => {
    const { service, log } = setup(0);
    await expect(service.reopen(user as never, 'c1', { reason: 'x' })).rejects.toThrow('Chỉ mở lại được');
    expect(log).not.toHaveBeenCalled();
  });
});

describe('resolveSteps – người gửi là người duyệt', () => {
  const sen = { id: 'u-sen', fullName: 'Võ Thị Sen' };
  const boss = { id: 'u-boss', fullName: 'Giám đốc' };
  const user = { userId: sen.id, fullName: sen.fullName, tenantId: 't1' };
  // Người duyệt theo danh sách userIds của bước.
  const prisma = {
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        [sen, boss].filter((u) => where.id.in.includes(u.id)),
    },
  };
  const service = new ApprovalsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  const resolve = (steps: { name: string; userIds: string[] }[]) =>
    (
      service as unknown as {
        resolveSteps: (
          u: unknown,
          c: unknown,
          s: unknown[],
        ) => Promise<{ name: string; approvers: { id: string }[]; skipped?: string; error?: string }[]>;
      }
    ).resolveSteps(
      user,
      { departmentId: null },
      steps.map((s) => ({ ...s, approverType: 'USERS', mode: 'ANY' })),
    );

  it('bỏ qua bước mà người gửi là người duyệt duy nhất, giữ bước sau', async () => {
    const [check, director] = await resolve([
      { name: 'Kiểm tra kế toán – pháp chế', userIds: [sen.id] },
      { name: 'Giám đốc phê duyệt', userIds: [boss.id] },
    ]);
    expect(check.skipped).toContain('Võ Thị Sen');
    expect(check.error).toBeUndefined();
    expect(director.approvers.map((a) => a.id)).toEqual([boss.id]);
  });

  it('bước có người duyệt khác ⇒ người gửi bị loại khỏi danh sách, không bỏ qua bước', async () => {
    const [step] = await resolve([{ name: 'Kiểm tra', userIds: [sen.id, boss.id] }]);
    expect(step.skipped).toBeUndefined();
    expect(step.approvers.map((a) => a.id)).toEqual([boss.id]);
  });
});
