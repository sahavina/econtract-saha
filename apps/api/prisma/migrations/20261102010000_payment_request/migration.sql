-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "place" TEXT,
    "company" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "basis" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "account" TEXT,
    "accountHolder" TEXT,
    "signerPosition" TEXT,
    "signerName" TEXT,
    "contractId" UUID,
    "templateId" UUID,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRequest_tenantId_date_idx" ON "PaymentRequest"("tenantId", "date");

-- CreateIndex
CREATE INDEX "PaymentRequest_tenantId_status_idx" ON "PaymentRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_contractId_idx" ON "PaymentRequest"("contractId");

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quyền lập đề nghị thanh toán cho các vai trò hệ thống đang lập đơn và kế toán.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'payment_request.manage' FROM "Role" r
WHERE r."code" IN ('tenant_admin', 'legal', 'staff', 'manager', 'accountant')
ON CONFLICT DO NOTHING;
