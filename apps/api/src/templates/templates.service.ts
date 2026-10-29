import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { extractVariables, PERMISSIONS, TEMPLATE_VARIABLE_KEYS } from '@saha/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { paginated } from '../common/pagination.js';
import { sanitizeContractHtml } from '../contracts/sanitize-content.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TemplateCreate, TemplateQuery, TemplateUpdate } from './templates.schemas.js';

const listSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
  version: true,
  requiredVariables: true,
  departmentIds: true,
  updatedAt: true,
  contractType: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { contracts: true } },
} satisfies Prisma.ContractTemplateSelect;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private canManage(user: AuthUser) {
    return user.permissions.has(PERMISSIONS.TEMPLATE_MANAGE);
  }

  /** Điều kiện "được dùng mẫu": đang sử dụng và (không giới hạn phòng ban hoặc phòng ban của user nằm trong danh sách). */
  private usableWhere(user: AuthUser): Prisma.ContractTemplateWhereInput {
    const deptFilter: Prisma.ContractTemplateWhereInput[] = [{ departmentIds: { isEmpty: true } }];
    if (user.departmentId) deptFilter.push({ departmentIds: { has: user.departmentId } });
    return { status: 'ACTIVE', OR: deptFilter };
  }

  private scope(user: AuthUser, usable: boolean): Prisma.ContractTemplateWhereInput {
    const base: Prisma.ContractTemplateWhereInput = { tenantId: user.tenantId, deletedAt: null };
    // Người không có quyền xem thư viện mẫu chỉ thấy mẫu họ được phép dùng.
    const onlyUsable = usable || !user.permissions.has(PERMISSIONS.TEMPLATE_VIEW);
    return onlyUsable ? { AND: [base, this.usableWhere(user)] } : base;
  }

  async list(user: AuthUser, q: TemplateQuery) {
    const where: Prisma.ContractTemplateWhereInput = {
      AND: [
        this.scope(user, q.usable),
        q.status ? { status: q.status } : {},
        q.contractTypeId ? { contractTypeId: q.contractTypeId } : {},
        q.kind === 'ORDER' ? { contractType: { kind: 'ORDER' } } : {},
        q.kind === 'CONTRACT' ? { OR: [{ contractTypeId: null }, { contractType: { kind: 'CONTRACT' } }] } : {},
        q.q
          ? {
              OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }],
            }
          : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contractTemplate.findMany({
        where,
        select: listSelect,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.contractTemplate.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { AND: [this.scope(user, false), { id }] },
      include: {
        contractType: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, createdAt: true, createdBy: { select: { fullName: true } } },
        },
        _count: { select: { contracts: true } },
      },
    });
    if (!template) throw new NotFoundException('Không tìm thấy mẫu hợp đồng');
    return { ...template, variables: extractVariables(template.contentHtml) };
  }

  async getVersion(user: AuthUser, id: string, version: number) {
    await this.get(user, id);
    const v = await this.prisma.contractTemplateVersion.findUnique({
      where: { templateId_version: { templateId: id, version } },
    });
    if (!v) throw new NotFoundException('Không tìm thấy phiên bản');
    return v;
  }

  /** Mẫu dùng để lập hợp đồng: phải đang sử dụng và người dùng được phép dùng. */
  async getUsable(user: AuthUser, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { AND: [{ tenantId: user.tenantId, deletedAt: null, id }, this.usableWhere(user)] },
    });
    if (!template)
      throw new BadRequestException(
        'Mẫu hợp đồng không tồn tại, chưa kích hoạt hoặc phòng ban của bạn không được dùng',
      );
    return template;
  }

  async create(user: AuthUser, input: TemplateCreate) {
    await this.assertReferences(user, input);
    const contentHtml = sanitizeContractHtml(input.contentHtml);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.contractTemplate.create({
        data: { ...input, contentHtml, tenantId: user.tenantId, createdById: user.userId },
      });
      await this.audit.log(
        user,
        { action: 'template.create', entityType: 'template', entityId: t.id, data: { code: t.code, name: t.name } },
        tx,
      );
      return t;
    });
  }

  /**
   * Mẫu nháp: ghi đè phiên bản hiện tại.
   * Mẫu đang sử dụng: nội dung thay đổi ⇒ tăng phiên bản và lưu ảnh chụp (hợp đồng cũ giữ nguyên nội dung đã sao chép).
   */
  async update(user: AuthUser, id: string, input: TemplateUpdate) {
    const current = await this.get(user, id);
    if (current.status === 'ARCHIVED') throw new BadRequestException('Mẫu đã lưu trữ, không thể chỉnh sửa');
    await this.assertReferences(user, input);
    const contentHtml = input.contentHtml === undefined ? undefined : sanitizeContractHtml(input.contentHtml);
    const contentChanged = contentHtml !== undefined && contentHtml !== current.contentHtml;
    const bump = contentChanged && current.status === 'ACTIVE';
    if (bump) this.assertPublishable(contentHtml);

    return this.prisma.$transaction(async (tx) => {
      const version = bump ? current.version + 1 : current.version;
      const t = await tx.contractTemplate.update({ where: { id }, data: { ...input, contentHtml, version } });
      if (bump) {
        await tx.contractTemplateVersion.create({
          data: { templateId: id, version, contentHtml: t.contentHtml, createdById: user.userId },
        });
      }
      await this.audit.log(
        user,
        {
          action: 'template.update',
          entityType: 'template',
          entityId: id,
          data: { code: t.code, version, changes: Object.keys(input) },
        },
        tx,
      );
      return t;
    });
  }

  async activate(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.status === 'ACTIVE') return current;
    this.assertPublishable(current.contentHtml);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.contractTemplate.update({ where: { id }, data: { status: 'ACTIVE' } });
      const snap = await tx.contractTemplateVersion.findUnique({
        where: { templateId_version: { templateId: id, version: t.version } },
      });
      if (!snap) {
        await tx.contractTemplateVersion.create({
          data: { templateId: id, version: t.version, contentHtml: t.contentHtml, createdById: user.userId },
        });
      }
      await this.audit.log(
        user,
        {
          action: 'template.activate',
          entityType: 'template',
          entityId: id,
          data: { code: t.code, version: t.version },
        },
        tx,
      );
      return t;
    });
  }

  async archive(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.status === 'ARCHIVED') return current;
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.contractTemplate.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await this.audit.log(
        user,
        { action: 'template.archive', entityType: 'template', entityId: id, data: { code: t.code } },
        tx,
      );
      return t;
    });
  }

  async remove(user: AuthUser, id: string) {
    const current = await this.get(user, id);
    if (current.status === 'ACTIVE') throw new BadRequestException('Hãy lưu trữ mẫu trước khi xóa');
    await this.prisma.$transaction(async (tx) => {
      await tx.contractTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        user,
        { action: 'template.delete', entityType: 'template', entityId: id, data: { code: current.code } },
        tx,
      );
    });
  }

  private assertPublishable(contentHtml: string) {
    if (!contentHtml.trim()) throw new BadRequestException('Mẫu chưa có nội dung');
    const unknown = extractVariables(contentHtml).filter((k) => !TEMPLATE_VARIABLE_KEYS.has(k));
    if (unknown.length) {
      throw new BadRequestException(`Nội dung có biến không hỗ trợ: ${unknown.map((k) => `{{${k}}}`).join(', ')}`);
    }
  }

  private async assertReferences(user: AuthUser, input: Partial<TemplateCreate>) {
    if (input.contractTypeId) {
      const ok = await this.prisma.contractType.count({ where: { id: input.contractTypeId, tenantId: user.tenantId } });
      if (!ok) throw new BadRequestException('Loại hợp đồng không hợp lệ');
    }
    const depts = [...new Set(input.departmentIds ?? [])];
    if (depts.length) {
      const count = await this.prisma.department.count({ where: { id: { in: depts }, tenantId: user.tenantId } });
      if (count !== depts.length) throw new BadRequestException('Phòng ban không hợp lệ');
    }
    if (!this.canManage(user)) throw new BadRequestException('Bạn không có quyền quản lý mẫu');
  }
}
