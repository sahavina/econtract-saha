import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { LifecycleJobs } from './lifecycle.jobs.js';

const T = new Date('2026-11-17T00:00:00Z');
const row = (id: string, due: string) => ({ id, tenantId: 't1', code: `KT-${id}`, assigneeId: 'u1', dueDate: new Date(`${due}T00:00:00Z`), contract: { code: 'HD-1' } });

function setup(rows: ReturnType<typeof row>[], taken: string[] = []) {
  const created: string[] = [];
  const tx = {
    reminderLog: {
      create: vi.fn(async ({ data }: { data: { key: string } }) => {
        if (taken.includes(data.key)) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        created.push(data.key);
      }),
    },
  };
  const prisma = {
    inspectionRequest: { findMany: vi.fn(async (_args: unknown) => rows) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const notifications = { notify: vi.fn() };
  const jobs = new LifecycleJobs(prisma as never, {} as never, {} as never, {} as never, notifications as never);
  const remind = (jobs as unknown as { remindInspections: (t: Date) => Promise<number> }).remindInspections.bind(jobs);
  return { remind, prisma, notifications, created };
}

describe('LifecycleJobs – nhắc hạn yêu cầu kiểm tra', () => {
  it('chỉ lấy yêu cầu còn mở đến hạn hoặc quá hạn; báo người phụ trách đúng mốc', async () => {
    const { remind, prisma, notifications, created } = setup([row('a', '2026-11-17'), row('b', '2026-11-10')]);
    expect(await remind(T)).toBe(2);
    expect(prisma.inspectionRequest.findMany.mock.calls[0][0]).toMatchObject({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lte: T } } });
    expect(created).toEqual(['insp:a:due:2026-11-17', 'insp:b:overdue:2026-11-10']);
    expect(notifications.notify.mock.calls[0][2].title).toContain('Đến hạn hôm nay');
    expect(notifications.notify.mock.calls[1][2]).toMatchObject({ type: 'reminder.inspection', link: '/inspections/b' });
    expect(notifications.notify.mock.calls[1][1]).toEqual(['u1']);
  });

  it('mốc đã nhắc thì không nhắc lại', async () => {
    const { remind, notifications } = setup([row('b', '2026-11-10')], ['insp:b:overdue:2026-11-10']);
    expect(await remind(T)).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
