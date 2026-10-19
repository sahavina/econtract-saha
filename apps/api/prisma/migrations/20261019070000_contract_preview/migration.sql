-- CreateEnum
CREATE TYPE "ContractFeedbackKind" AS ENUM ('CHANGE_REQUEST', 'AGREE');

-- CreateEnum
CREATE TYPE "ContractFeedbackStatus" AS ENUM ('NEW', 'RESOLVED');

-- CreateTable
CREATE TABLE "ContractShareLink" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByName" TEXT,
    "createdById" UUID NOT NULL,
    "createdByName" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractFeedback" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "kind" "ContractFeedbackKind" NOT NULL,
    "status" "ContractFeedbackStatus" NOT NULL DEFAULT 'NEW',
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "clauseRef" TEXT,
    "message" TEXT,
    "revisionSeq" INTEGER,
    "contentHash" TEXT NOT NULL,
    "response" TEXT,
    "resolvedById" UUID,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractShareLink_tokenHash_key" ON "ContractShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ContractShareLink_tenantId_contractId_idx" ON "ContractShareLink"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "ContractFeedback_tenantId_contractId_status_idx" ON "ContractFeedback"("tenantId", "contractId", "status");

-- CreateIndex
CREATE INDEX "ContractFeedback_linkId_createdAt_idx" ON "ContractFeedback"("linkId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContractShareLink" ADD CONSTRAINT "ContractShareLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractFeedback" ADD CONSTRAINT "ContractFeedback_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractFeedback" ADD CONSTRAINT "ContractFeedback_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ContractShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quyền mới "contract.share": cấp cho các vai trò đang có quyền sửa hợp đồng (tenant_admin luôn có mọi quyền).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "roleId", 'contract.share' FROM "RolePermission" WHERE "permission" = 'contract.update'
ON CONFLICT DO NOTHING;
