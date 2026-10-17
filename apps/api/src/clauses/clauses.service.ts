import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '@saha/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { sanitizeContractHtml } from '../contracts/sanitize-content.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ClauseCreate, ClauseQuery, ClauseReject, ClauseUpdate } from './clauses.schemas.js';

const EDITABLE = new Set(['DRAFT', 'REJECTED', 'APPROVED']);

const clauseSelect = {
  id: true,
  code: true,
  title: true,
  category: true,
  contentHtml: true,
  version: true,
  status: true,
  reviewNote: true,
  approvedAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ClauseSelect;

/**
 * Vòng đời điều khoản: Nháp → Chờ duyệt → Đã duyệt / Bị từ chối.
 * Sửa điều khoản đã duyệt ⇒ phiên bản mới ở trạng thái Nháp, cần duyệt lại.
 * Mỗi phiên bản được duyệt lưu ảnh chụp trong ClauseVersion.
 */
@Injectable()
export class ClausesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scope(user: AuthUser): Prisma.ClauseWhereInput {
    const base: Prisma.ClauseWhereInput = { tenantId: user.tenantId, deletedAt: null };
    // Người soạn hợp đồng (không có quyền xem thư viện) chỉ thấy điều khoản đã duyệt.
    return user.permissions.has(PERMISSIONS.TEMPLATE_VIEW) ? base : { ...base, status: 'APPROVED' };
  }

  async list(user: AuthUser, q: ClauseQuery) {
    const where: Prisma.ClauseWhereInput = {
      AND: [
        this.scope(user),
        q.category ? { category: q.category } : {},
        q.status ? { status: q.status } : {},
        q.q
          ? {
              OR: [
                { title: { contains: q.q, mode: 'insensitive' } },
                { code: { contains: q.q, mode: 'insensitive' } },
                { contentHtml: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clause.findMany({
        where,
        select: clauseSelect,
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.clause.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const clause = await this.prisma.clause.findFirst({
      where: { AND: [this.scope(user), { id }] },
      select: {
        ...clauseSelect,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            title: true,
            contentHtml: true,
            createdAt: true,
            createdBy: { select: { fullName: true } },
          },
        },
      },
    });
    if (!clause) throw new NotFoundException('Không tìm thấy điều khoản');
    return clause;
  }

  create(user: AuthUser, input: ClauseCreate) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.clause.create({
        data: {
          ...input,
          contentHtml: sanitizeContractHtml(input.contentHtml),
          tenantId: user.tenantId,
          createdById: user.userId,
        },
        select: clauseSelect,
      });
      await this.audit.log(
        user,
        { action: 'clause.create', entityType: 'clause', entityId: c.id, data: { code: c.code, title: c.title } },
        tx,
      );
      return c;
    });
  }

  async update(user: AuthUser, id: string, input: ClauseUpdate) {
    const current = await this.get(user, id);
    if (!EDITABLE.has(current.status)) {
      throw new BadRequestException('Chỉ sửa được điều khoản Nháp, Bị từ chối hoặc Đã duyệt (tạo phiên bản mới)');
    }
    const contentHtml = input.contentHtml === undefined ? undefined : sanitizeContractHtml(input.contentHtml);
    if (contentHtml !== undefined && !contentHtml.trim())
      throw new BadRequestException('Nội dung điều khoản không được để trống');
    const newVersion = current.status === 'APPROVED';
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.clause.update({
        where: { id },
        data: {
          ...input,
          contentHtml,
          ...(newVersion && {
            version: current.version + 1,
            status: 'DRAFT',
            approvedById: null,
            approvedAt: null,
            reviewNote: null,
          }),
        },
        select: clauseSelect,
      });
      await this.audit.log(
        user,
        {
          action: 'clause.update',
          entityType: 'clause',
          entityId: id,
          data: { code: c.code, version: c.version, newVersion },
        },
        tx,
      );
      return c;
    });
  }

  async submit(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.status !== 'DRAFT' && current.status !== 'REJECTED') {
      throw new BadRequestException('Chỉ gửi duyệt điều khoản ở trạng thái Nháp hoặc Bị từ chối');
    }
    return this.transition(user, id, { status: 'PENDING_APPROVAL', reviewNote: null }, 'clause.submit');
  }

  async approve(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.status !== 'PENDING_APPROVAL') throw new BadRequestException('Điều khoản không ở trạng thái Chờ duyệt');
    if (current.createdBy.id === user.userId) {
      throw new ForbiddenException('Không được tự phê duyệt điều khoản do chính mình soạn');
    }
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.clause.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: user.userId, approvedAt: new Date(), reviewNote: null },
        select: clauseSelect,
      });
      await tx.clauseVersion.upsert({
        where: { clauseId_version: { clauseId: id, version: c.version } },
        update: { title: c.title, contentHtml: c.contentHtml },
        create: {
          clauseId: id,
          version: c.version,
          title: c.title,
          contentHtml: c.contentHtml,
          createdById: user.userId,
        },
      });
      await this.audit.log(
        user,
        { action: 'clause.approve', entityType: 'clause', entityId: id, data: { code: c.code, version: c.version } },
        tx,
      );
      return c;
    });
  }

  async reject(user: AuthUser, id: string, input: ClauseReject) {
    const current = await this.get(user, id);
    if (current.status !== 'PENDING_APPROVAL') throw new BadRequestException('Điều khoản không ở trạng thái Chờ duyệt');
    return this.transition(user, id, { status: 'REJECTED', reviewNote: input.note }, 'clause.reject', {
      note: input.note,
    });
  }

  async archive(user: AuthUser, id: string) {
    await this.get(user, id);
    return this.transition(user, id, { status: 'ARCHIVED' }, 'clause.archive');
  }

  async remove(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.status !== 'DRAFT' && current.status !== 'REJECTED') {
      throw new BadRequestException('Chỉ xóa được điều khoản Nháp hoặc Bị từ chối; điều khoản khác hãy lưu trữ');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.clause.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        user,
        { action: 'clause.delete', entityType: 'clause', entityId: id, data: { code: current.code } },
        tx,
      );
    });
  }

  private transition(
    user: AuthUser,
    id: string,
    data: Prisma.ClauseUpdateInput,
    action: string,
    extra: Record<string, string> = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.clause.update({ where: { id }, data, select: clauseSelect });
      await this.audit.log(
        user,
        { action, entityType: 'clause', entityId: id, data: { code: c.code, version: c.version, ...extra } },
        tx,
      );
      return c;
    });
  }
}
