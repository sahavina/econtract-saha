-- Phiếu xuất kho (02-VT) và phiếu gửi hàng (chành xe).
-- CreateEnum
CREATE TYPE "StockIssueStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShippingNoteStatus" AS ENUM ('DRAFT', 'SENT', 'DELIVERED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_workflowId_fkey";

-- CreateTable
CREATE TABLE "StockIssue" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "orderId" UUID,
    "receiverName" TEXT NOT NULL,
    "receiverUnit" TEXT,
    "receiverAddress" TEXT,
    "reason" TEXT,
    "warehouse" TEXT,
    "warehouseAddress" TEXT,
    "debitAccount" TEXT,
    "creditAccount" TEXT,
    "attachments" TEXT,
    "note" TEXT,
    "status" "StockIssueStatus" NOT NULL DEFAULT 'ISSUED',
    "totalAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueItem" (
    "id" UUID NOT NULL,
    "stockIssueId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productId" UUID,
    "orderItemId" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "requestedQty" DECIMAL(18,3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,

    CONSTRAINT "StockIssueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingNote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sendDate" DATE NOT NULL,
    "stockIssueId" UUID,
    "orderId" UUID,
    "fromContact" TEXT,
    "fromPhone" TEXT,
    "fromCompany" TEXT,
    "fromAddress" TEXT,
    "warning" TEXT,
    "toCompany" TEXT NOT NULL,
    "toContact" TEXT,
    "toAddress" TEXT NOT NULL,
    "toPhones" TEXT,
    "footNote" TEXT,
    "boxes" INTEGER NOT NULL DEFAULT 1,
    "showBoxNumber" BOOLEAN NOT NULL DEFAULT true,
    "layout" TEXT NOT NULL DEFAULT 'A4',
    "carrier" TEXT,
    "carrierPhone" TEXT,
    "vehicle" TEXT,
    "trackingNo" TEXT,
    "freight" DECIMAL(20,2),
    "freightPayer" TEXT,
    "status" "ShippingNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockIssue_tenantId_issueDate_idx" ON "StockIssue"("tenantId", "issueDate");

-- CreateIndex
CREATE INDEX "StockIssue_orderId_idx" ON "StockIssue"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "StockIssue_tenantId_code_key" ON "StockIssue"("tenantId", "code");

-- CreateIndex
CREATE INDEX "StockIssueItem_stockIssueId_idx" ON "StockIssueItem"("stockIssueId");

-- CreateIndex
CREATE INDEX "ShippingNote_tenantId_sendDate_idx" ON "ShippingNote"("tenantId", "sendDate");

-- CreateIndex
CREATE INDEX "ShippingNote_tenantId_status_idx" ON "ShippingNote"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ShippingNote_orderId_idx" ON "ShippingNote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingNote_tenantId_code_key" ON "ShippingNote"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueItem" ADD CONSTRAINT "StockIssueItem_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueItem" ADD CONSTRAINT "StockIssueItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingNote" ADD CONSTRAINT "ShippingNote_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingNote" ADD CONSTRAINT "ShippingNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingNote" ADD CONSTRAINT "ShippingNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Quyền lập phiếu xuất kho / phiếu gửi hàng cho các vai trò hệ thống đang lập đơn.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'delivery.manage' FROM "Role" r
WHERE r."code" IN ('tenant_admin', 'legal', 'staff', 'manager')
ON CONFLICT DO NOTHING;
