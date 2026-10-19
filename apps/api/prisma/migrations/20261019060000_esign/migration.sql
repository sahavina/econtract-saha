-- CreateTable
CREATE TABLE "EsignAccount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "externalUserId" TEXT,
    "displayName" TEXT,
    "tokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "certAlias" TEXT,
    "certSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hashData" JSONB NOT NULL,
    "resultDocumentId" UUID,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EsignAccount_tenantId_idx" ON "EsignAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EsignAccount_userId_provider_key" ON "EsignAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "EsignSession_tenantId_contractId_idx" ON "EsignSession"("tenantId", "contractId");

