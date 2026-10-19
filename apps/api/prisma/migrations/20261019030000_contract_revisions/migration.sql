-- CreateTable
CREATE TABLE "ContractRevision" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EDIT',
    "authorId" UUID,
    "authorName" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "contentHtml" TEXT,
    "restoredFromSeq" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractRevision_tenantId_contractId_idx" ON "ContractRevision"("tenantId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractRevision_contractId_seq_key" ON "ContractRevision"("contractId", "seq");

-- AddForeignKey
ALTER TABLE "ContractRevision" ADD CONSTRAINT "ContractRevision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

