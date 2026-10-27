-- Tự phê duyệt hợp đồng: yêu cầu duyệt ngay không gắn quy trình.
ALTER TABLE "ApprovalRequest" ALTER COLUMN "workflowId" DROP NOT NULL;

-- Quyền mới cho vai trò hệ thống Quản trị doanh nghiệp và Giám đốc của mọi doanh nghiệp.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'contract.self_approve' FROM "Role" r
WHERE r."code" IN ('tenant_admin', 'director')
ON CONFLICT DO NOTHING;
