-- CreateEnum
CREATE TYPE "ContractKind" AS ENUM ('CONTRACT', 'ORDER');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "deliveryDate" DATE,
ADD COLUMN     "kind" "ContractKind" NOT NULL DEFAULT 'CONTRACT',
ADD COLUMN     "parentContractId" UUID,
ADD COLUMN     "paymentTerms" TEXT;

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "kind" "ContractKind" NOT NULL DEFAULT 'CONTRACT';

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "unitPrice" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2),
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "productId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "deliveredQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "ContractItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_code_key" ON "Product"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ContractItem_contractId_idx" ON "ContractItem"("contractId");

-- CreateIndex
CREATE INDEX "ContractItem_tenantId_productId_idx" ON "ContractItem"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_kind_idx" ON "Contract"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "Contract_parentContractId_idx" ON "Contract"("parentContractId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractItem" ADD CONSTRAINT "ContractItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractItem" ADD CONSTRAINT "ContractItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Dữ liệu: loại "Đơn đặt hàng" cho mọi doanh nghiệp (giữ nguyên nếu mã DDH đã có).
INSERT INTO "ContractType" ("id", "tenantId", "code", "name", "kind", "codePattern", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", 'DDH', 'Đơn đặt hàng', 'ORDER', 'DDH-{YYYY}-{SEQUENCE:4}', true, now(), now()
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

-- Quyền quản lý danh mục sản phẩm cho các vai trò đang quản lý đối tác.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT rp."roleId", 'product.manage' FROM "RolePermission" rp WHERE rp."permission" = 'partner.manage'
ON CONFLICT DO NOTHING;
