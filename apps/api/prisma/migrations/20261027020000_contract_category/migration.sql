-- Phân loại hợp đồng: khách hàng / nhà cung cấp / lao động / khác.
CREATE TYPE "ContractCategory" AS ENUM ('CUSTOMER', 'SUPPLIER', 'LABOR', 'OTHER');

ALTER TABLE "Contract" ADD COLUMN "category" "ContractCategory";

CREATE INDEX "Contract_tenantId_category_idx" ON "Contract"("tenantId", "category");

-- Dữ liệu cũ: đơn đặt hàng là bán hàng.
UPDATE "Contract" SET "category" = 'CUSTOMER' WHERE "kind" = 'ORDER';

-- Loại hợp đồng có chữ "lao động".
UPDATE "Contract" c SET "category" = 'LABOR'
FROM "ContractType" t
WHERE c."category" IS NULL AND c."contractTypeId" = t."id" AND t."name" ILIKE '%lao động%';

-- Còn lại: theo phân loại trong danh mục của bên đối tác đầu tiên (không phải bên nội bộ) đã liên kết.
UPDATE "Contract" c SET "category" = (CASE p."type" WHEN 'CUSTOMER' THEN 'CUSTOMER' ELSE 'SUPPLIER' END)::"ContractCategory"
FROM (
  SELECT DISTINCT ON (cp."contractId") cp."contractId", pa."type"
  FROM "ContractParty" cp
  JOIN "Partner" pa ON pa."id" = cp."partnerId"
  WHERE cp."isInternal" = false AND pa."type" IN ('CUSTOMER', 'SUPPLIER')
  ORDER BY cp."contractId", cp."sortOrder"
) p
WHERE c."category" IS NULL AND c."id" = p."contractId";
