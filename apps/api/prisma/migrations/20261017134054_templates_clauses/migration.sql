-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClauseCategory" AS ENUM ('PAYMENT', 'WARRANTY', 'CONFIDENTIALITY', 'PENALTY', 'COMPENSATION', 'TERMINATION', 'DISPUTE', 'FORCE_MAJEURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClauseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "templateId" UUID,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractTypeId" UUID,
    "description" TEXT,
    "contentHtml" TEXT NOT NULL DEFAULT '',
    "requiredVariables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "departmentIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplateVersion" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clause" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ClauseCategory" NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ClauseStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClauseVersion" (
    "id" UUID NOT NULL,
    "clauseId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClauseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractTemplate_tenantId_status_idx" ON "ContractTemplate"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_tenantId_code_key" ON "ContractTemplate"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplateVersion_templateId_version_key" ON "ContractTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "Clause_tenantId_category_status_idx" ON "Clause"("tenantId", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Clause_tenantId_code_key" ON "Clause"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ClauseVersion_clauseId_version_key" ON "ClauseVersion"("clauseId", "version");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_contractTypeId_fkey" FOREIGN KEY ("contractTypeId") REFERENCES "ContractType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clause" ADD CONSTRAINT "Clause_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clause" ADD CONSTRAINT "Clause_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clause" ADD CONSTRAINT "Clause_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseVersion" ADD CONSTRAINT "ClauseVersion_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "Clause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseVersion" ADD CONSTRAINT "ClauseVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
