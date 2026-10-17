import { workflowCreateSchema, workflowUpdateSchema } from '../workflows/workflows.schemas.js';
import { decideSchema } from './approvals.service.js';

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
