import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@saha/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { optionalString, paginated, paginationSchema } from '../common/pagination.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const nullableText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const productBase = z.object({
  code: z.string().trim().min(1, 'Nhập mã sản phẩm').max(60),
  name: z.string().trim().min(1, 'Nhập tên sản phẩm').max(500),
  unit: nullableText(30),
  unitPrice: z
    .union([z.number(), z.string()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,18}(\.\d{1,2})?$/.test(v), 'Đơn giá không hợp lệ'),
  vatRate: z.preprocess(emptyToNull, z.coerce.number().min(0).max(100).nullable().optional()),
  description: nullableText(2000),
  isActive: z.boolean(),
});
// Zod 4: `.partial()` vẫn áp default ⇒ schema sửa dựng từ object không default.
export const productCreateSchema = productBase.extend({ unitPrice: productBase.shape.unitPrice.default('0'), isActive: z.boolean().default(true) });
export const productUpdateSchema = productBase.partial();
export const productQuerySchema = paginationSchema.extend({
  // Danh mục dùng làm danh sách chọn khi lập đơn ⇒ cho lấy nhiều hơn trang thường.
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  q: optionalString,
  /** Mặc định chỉ sản phẩm đang kinh doanh. */
  all: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});
type ProductCreate = z.infer<typeof productCreateSchema>;
type ProductUpdate = z.infer<typeof productUpdateSchema>;
type ProductQuery = z.infer<typeof productQuerySchema>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: ProductQuery) {
    const where: Prisma.ProductWhereInput = {
      tenantId: user.tenantId,
      ...(!q.all && { isActive: true }),
      ...(q.q && {
        OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy: [{ isActive: 'desc' }, { code: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(items, total, q.page, q.pageSize);
  }

  async create(user: AuthUser, input: ProductCreate) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const p = await tx.product.create({ data: { ...input, tenantId: user.tenantId } });
        await this.audit.log(user, { action: 'product.create', entityType: 'product', entityId: p.id, data: { code: p.code, name: p.name } }, tx);
        return p;
      });
    } catch (e) {
      throw this.duplicate(e, input.code);
    }
  }

  async update(user: AuthUser, id: string, input: ProductUpdate) {
    const current = await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!current) throw new NotFoundException('Không tìm thấy sản phẩm');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const p = await tx.product.update({ where: { id }, data: input });
        await this.audit.log(user, { action: 'product.update', entityType: 'product', entityId: id, data: { code: p.code, changes: Object.keys(input) } }, tx);
        return p;
      });
    } catch (e) {
      throw this.duplicate(e, input.code ?? current.code);
    }
  }

  private duplicate(e: unknown, code: string) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? new ConflictException(`Mã sản phẩm "${code}" đã tồn tại`) : e;
  }
}

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // Người lập/sửa đơn cần đọc danh mục để chọn hàng.
  @Get()
  @RequireAnyPermission(PERMISSIONS.PRODUCT_MANAGE, PERMISSIONS.CONTRACT_CREATE, PERMISSIONS.CONTRACT_UPDATE)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(productQuerySchema)) query: ProductQuery) {
    return this.products.list(user, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(productCreateSchema)) body: ProductCreate) {
    return this.products.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(productUpdateSchema)) body: ProductUpdate) {
    return this.products.update(user, id, body);
  }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}
