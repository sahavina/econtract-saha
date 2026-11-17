-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'ISSUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "InspectionRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "contractId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "result" TEXT,
    "itemResults" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectionRequest_tenantId_status_idx" ON "InspectionRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InspectionRequest_assigneeId_status_idx" ON "InspectionRequest"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "InspectionRequest_contractId_idx" ON "InspectionRequest"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionRequest_tenantId_code_key" ON "InspectionRequest"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quyền mới: gửi yêu cầu kiểm tra (vai trò lập hồ sơ) và xem/xử lý mọi yêu cầu (quản lý).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'inspection.create' FROM "Role" r
WHERE r."code" IN ('tenant_admin', 'legal', 'staff', 'manager', 'accountant', 'director', 'ceo')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'inspection.manage' FROM "Role" r
WHERE r."code" IN ('tenant_admin', 'legal', 'director', 'ceo')
ON CONFLICT DO NOTHING;
