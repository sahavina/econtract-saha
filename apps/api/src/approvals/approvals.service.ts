import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  type ApprovalDecision,
  type ApprovalModeValue,
  type ApprovalStepConfig,
  APPROVAL_DECISION_LABELS,
  buildTemplateValues,
  variableLabel,
} from '@saha/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowsService } from '../workflows/workflows.service.js';

type Tx = Prisma.TransactionClient;
type Contract = Awaited<ReturnType<ContractsService['get']>>;

export const submitSchema = z.object({ note: z.string().trim().max(2000).optional() });
export type SubmitInput = z.infer<typeof submitSchema>;

export const decideSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
    comment: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.decision === 'APPROVE' || !!v.comment, {
    message: 'Vui lòng nhập lý do từ chối / nội dung cần chỉnh sửa',
    path: ['comment'],
  });
export type DecideInput = z.infer<typeof decideSchema>;

/** Bước đã giải quyết người duyệt – được lưu làm ảnh chụp trong ApprovalRequest.stepsSnapshot. */
export interface ResolvedStep {
  order: number;
  name: string;
  mode: ApprovalModeValue;
  dueHours: number | null;
  approvers: { id: string; fullName: string }[];
  /** Bước bị bỏ qua (ví dụ người gửi chính là trưởng phòng). */
  skipped?: string;
  error?: string;
}

