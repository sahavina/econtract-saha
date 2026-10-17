# Kiến trúc SAHA eContract

## 1. Lựa chọn công nghệ

Theo đề xuất của master prompt (dự án mới, chưa có nền tảng cũ):

| Lớp | Công nghệ | Lý do |
| --- | --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript | Định tuyến lồng nhau, layout, hệ sinh thái lớn |
| UI | Tailwind 4, shadcn/ui (Radix), lucide | Component tái sử dụng, dark mode qua CSS variables |
| Dữ liệu client | TanStack Query, TanStack Table, React Hook Form + Zod | Cache/invalidations, bảng server-side, validation đồng bộ với backend |
| Biểu đồ | Recharts | Đủ cho dashboard KPI |
| Backend | NestJS 12 (ESM), REST, OpenAPI | Module hóa rõ ràng, guard/pipe/filter cho phân quyền & validation |
| ORM/DB | Prisma 7 (driver adapter `pg`) + PostgreSQL 17 | Migration có kiểm soát, kiểu an toàn, Decimal cho tiền |
| Hạ tầng | Redis, MinIO (S3), Mailpit, Docker | Chuẩn bị cho BullMQ, lưu trữ file, email (chưa dùng ở giai đoạn 0) |

## 2. Multi-tenant & bảo mật

- Mọi bảng nghiệp vụ có `tenantId`. **tenantId chỉ lấy từ JWT** (`AuthUser.tenantId`), không bao giờ từ body/query.
- `JwtStrategy` nạp lại user + quyền từ DB mỗi request ⇒ khóa tài khoản/đổi quyền có hiệu lực ngay.
- Mọi ID tham chiếu từ client (loại HĐ, phòng ban, người phụ trách, đối tác) được kiểm tra thuộc cùng tenant
  (`ContractsService.assertReferences`). Truy cập tài nguyên tenant khác trả về 404.
- Phạm vi xem hợp đồng: `contract.view_all` (toàn tenant) hoặc `contract.view_own` (mình phụ trách/tạo).
- Guard toàn cục: `ThrottlerGuard` → `JwtAuthGuard` (bỏ qua với `@Public()`) → `PermissionsGuard`
  (`@RequirePermissions` / `@RequireAnyPermission`). Danh mục quyền: `packages/shared/src/permissions.ts`.
- Đăng nhập: bcrypt, khóa 15 phút sau 5 lần sai, so sánh hash giả khi không có user (chống dò tài khoản).
- Access token JWT 15 phút trong bộ nhớ trình duyệt; refresh token ngẫu nhiên, lưu **hash SHA-256**, cookie httpOnly
  `SameSite=Lax` path `/api/v1/auth`, **xoay vòng** mỗi lần refresh; dùng lại token cũ ⇒ thu hồi mọi phiên.
- Web gọi API qua rewrite cùng origin (`/api/v1/*` → API) để cookie hoạt động mà không cần CORS credentials.
- Lỗi được chuẩn hóa (`AllExceptionsFilter`): 400 kèm `errors[{field,message}]`, 409 trùng mã, ẩn lỗi 500.
- Xuất CSV chống formula injection; helmet; giới hạn tần suất đăng nhập.

## 3. Nhật ký hoạt động

`AuditService.log()` ghi trong **cùng transaction** với thao tác nghiệp vụ. Không có API sửa/xóa nhật ký.
Timeline hợp đồng (`GET /contracts/:id/timeline`) và trang Nhật ký hoạt động đọc từ bảng `AuditLog`.

## 4. Mã hợp đồng

Mẫu cấu hình theo loại hợp đồng (`ContractType.codePattern`), mặc định `HD-{YYYY}-{SEQUENCE:5}`.
Token: `{TYPE} {DEPT} {BRANCH} {YYYY} {YY} {MM} {SEQUENCE[:n]}`. Bộ đếm tách theo phần đã thay ngữ cảnh
(ví dụ có `{YYYY}` thì tự reset theo năm) và tăng nguyên tử bằng `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
Ràng buộc `@@unique([tenantId, code])` đảm bảo không trùng; xung đột được thử lại.

## 5. Quy tắc nghiệp vụ hiện có

- Chỉ sửa được hợp đồng **Nháp** (phê duyệt chưa gửi/bị từ chối/yêu cầu sửa), chưa lưu trữ/xóa.
- Chỉ xóa mềm hợp đồng **Nháp** hoặc **Đã hủy**; khôi phục từ Thùng rác.
- Lưu ý Zod 4: `.partial()` vẫn áp `default()` ⇒ schema cập nhật dựng từ object **không default**
  (có test hồi quy trong `contract-code.spec.ts`).

## 6. Hiện trạng (Giai đoạn 0 – nền tảng)

Đã có, chạy với dữ liệu thật:

- Đăng nhập/refresh/đăng xuất, hồ sơ người dùng, RBAC theo vai trò.
- Dashboard: 12 KPI, biểu đồ số lượng & giá trị theo tháng, phân bố trạng thái, hợp đồng sắp hết hạn,
  hoạt động gần đây, bộ lọc thời gian/phòng ban/nhân viên/loại HĐ.
- Hợp đồng: danh sách (tìm kiếm, lọc, sắp xếp, phân trang server-side, ẩn/hiện cột, xem nhanh, chọn nhiều,
  lưu trữ/xóa hàng loạt, xuất CSV), tạo/sửa (thông tin chung + các bên, chọn đối tác tự điền), chi tiết
  (tổng quan, các bên, lịch sử), sao chép, lưu trữ, thùng rác.
- Đối tác: danh sách theo loại, thêm/sửa/xóa mềm.
- Nhật ký hoạt động.

Các mục menu chưa triển khai hiển thị mờ kèm nhãn "Sắp có" (không có nút giả).

## 7. Lộ trình đề xuất

1. Wizard 6 bước đầy đủ: nội dung (Tiptap, mẫu, upload DOCX/PDF), tài liệu đính kèm (S3, SHA-256, quét virus).
2. Mẫu hợp đồng + biến dữ liệu `{{contract.*}}`, thư viện điều khoản có phiên bản.
3. Workflow phê duyệt cấu hình được (ngưỡng giá trị, tuần tự/song song, điều kiện) + BullMQ, thông báo.
4. Ký điện tử qua Signature Provider Gateway, khóa nội dung phiên bản đã ký.
5. Vòng đời: phụ lục, gia hạn, nghĩa vụ, thanh toán, nghiệm thu, thanh lý; job tự chuyển ACTIVE/EXPIRED.
6. Quản trị: người dùng, phòng ban, vai trò, cấu hình mẫu mã, tích hợp CRM/ERP; Super Admin (tenant, gói, billing).

> Ghi chú: file master prompt nguồn kết thúc giữa mục 12.2 (Workflow phê duyệt). Các phần sau đó cần bổ sung
> trước khi thiết kế chi tiết giai đoạn 3 trở đi.
