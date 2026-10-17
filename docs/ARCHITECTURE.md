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

## 5. Nội dung & tài liệu

- Nội dung soạn bằng Tiptap, lưu `Contract.contentHtml`. Backend **làm sạch HTML** (`sanitize-content.ts`, allowlist thẻ
  định dạng/bảng, chỉ cho `text-align`) trước khi lưu ⇒ an toàn khi render lại.
- Biến dữ liệu `{{contract.*}}`, `{{party_a.*}}`, `{{party_b.*}}` định nghĩa trong `packages/shared/src/template.ts`
  (`renderTemplate` escape giá trị, đánh dấu biến thiếu/không hỗ trợ). Xem trước A4 và "In / Lưu PDF" qua trình duyệt.
- Tài liệu đính kèm (`ContractDocument`): kiểm tra đuôi file + magic bytes (PDF/DOCX/XLSX/PNG/JPG, ≤ 20 MB), MIME lấy
  theo bảng của server, SHA-256, tăng phiên bản khi trùng tên, xóa mềm, tải xuống kiểm tra phạm vi hợp đồng.
  Lưu file qua `StorageService` (driver local `STORAGE_DIR`; S3/MinIO là bước tiếp theo). Chưa có quét virus
  ⇒ trạng thái `NOT_SCANNED`.

### Mẫu hợp đồng & thư viện điều khoản

- `ContractTemplate`: Nháp → Đang sử dụng → Lưu trữ. Giới hạn theo phòng ban (`departmentIds`, rỗng = tất cả),
  danh sách **biến bắt buộc** (`requiredVariables`). Kích hoạt yêu cầu nội dung không rỗng và không có biến lạ.
- Phiên bản mẫu: ảnh chụp `ContractTemplateVersion` khi kích hoạt và mỗi lần sửa nội dung mẫu đang sử dụng (tăng `version`).
  Hợp đồng lập từ mẫu **sao chép** nội dung và lưu `templateId` + `templateVersion` ⇒ sửa mẫu không ảnh hưởng hợp đồng cũ.
- Người chỉ có quyền tạo hợp đồng (không có `template.view`) chỉ thấy mẫu đang sử dụng mà phòng ban mình được dùng.
- `Clause`: Nháp → Chờ duyệt → Đã duyệt / Bị từ chối (bắt buộc lý do) → Lưu trữ. Quyền duyệt `clause.approve`;
  **không được tự duyệt** điều khoản do mình soạn. Sửa điều khoản đã duyệt ⇒ phiên bản mới ở trạng thái Nháp;
  mỗi lần duyệt lưu ảnh chụp `ClauseVersion`. Chỉ điều khoản Đã duyệt chèn được vào hợp đồng/mẫu.

### Quy trình phê duyệt

- `ApprovalWorkflow` (Quản trị → Quy trình phê duyệt, quyền `workflow.manage`): điều kiện theo loại hợp đồng và khoảng
  giá trị `[minValue, maxValue)`, độ ưu tiên; các bước chạy **tuần tự**, trong một bước duyệt **song song** với chế độ
  "một người là đủ" (ANY) hoặc "tất cả" (ALL). Người duyệt: trưởng phòng ban phụ trách hợp đồng, theo vai trò/chức danh,
  hoặc người dùng chỉ định; hạn xử lý theo giờ. Ngưỡng giá trị cấu hình được (seed sẵn 3 quy trình theo ví dụ đặc tả).
- Gửi duyệt (`contract.update`): kiểm tra Bên A/B, phòng ban, có nội dung hoặc tài liệu, dữ liệu bắt buộc của mẫu; chọn
  quy trình khớp đầu tiên; giải quyết người duyệt và lưu **ảnh chụp** (`stepsSnapshot`) ⇒ sửa quy trình không ảnh hưởng
  yêu cầu đang chạy. Người gửi không tự duyệt; nếu người gửi là trưởng phòng thì bước trưởng phòng được bỏ qua.
- Người duyệt: Phê duyệt / Từ chối / Yêu cầu chỉnh sửa (2 lựa chọn sau bắt buộc ý kiến). Từ chối/yêu cầu sửa ⇒ hợp đồng
  về Nháp để sửa và gửi lại; duyệt hết bước cuối ⇒ hợp đồng **Đã phê duyệt**. Người gửi/phụ trách được rút lại.
- Khi đang chờ duyệt: khóa sửa nội dung, thông tin và tài liệu. Người được giao duyệt xem được hợp đồng dù chỉ có quyền
  `contract.view_own`. Xử lý đồng thời dùng khóa lạc quan (`updateMany` theo trạng thái).
