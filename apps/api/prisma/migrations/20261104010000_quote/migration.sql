-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "validUntil" DATE,
    "partnerId" UUID,
    "customerName" TEXT NOT NULL,
    "customerTaxCode" TEXT,
    "customerAddress" TEXT,
    "customerContact" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "vatRate" DECIMAL(5,2),
    "subtotal" DECIMAL(20,2) NOT NULL,
    "vatAmount" DECIMAL(20,2),
    "total" DECIMAL(20,2) NOT NULL,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "note" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "sentById" UUID,
    "sentMethod" TEXT,
    "sentTo" TEXT,
    "sentNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "orderId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "productId" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_tenantId_code_key" ON "Quote"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Quote_tenantId_date_idx" ON "Quote"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Quote_tenantId_status_idx" ON "Quote"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Quote_partnerId_idx" ON "Quote"("partnerId");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quyền lập báo giá cho các vai trò hệ thống đang lập đơn và kế toán.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'quote.manage' FROM "Role" r
WHERE r."code" IN ('tenant_admin', 'legal', 'staff', 'manager', 'accountant')
ON CONFLICT DO NOTHING;
