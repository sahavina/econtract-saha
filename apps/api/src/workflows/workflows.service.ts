import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ApprovalStepConfig } from '@saha/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { WorkflowCreate, WorkflowUpdate } from './workflows.schemas.js';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.approvalWorkflow.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { requests: true } } },
    });
  }

  async get(user: AuthUser, id: string) {
    const wf = await this.prisma.approvalWorkflow.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!wf) throw new NotFoundException('Không tìm thấy quy trình');
    return wf;
  }

  /** Danh mục cho trình cấu hình quy trình. */
  async lookups(user: AuthUser) {
    const t = user.tenantId;
    const [roles, users, contractTypes, departments] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where: { tenantId: t },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { tenantId: t, status: 'ACTIVE' },
        select: { id: true, fullName: true, jobTitle: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.contractType.findMany({
        where: { tenantId: t, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.findMany({
        where: { tenantId: t, isActive: true },
        select: { id: true, name: true, manager: { select: { id: true, fullName: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { roles, users, contractTypes, departments };
  }

  async create(user: AuthUser, input: WorkflowCreate) {
    await this.assertReferences(user, input);
    return this.prisma.$transaction(async (tx) => {
      const wf = await tx.approvalWorkflow.create({
        data: { ...input, steps: input.steps as unknown as Prisma.InputJsonValue, tenantId: user.tenantId },
      });
      await this.audit.log(
        user,
        { action: 'workflow.create', entityType: 'workflow', entityId: wf.id, data: { name: wf.name } },
        tx,
      );
      return wf;
    });
  }

  async update(user: AuthUser, id: string, input: WorkflowUpdate) {
    const current = await this.get(user, id);
    await this.assertReferences(user, input);
    const min = input.minValue !== undefined ? input.minValue : current.minValue?.toString();
    const max = input.maxValue !== undefined ? input.maxValue : current.maxValue?.toString();
    if (min && max && Number(min) >= Number(max)) {
      throw new BadRequestException('Giá trị tối đa phải lớn hơn giá trị tối thiểu');
    }
    // Yêu cầu đang chạy dùng ảnh chụp các bước nên sửa quy trình không ảnh hưởng.
    return this.prisma.$transaction(async (tx) => {
      const wf = await tx.approvalWorkflow.update({
        where: { id },
        data: { ...input, steps: input.steps ? (input.steps as unknown as Prisma.InputJsonValue) : undefined },
      });
      await this.audit.log(
        user,
        {
          action: 'workflow.update',
          entityType: 'workflow',
          entityId: id,
          data: { name: wf.name, changes: Object.keys(input) },
        },
        tx,
      );
      return wf;
    });
  }

  async remove(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalWorkflow.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.log(
        user,
        { action: 'workflow.delete', entityType: 'workflow', entityId: id, data: { name: current.name } },
        tx,
      );
    });
  }

  /**
   * Chọn quy trình áp dụng cho hợp đồng: đang bật, khớp loại HĐ (hoặc không giới hạn loại),
   * giá trị trong [minValue, maxValue); ưu tiên priority nhỏ nhất.
   */
  findMatching(tenantId: string, contractTypeId: string | null, value: Prisma.Decimal, db: Db = this.prisma) {
    const typeFilter: Prisma.ApprovalWorkflowWhereInput[] = [{ contractTypeIds: { isEmpty: true } }];
    if (contractTypeId) typeFilter.push({ contractTypeIds: { has: contractTypeId } });
    return db.approvalWorkflow.findFirst({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        AND: [
          { OR: typeFilter },
          { OR: [{ minValue: null }, { minValue: { lte: value } }] },
          { OR: [{ maxValue: null }, { maxValue: { gt: value } }] },
        ],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  steps(wf: { steps: Prisma.JsonValue }): ApprovalStepConfig[] {
    return wf.steps as unknown as ApprovalStepConfig[];
  }

  private async assertReferences(user: AuthUser, input: Partial<WorkflowCreate>) {
    const t = user.tenantId;
    const typeIds = [...new Set(input.contractTypeIds ?? [])];
    if (
      typeIds.length &&
      (await this.prisma.contractType.count({ where: { id: { in: typeIds }, tenantId: t } })) !== typeIds.length
    ) {
      throw new BadRequestException('Loại hợp đồng không hợp lệ');
    }
    const roleIds = [...new Set((input.steps ?? []).map((s) => s.roleId).filter((x): x is string => !!x))];
    if (
      roleIds.length &&
      (await this.prisma.role.count({ where: { id: { in: roleIds }, tenantId: t } })) !== roleIds.length
    ) {
      throw new BadRequestException('Vai trò duyệt không hợp lệ');
    }
    const userIds = [...new Set((input.steps ?? []).flatMap((s) => s.userIds ?? []))];
    if (
      userIds.length &&
      (await this.prisma.user.count({ where: { id: { in: userIds }, tenantId: t } })) !== userIds.length
    ) {
      throw new BadRequestException('Người duyệt không hợp lệ');
    }
  }
}