const SUBMITTABLE_APPROVAL = new Set(['NOT_SUBMITTED', 'REJECTED', 'CHANGES_REQUESTED']);
const HOUR = 3_600_000;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly workflows: WorkflowsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────── Xem trước & kiểm tra trước khi gửi ─────────────────────────

  async preview(user: AuthUser, contractId: string) {
    const contract = await this.contracts.get(user, contractId);
    const issues = await this.validate(contract);
    const workflow = await this.workflows.findMatching(user.tenantId, contract.contractTypeId, contract.value);
    if (!workflow) {
      issues.push('Không có quy trình phê duyệt phù hợp với loại và giá trị hợp đồng. Liên hệ quản trị để cấu hình.');
      return { canSubmit: false, issues, workflow: null, steps: [] as ResolvedStep[] };
    }
    const steps = await this.resolveSteps(user, contract, this.workflows.steps(workflow));
    for (const s of steps) if (s.error) issues.push(`Bước "${s.name}": ${s.error}`);
    if (steps.every((s) => s.skipped || s.error)) issues.push('Quy trình không còn bước duyệt hợp lệ.');
    return { canSubmit: issues.length === 0, issues, workflow: { id: workflow.id, name: workflow.name }, steps };
  }

  /** Điều kiện nghiệp vụ để gửi duyệt (cảnh báo dữ liệu thiếu). */
  private async validate(c: Contract): Promise<string[]> {
    const issues: string[] = [];
    if (c.deletedAt || c.archivedAt) issues.push('Hợp đồng đã lưu trữ hoặc ở thùng rác.');
    if (c.status !== 'DRAFT' || !SUBMITTABLE_APPROVAL.has(c.approvalStatus)) {
      issues.push('Chỉ gửi duyệt được hợp đồng ở trạng thái Nháp.');
    }
    const roles = new Set(c.parties.map((p) => p.role));
    if (!roles.has('PARTY_A') || !roles.has('PARTY_B')) issues.push('Hợp đồng cần có Bên A và Bên B.');
    if (!c.departmentId) issues.push('Chưa chọn phòng ban phụ trách.');
    const docCount = await this.prisma.contractDocument.count({ where: { contractId: c.id, deletedAt: null } });
    if (!c.contentHtml?.trim() && docCount === 0) issues.push('Chưa có nội dung hợp đồng hoặc tài liệu đính kèm.');
    if (c.template?.requiredVariables.length) {
      const values = buildTemplateValues({ ...c, value: c.value.toString(), vatRate: c.vatRate?.toString() });
      const missing = c.template.requiredVariables.filter((k) => !values[k]);
      if (missing.length) issues.push(`Thiếu dữ liệu bắt buộc theo mẫu: ${missing.map(variableLabel).join(', ')}.`);
    }
    return issues;
  }

  /** Giải quyết người duyệt cho từng bước; người gửi không được tự duyệt. */
  private async resolveSteps(
    user: AuthUser,
    contract: Contract,
    config: ApprovalStepConfig[],
  ): Promise<ResolvedStep[]> {
    const active = { tenantId: user.tenantId, status: 'ACTIVE' as const };
    const select = { id: true, fullName: true };
    const result: ResolvedStep[] = [];
    for (const [i, step] of config.entries()) {
      let approvers: { id: string; fullName: string }[] = [];
      if (step.approverType === 'DEPARTMENT_MANAGER') {
        const dept = contract.departmentId
          ? await this.prisma.department.findUnique({
              where: { id: contract.departmentId },
              select: { managerId: true },
            })
          : null;
        if (!dept?.managerId) {
          result.push({
            order: i + 1,
            name: step.name,
            mode: step.mode,
            dueHours: step.dueHours ?? null,
            approvers: [],
            error: 'Phòng ban phụ trách chưa có trưởng phòng.',
          });
          continue;
        }
        approvers = await this.prisma.user.findMany({ where: { ...active, id: dept.managerId }, select });
      } else if (step.approverType === 'ROLE') {
        approvers = await this.prisma.user.findMany({
          where: { ...active, roles: { some: { roleId: step.roleId ?? '' } } },
          select,
          orderBy: { fullName: 'asc' },
        });
      } else {
        approvers = await this.prisma.user.findMany({ where: { ...active, id: { in: step.userIds ?? [] } }, select });
      }

      const others = approvers.filter((a) => a.id !== user.userId);
      const base = {
        order: i + 1,
        name: step.name,
        mode: step.mode,
        dueHours: step.dueHours ?? null,
        approvers: others,
      };
      if (others.length) result.push(base);
      else if (approvers.length && step.approverType === 'DEPARTMENT_MANAGER') {
        // Người gửi chính là trưởng phòng ⇒ bỏ qua bước trưởng phòng.
        result.push({ ...base, skipped: 'Người gửi là trưởng phòng phụ trách' });
      } else {
        result.push({
          ...base,
          error: approvers.length ? 'Người gửi không được tự phê duyệt.' : 'Không có người duyệt đang hoạt động.',
        });
      }
    }
    return result;
  }

  // ───────────────────────── Gửi duyệt ─────────────────────────

  async submit(user: AuthUser, contractId: string, input: SubmitInput) {
    const preview = await this.preview(user, contractId);
    if (!preview.canSubmit || !preview.workflow) {
      throw new BadRequestException({ message: 'Chưa đủ điều kiện gửi phê duyệt', issues: preview.issues });
    }
    const steps = preview.steps.filter((s) => !s.skipped).map((s, i) => ({ ...s, order: i + 1 }));
    const contract = await this.contracts.get(user, contractId);

    return this.prisma.$transaction(async (tx) => {
      // Khóa lạc quan: chỉ chuyển trạng thái nếu hợp đồng vẫn đang ở Nháp.
      const moved = await tx.contract.updateMany({
        where: {
          id: contractId,
          tenantId: user.tenantId,
          status: 'DRAFT',
          approvalStatus: { in: [...SUBMITTABLE_APPROVAL] as never },
        },
        data: { status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
      });
      if (moved.count !== 1) throw new ConflictException('Hợp đồng vừa được thay đổi, vui lòng tải lại');

      const now = Date.now();
      const request = await tx.approvalRequest.create({
        data: {
          tenantId: user.tenantId,
          contractId,
          workflowId: preview.workflow!.id,
          workflowName: preview.workflow!.name,
          totalSteps: steps.length,
          stepsSnapshot: preview.steps as unknown as Prisma.InputJsonValue,
          submittedById: user.userId,
          submitNote: input.note || null,
          tasks: {
            create: steps.flatMap((s) =>
              s.approvers.map((a) => ({
                tenantId: user.tenantId,
                stepOrder: s.order,
                stepName: s.name,
                mode: s.mode,
                approverId: a.id,
                status: s.order === 1 ? ('PENDING' as const) : ('WAITING' as const),
                dueAt: s.order === 1 && s.dueHours ? new Date(now + s.dueHours * HOUR) : null,
              })),
            ),
          },
        },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.submit_approval',
          entityType: 'contract',
          entityId: contractId,
          data: {
            code: contract.code,
            workflow: preview.workflow!.name,
            steps: steps.map((s) => s.name).join(' → '),
            note: input.note,
          },
        },
        tx,
      );
      await this.notifications.notify(
        user.tenantId,
        steps[0]?.approvers.map((a) => a.id) ?? [],
        {
          type: 'approval.pending',
          title: `Hợp đồng ${contract.code} cần bạn phê duyệt`,
          body: `${contract.title} – bước "${steps[0]?.name}", gửi bởi ${user.fullName}`,
          link: `/contracts/${contractId}?tab=approval`,
        },
        tx,
      );
      return request;
    });
  }

  // ───────────────────────── Xử lý của người duyệt ─────────────────────────

  async decide(user: AuthUser, contractId: string, input: DecideInput) {
    const contract = await this.contracts.get(user, contractId);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { contractId, tenantId: user.tenantId, status: 'PENDING' },
        orderBy: { submittedAt: 'desc' },
      });
      if (!request) throw new BadRequestException('Hợp đồng không có yêu cầu phê duyệt đang chờ');
      const task = await tx.approvalTask.findFirst({
        where: { requestId: request.id, approverId: user.userId, stepOrder: request.currentStep, status: 'PENDING' },
      });
      if (!task) throw new ForbiddenException('Bạn không có nhiệm vụ phê duyệt đang chờ cho hợp đồng này');

      const status =
        input.decision === 'APPROVE' ? 'APPROVED' : input.decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
      const claimed = await tx.approvalTask.updateMany({
        where: { id: task.id, status: 'PENDING' },
        data: { status, comment: input.comment || null, decidedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Nhiệm vụ đã được xử lý, vui lòng tải lại');

      let outcome: 'STEP_WAITING' | 'NEXT_STEP' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
      if (input.decision === 'APPROVE') {
        outcome = await this.afterApprove(tx, request, task);
      } else {
        outcome = status as 'REJECTED' | 'CHANGES_REQUESTED';
        await this.closeRequest(tx, request.id, outcome);
        await tx.contract.update({ where: { id: contractId }, data: { status: 'DRAFT', approvalStatus: outcome } });
      }

      await this.audit.log(
        user,
        {
          action: `contract.approval_${input.decision.toLowerCase()}`,
          entityType: 'contract',
          entityId: contractId,
          data: {
            code: contract.code,
            step: task.stepName,
            decision: APPROVAL_DECISION_LABELS[input.decision as ApprovalDecision],
            comment: input.comment,
            outcome,
          },
        },
        tx,
      );
      // Thông báo: đến lượt bước kế tiếp, hoặc kết quả cuối cho người gửi/người phụ trách.
      if (outcome === 'NEXT_STEP') {
        const next = await tx.approvalTask.findMany({
          where: { requestId: request.id, stepOrder: request.currentStep + 1, status: 'PENDING' },
        });
        await this.notifications.notify(
          user.tenantId,
          next.map((t) => t.approverId),
          {
            type: 'approval.pending',
            title: `Hợp đồng ${contract.code} cần bạn phê duyệt`,
            body: `${contract.title} – bước "${next[0]?.stepName ?? ''}"`,
            link: `/contracts/${contractId}?tab=approval`,
          },
          tx,
        );
      } else if (outcome !== 'STEP_WAITING') {
        const label = { APPROVED: 'đã được phê duyệt', REJECTED: 'bị từ chối', CHANGES_REQUESTED: 'cần chỉnh sửa' }[
          outcome
        ];
        await this.notifications.notify(
          user.tenantId,
          [request.submittedById, contract.ownerId],
          {
            type: 'approval.result',
            title: `Hợp đồng ${contract.code} ${label}`,
            body: input.comment ? `${user.fullName}: ${input.comment}` : `Bởi ${user.fullName}`,
            link: `/contracts/${contractId}?tab=approval`,
          },
          tx,
        );
      }
      return { outcome };
    });
  }

  private async afterApprove(
    tx: Tx,
    request: {
      id: string;
      contractId: string;
      currentStep: number;
      totalSteps: number;
      stepsSnapshot: Prisma.JsonValue;
    },
    task: { stepOrder: number; mode: ApprovalModeValue },
  ) {
    if (task.mode === 'ANY') {
      await tx.approvalTask.updateMany({
        where: { requestId: request.id, stepOrder: task.stepOrder, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
    } else {
      const remaining = await tx.approvalTask.count({
        where: { requestId: request.id, stepOrder: task.stepOrder, status: 'PENDING' },
      });
      if (remaining > 0) return 'STEP_WAITING' as const;
    }

    if (request.currentStep >= request.totalSteps) {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED', completedAt: new Date() },
      });
      await tx.contract.update({
        where: { id: request.contractId },
        data: { status: 'APPROVED', approvalStatus: 'APPROVED' },
      });
      return 'APPROVED' as const;
    }

    const next = request.currentStep + 1;
    const snapshot = (request.stepsSnapshot as unknown as ResolvedStep[]).filter((s) => !s.skipped);
    const dueHours = snapshot[next - 1]?.dueHours;
    await tx.approvalTask.updateMany({
      where: { requestId: request.id, stepOrder: next, status: 'WAITING' },
      data: { status: 'PENDING', dueAt: dueHours ? new Date(Date.now() + dueHours * HOUR) : null },
    });
    await tx.approvalRequest.update({ where: { id: request.id }, data: { currentStep: next } });
    return 'NEXT_STEP' as const;
  }

  private async closeRequest(tx: Tx, requestId: string, status: 'REJECTED' | 'CHANGES_REQUESTED' | 'CANCELLED') {
    await tx.approvalTask.updateMany({
      where: { requestId, status: { in: ['PENDING', 'WAITING'] } },
      data: { status: 'SKIPPED' },
    });
    await tx.approvalRequest.update({ where: { id: requestId }, data: { status, completedAt: new Date() } });
  }

  /** Người gửi hoặc người phụ trách rút lại yêu cầu đang chờ ⇒ hợp đồng về Nháp. */
  async cancel(user: AuthUser, contractId: string) {
    const contract = await this.contracts.get(user, contractId);
    const request = await this.prisma.approvalRequest.findFirst({
      where: { contractId, tenantId: user.tenantId, status: 'PENDING' },
    });
    if (!request) throw new BadRequestException('Không có yêu cầu phê duyệt đang chờ để rút lại');
    if (request.submittedById !== user.userId && contract.ownerId !== user.userId) {
      throw new ForbiddenException('Chỉ người gửi hoặc người phụ trách hợp đồng được rút lại');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.closeRequest(tx, request.id, 'CANCELLED');
      await tx.contract.update({
        where: { id: contractId },
        data: { status: 'DRAFT', approvalStatus: 'NOT_SUBMITTED' },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.approval_cancel',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code },
        },
        tx,
      );
    });
  }

  /**
   * Người có quyền "Tự phê duyệt hợp đồng" duyệt ngay, không qua (hoặc không chờ hết) quy trình:
   * - Hợp đồng Nháp: kiểm tra đủ điều kiện như khi gửi duyệt, ghi một yêu cầu duyệt đã hoàn tất.
   * - Hợp đồng đang chờ phê duyệt: hoàn tất yêu cầu đang chờ, các bước còn lại được bỏ qua.
   */
  async selfApprove(user: AuthUser, contractId: string, input: SubmitInput) {
    const contract = await this.contracts.get(user, contractId);
    if (contract.status === 'PENDING_APPROVAL') return this.approveNow(user, contract, input);
    const issues = await this.validate(contract);
    if (issues.length) throw new BadRequestException({ message: 'Chưa đủ điều kiện phê duyệt', issues });

    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.contract.updateMany({
        where: {
          id: contractId,
          tenantId: user.tenantId,
          status: 'DRAFT',
          approvalStatus: { in: [...SUBMITTABLE_APPROVAL] as never },
        },
        data: { status: 'APPROVED', approvalStatus: 'APPROVED' },
      });
      if (moved.count !== 1) throw new ConflictException('Hợp đồng vừa được thay đổi, vui lòng tải lại');

      const now = new Date();
      const stepName = 'Tự phê duyệt';
      const step: ResolvedStep = { order: 1, name: stepName, mode: 'ANY', dueHours: null, approvers: [{ id: user.userId, fullName: user.fullName }] };
      const request = await tx.approvalRequest.create({
        data: {
          tenantId: user.tenantId,
          contractId,
          workflowId: null,
          workflowName: stepName,
          status: 'APPROVED',
          totalSteps: 1,
          stepsSnapshot: [step] as unknown as Prisma.InputJsonValue,
          submittedById: user.userId,
          submitNote: input.note || null,
          completedAt: now,
          tasks: {
            create: [
              {
                tenantId: user.tenantId,
                stepOrder: 1,
                stepName,
                mode: 'ANY',
                approverId: user.userId,
                status: 'APPROVED',
                comment: input.note || null,
                decidedAt: now,
              },
            ],
          },
        },
      });
      await this.audit.log(
        user,
        {
          action: 'contract.self_approve',
          entityType: 'contract',
          entityId: contractId,
          data: { code: contract.code, note: input.note },
        },
        tx,
      );
      if (contract.ownerId && contract.ownerId !== user.userId) {
        await this.notifications.notify(
          user.tenantId,
          [contract.ownerId],
          {
            type: 'approval.result',
            title: `Hợp đồng ${contract.code} đã được phê duyệt`,
            body: `${user.fullName} tự phê duyệt${input.note ? `: ${input.note}` : ''}`,
            link: `/contracts/${contractId}?tab=approval`,
          },
          tx,
        );
      }
      return request;
    });
  }

  /** Duyệt ngay yêu cầu đang chờ: nhiệm vụ của chính người duyệt (nếu có) ⇒ Đã duyệt, các nhiệm vụ còn lại ⇒ Bỏ qua. */
  private async approveNow(user: AuthUser, contract: Contract, input: SubmitInput) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { contractId: contract.id, tenantId: user.tenantId, status: 'PENDING' },
        orderBy: { submittedAt: 'desc' },
      });
      if (!request) throw new BadRequestException('Hợp đồng không có yêu cầu phê duyệt đang chờ');
      const now = new Date();
      const comment = input.note || null;
      const own = await tx.approvalTask.updateMany({
        where: { requestId: request.id, approverId: user.userId, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'APPROVED', comment, decidedAt: now },
      });
      if (own.count === 0) {
        await tx.approvalTask.create({
          data: {
            tenantId: user.tenantId,
            requestId: request.id,
            stepOrder: request.currentStep,
            stepName: 'Phê duyệt ngay',
            mode: 'ANY',
            approverId: user.userId,
            status: 'APPROVED',
            comment,
            decidedAt: now,
          },
        });
      }
      const skipped = await tx.approvalTask.findMany({
        where: { requestId: request.id, status: { in: ['PENDING', 'WAITING'] } },
        select: { approverId: true },
      });
      await tx.approvalTask.updateMany({
        where: { requestId: request.id, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'SKIPPED' },
      });
      const closed = await tx.approvalRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', completedAt: now },
      });
      if (closed.count !== 1) throw new ConflictException('Yêu cầu phê duyệt vừa được xử lý, vui lòng tải lại');
      await tx.contract.update({ where: { id: contract.id }, data: { status: 'APPROVED', approvalStatus: 'APPROVED' } });

      await this.audit.log(
        user,
        {
          action: 'contract.approve_now',
          entityType: 'contract',
          entityId: contract.id,
          data: { code: contract.code, workflow: request.workflowName, step: `${request.currentStep}/${request.totalSteps}`, note: input.note },
        },
        tx,
      );
      await this.notifications.notify(
        user.tenantId,
        [...new Set([request.submittedById, contract.ownerId, ...skipped.map((t) => t.approverId)])].filter((id): id is string => !!id && id !== user.userId),
        {
          type: 'approval.result',
          title: `Hợp đồng ${contract.code} đã được phê duyệt`,
          body: `${user.fullName} phê duyệt ngay (bỏ qua các bước còn lại)${input.note ? `: ${input.note}` : ''}`,
          link: `/contracts/${contract.id}?tab=approval`,
        },
        tx,
      );
      return request;
    });
  }

  // ───────────────────────── Tra cứu ─────────────────────────

  async history(user: AuthUser, contractId: string) {
    await this.contracts.get(user, contractId);
    const requests = await this.prisma.approvalRequest.findMany({
      where: { contractId, tenantId: user.tenantId },
      orderBy: { submittedAt: 'desc' },
      include: {
        submittedBy: { select: { id: true, fullName: true } },
        tasks: {
          orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
          include: { approver: { select: { id: true, fullName: true, jobTitle: true } } },
        },
      },
    });
    return requests.map(({ stepsSnapshot, ...r }) => ({ ...r, steps: stepsSnapshot as unknown as ResolvedStep[] }));
  }

  /** Nhiệm vụ phê duyệt đang chờ người dùng hiện tại ("Công việc của tôi"). */
  myTasks(user: AuthUser) {
    return this.prisma.approvalTask.findMany({
      where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING', request: { status: 'PENDING' } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        stepName: true,
        stepOrder: true,
        dueAt: true,
        createdAt: true,
        request: {
          select: {
            id: true,
            workflowName: true,
            totalSteps: true,
            submittedAt: true,
            submittedBy: { select: { fullName: true } },
            contract: {
              select: {
                id: true,
                code: true,
                title: true,
                value: true,
                currency: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }
}
