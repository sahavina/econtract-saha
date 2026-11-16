-- Người phụ trách đối tác (tùy chọn).
ALTER TABLE "Partner" ADD COLUMN "ownerId" UUID;

ALTER TABLE "Partner" ADD CONSTRAINT "Partner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Partner_tenantId_ownerId_idx" ON "Partner"("tenantId", "ownerId");
