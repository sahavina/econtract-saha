# SAHA eContract – hướng dẫn cho Claude

- Monorepo pnpm: `apps/api` (NestJS 12 ESM + Prisma 7), `apps/web` (Next.js 16), `packages/shared`.
- Đọc `docs/ARCHITECTURE.md` trước khi thêm module. Next.js 16 có thay đổi API: xem `apps/web/AGENTS.md`
  và tài liệu kèm trong `node_modules/next/dist/docs/`.
- Ngôn ngữ giao diện, thông báo lỗi, comment nghiệp vụ: **tiếng Việt**.

## Quy ước bắt buộc

- tenantId chỉ lấy từ `@CurrentUser()`; kiểm tra mọi ID tham chiếu thuộc cùng tenant.
- Mỗi endpoint khai báo quyền bằng `@RequirePermissions`/`@RequireAnyPermission`; quyền mới thêm vào
  `packages/shared/src/permissions.ts` (kèm nhãn) và vai trò trong `apps/api/prisma/seed.ts`.
- Validate input bằng `ZodPipe(schema)`; schema cập nhật dựng từ object không có `.default()` (Zod 4 `.partial()` vẫn áp default).
- Thao tác ghi dữ liệu nghiệp vụ phải gọi `AuditService.log(user, …, tx)` trong cùng transaction.
- Không tạo nút/menu giả: chức năng chưa có thì để mục menu không có `href` (hiển thị "Sắp có").
- Import nội bộ trong API dùng đuôi `.js` (ESM nodenext). Sau khi sửa `packages/shared` chạy `pnpm --filter @saha/shared build`.
- Kiểm tra trước khi xong việc: `pnpm typecheck && pnpm lint && pnpm test`.
