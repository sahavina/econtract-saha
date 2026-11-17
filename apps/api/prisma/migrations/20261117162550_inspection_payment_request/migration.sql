-- AlterTable
ALTER TABLE "InspectionRequest" ADD COLUMN     "paymentRequestId" UUID,
ALTER COLUMN "contractId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "InspectionRequest_paymentRequestId_idx" ON "InspectionRequest"("paymentRequestId");

-- AddForeignKey
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mỗi yêu cầu kiểm tra phải gắn ít nhất một hồ sơ (hợp đồng/đơn hoặc đề nghị thanh toán).
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_target_check" CHECK ("contractId" IS NOT NULL OR "paymentRequestId" IS NOT NULL);
