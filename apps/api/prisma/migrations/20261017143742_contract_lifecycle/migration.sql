-- CreateEnum
CREATE TYPE "AppendixKind" AS ENUM ('AMENDMENT', 'EXTENSION', 'OTHER');

-- CreateEnum
CREATE TYPE "AppendixStatus" AS ENUM ('DRAFT', 'EFFECTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PLANNED', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcceptanceResult" AS ENUM ('PASSED', 'CONDITIONAL', 'FAILED');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "liquidatedAt" TIMESTAMP(3),
ADD COLUMN     "liquidationNote" TEXT;

-- CreateTable
CREATE TABLE "ContractAppendix" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "AppendixKind" NOT NULL,
    "contentHtml" TEXT,
    "valueChange" DECIMAL(20,2),
    "newExpiryDate" DATE,
    "effectiveDate" DATE,
    "status" "AppendixStatus" NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractAppendix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractObligation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "partyRole" "PartyRole",
    "assigneeId" UUID,
    "dueDate" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "ObligationStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstallment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "dueDate" DATE,
    "paidAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paidDate" DATE,
    "invoiceNo" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAcceptance" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "acceptedDate" DATE NOT NULL,
    "result" "AcceptanceResult" NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "key" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ContractAppendix_tenantId_status_idx" ON "ContractAppendix"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAppendix_contractId_seq_key" ON "ContractAppendix"("contractId", "seq");

-- CreateIndex
CREATE INDEX "ContractObligation_tenantId_status_dueDate_idx" ON "ContractObligation"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ContractObligation_contractId_idx" ON "ContractObligation"("contractId");

-- CreateIndex
CREATE INDEX "PaymentInstallment_tenantId_status_dueDate_idx" ON "PaymentInstallment"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "PaymentInstallment_contractId_idx" ON "PaymentInstallment"("contractId");

-- CreateIndex
CREATE INDEX "ContractAcceptance_contractId_idx" ON "ContractAcceptance"("contractId");

-- AddForeignKey
ALTER TABLE "ContractAppendix" ADD CONSTRAINT "ContractAppendix_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstallment" ADD CONSTRAINT "PaymentInstallment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
