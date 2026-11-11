-- Quyền mới: mở lại hợp đồng đã phê duyệt để chỉnh sửa (mặc định cho Quản trị doanh nghiệp của mọi doanh nghiệp).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'contract.reopen_approved' FROM "Role" r
WHERE r."code" = 'tenant_admin'
ON CONFLICT DO NOTHING;
