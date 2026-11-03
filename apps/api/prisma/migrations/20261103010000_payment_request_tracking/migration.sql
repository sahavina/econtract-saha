-- Theo dõi gửi khách và thanh toán của đề nghị thanh toán.
ALTER TABLE "PaymentRequest"
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "sentById" UUID,
  ADD COLUMN "sentMethod" TEXT,
  ADD COLUMN "sentTo" TEXT,
  ADD COLUMN "sentNote" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paidById" UUID;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
