-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SigningOrder" AS ENUM ('SEQUENTIAL', 'PARALLEL');

-- CreateEnum
CREATE TYPE "SignerStatus" AS ENUM ('WAITING', 'PENDING', 'SIGNED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SignMethod" AS ENUM ('INTERNAL_PASSWORD', 'EMAIL_OTP');

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "signingOrder" "SigningOrder" NOT NULL DEFAULT 'SEQUENTIAL',
    "message" TEXT,
    "contentSnapshot" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "partyRole" "PartyRole",
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "title" TEXT,
    "userId" UUID,
    "method" "SignMethod" NOT NULL,
    "status" "SignerStatus" NOT NULL,
    "tokenHash" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpSentAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "signatureImage" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedHash" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRequest_tenantId_status_idx" ON "SignatureRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SignatureRequest_contractId_idx" ON "SignatureRequest"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Signer_tokenHash_key" ON "Signer"("tokenHash");

-- CreateIndex
CREATE INDEX "Signer_tenantId_userId_status_idx" ON "Signer"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "Signer_requestId_order_idx" ON "Signer"("requestId", "order");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signer" ADD CONSTRAINT "Signer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signer" ADD CONSTRAINT "Signer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