- "Công việc của tôi" và widget dashboard liệt kê nhiệm vụ chờ xử lý; KPI "Quá hạn xử lý" tính bước duyệt quá hạn.
- Giới hạn hiện tại: chưa có trình thiết kế kéo thả (node Condition/Notification/Signature), chưa gửi thông báo
  email/Zalo khi đến lượt duyệt; đặc tả nguồn bị cắt sau mục 12.2 nên các quy tắc chi tiết hơn cần bổ sung.

## 6. Quy tắc nghiệp vụ hiện có

- Chỉ sửa được hợp đồng **Nháp** (phê duyệt chưa gửi/bị từ chối/yêu cầu sửa), chưa lưu trữ/xóa.
- Chỉ xóa mềm hợp đồng **Nháp** hoặc **Đã hủy**; khôi phục từ Thùng rác.
- Lưu ý Zod 4: `.partial()` vẫn áp `default()` ⇒ schema cập nhật dựng từ object **không default**
  (có test hồi quy trong `contract-code.spec.ts`).

## 7. Hiện trạng

Đã có, chạy với dữ liệu thật:

- Đăng nhập/refresh/đăng xuất, hồ sơ người dùng, RBAC theo vai trò.
- Dashboard: 12 KPI, biểu đồ số lượng & giá trị theo tháng, phân bố trạng thái, hợp đồng sắp hết hạn,
  hoạt động gần đây, bộ lọc thời gian/phòng ban/nhân viên/loại HĐ.
- Hợp đồng: danh sách (tìm kiếm, lọc, sắp xếp, phân trang server-side, ẩn/hiện cột, xem nhanh, chọn nhiều,
  lưu trữ/xóa hàng loạt, xuất CSV), tạo/sửa (thông tin chung + các bên, chọn đối tác tự điền), chi tiết
  (tổng quan, các bên, lịch sử), sao chép, lưu trữ, thùng rác.
- Nội dung hợp đồng: trình soạn thảo (tiêu đề H1–H6, định dạng, danh sách, căn lề, bảng, chèn biến, undo/redo),
  tự lưu nháp, xem trước A4, in/lưu PDF. Tài liệu đính kèm: tải lên/tải xuống/xóa, phiên bản, SHA-256.
- Mẫu hợp đồng: danh sách, soạn mẫu, biến bắt buộc, phòng ban được dùng, kích hoạt/lưu trữ/xóa, lịch sử phiên bản;
  tạo hợp đồng từ mẫu với cảnh báo thiếu dữ liệu bắt buộc.
- Thư viện điều khoản: soạn, gửi duyệt, duyệt/từ chối, phiên bản đã duyệt; chèn điều khoản vào hợp đồng và mẫu.
- Phê duyệt: cấu hình quy trình theo giá trị/loại HĐ, gửi duyệt, duyệt nhiều cấp/song song, từ chối, yêu cầu sửa,
  rút lại, lịch sử phê duyệt, Công việc của tôi.
- Đối tác: danh sách theo loại, thêm/sửa/xóa mềm.
- Nhật ký hoạt động.

Các mục menu chưa triển khai hiển thị mờ kèm nhãn "Sắp có" (không có nút giả).

## 8. Lộ trình đề xuất

1. Hoàn thiện soạn thảo: driver S3/MinIO, quét virus (ClamAV), chuyển DOCX → PDF chuẩn để ký, xuất PDF phía server,
   header/footer, chèn hình ảnh, quản lý & so sánh phiên bản nội dung; wizard 6 bước.
2. Mở rộng mẫu: định dạng ngày/số/tiền tệ theo biến, so sánh phiên bản, trình thiết kế mẫu kéo thả.
3. Phê duyệt nâng cao: trình thiết kế kéo thả, điều kiện tùy biến, thông báo (BullMQ + email/Zalo), nhắc hạn, ủy quyền duyệt.
4. Ký điện tử qua Signature Provider Gateway, khóa nội dung phiên bản đã ký.
5. Vòng đời: phụ lục, gia hạn, nghĩa vụ, thanh toán, nghiệm thu, thanh lý; job tự chuyển ACTIVE/EXPIRED.
6. Quản trị: người dùng, phòng ban, vai trò, cấu hình mẫu mã, tích hợp CRM/ERP; Super Admin (tenant, gói, billing).

> Ghi chú: file master prompt nguồn kết thúc giữa mục 12.2 (Workflow phê duyệt). Các phần sau đó cần bổ sung
> trước khi thiết kế chi tiết giai đoạn 3 trở đi.
