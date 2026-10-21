-- AlterEnum
ALTER TYPE "SignMethod" ADD VALUE 'MISA_ESIGN';

-- AlterTable
ALTER TABLE "EsignSession" ADD COLUMN     "signerId" UUID;

-- AlterTable
ALTER TABLE "SignatureRequest" ADD COLUMN     "signedDocumentId" UUID;

-- AlterTable
ALTER TABLE "Signer" ADD COLUMN     "evidence" JSONB;

