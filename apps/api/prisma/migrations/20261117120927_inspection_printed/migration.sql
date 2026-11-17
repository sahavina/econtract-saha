-- AlterTable
ALTER TABLE "InspectionRequest" ADD COLUMN     "printCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "printedById" UUID;

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
