import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { AuthUser } from '../common/auth-user.js';
import { ContractsService } from './contracts.service.js';

const user = { tenantId: 't1', userId: 'u1', fullName: 'Admin', permissions: new Set<string>() } as unknown as AuthUser;

function setup(contract: Record<string, unknown> | null) {
  const tx = { contract: { delete: vi.fn() } };
  const prisma = {
    contract: { findFirst: vi.fn().mockResolvedValue(contract) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: vi.fn() };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  const svc = new ContractsService(prisma as never, audit as never, {} as never, {} as never, storage as never);
  return { svc, prisma, tx, audit, storage };
}

const trashed = {
  id: 'c1',
  code: 'HD-1',
  title: 'Thử',
  status: 'DRAFT',
  deletedAt: new Date(),
  documents: [{ storageKey: 't1/contracts/c1/a' }, { storageKey: 't1/contracts/c1/b' }],
};

describe('ContractsService.purge', () => {
  it('only works on contracts of the same tenant', async () => {
    const { svc, prisma } = setup(null);
    await expect(svc.purge(user, 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', tenantId: 't1' } }));
  });

  it('refuses contracts that are not in the trash', async () => {
    const { svc, tx } = setup({ ...trashed, deletedAt: null });
    await expect(svc.purge(user, 'c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contract.delete).not.toHaveBeenCalled();
  });

  it('keeps contracts past draft/cancelled (e.g. signed) as evidence', async () => {
    const { svc, tx } = setup({ ...trashed, status: 'SIGNED' });
    await expect(svc.purge(user, 'c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contract.delete).not.toHaveBeenCalled();
  });

  it('deletes the contract, logs it in the same transaction and removes stored files', async () => {
    const { svc, tx, audit, storage } = setup(trashed);
    await svc.purge(user, 'c1');
    expect(tx.contract.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(audit.log).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: 'contract.purge', entityId: 'c1', data: { code: 'HD-1', title: 'Thử', files: 2 } }),
      tx,
    );
    expect(storage.remove).toHaveBeenCalledTimes(2);
  });
});
