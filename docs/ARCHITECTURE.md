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
- API liên doanh nghiệp (`/platform/*`) gắn `@PlatformAdminOnly()`: chỉ user có `isPlatformAdmin` (Super Admin) gọi được;
  đây là ngoại lệ duy nhất được đọc/ghi dữ liệu của tenant khác, và mọi thao tác ghi đều vào nhật ký của tenant bị tác động.
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

### Ký điện tử

- Điều kiện: hợp đồng **Đã phê duyệt**. Khi gửi ký, nội dung được **đóng băng** (`SignatureRequest.contentSnapshot` =
  nội dung đã thay biến + danh sách tài liệu đính kèm kèm SHA-256) và băm **SHA-256** (`documentHash`). Biến thiếu dữ liệu ⇒ chặn gửi.
- Nhà cung cấp hiện có: `INTERNAL` (chữ ký điện tử): người ký nội bộ xác nhận bằng mật khẩu tài khoản; người ký bên ngoài
  mở liên kết `/sign/{token}` (chỉ lưu hash token, có thể cấp lại – vô hiệu link cũ) và xác thực **OTP 6 số qua email**
  (hiệu lực 10 phút, tối đa 5 lần sai, gửi lại sau 60 giây). Chữ ký vẽ tay (PNG) hoặc gõ họ tên + đồng ý ký điện tử.
- Ký lần lượt hoặc đồng thời; hạn ký (hết hạn xử lý "lười" khi truy cập). Ký hết ⇒ hợp đồng **Đang hiệu lực** (hoặc
  **Đã ký** nếu chưa tới ngày hiệu lực), ghi `signedDate`. Từ chối (bắt buộc lý do) / hủy / hết hạn ⇒ về **Đã phê duyệt** để gửi lại.
- Bằng chứng: mỗi người ký lưu thời điểm, IP, user-agent, phương thức, mã băm đã ký; chứng thư hiển thị trên bản đã ký;
  nhật ký ghi cả hành động của người ký bên ngoài (`AuditService.logExternal`). Không được xóa tài liệu sau khi ký xong;
  khóa thay đổi tài liệu khi đang chờ ký.
- Hợp đồng chỉ gồm tệp tải lên (không soạn nội dung) ký được như thường: snapshot là bảng tài liệu đính kèm. Trang ký công khai
  liệt kê đúng các tệp đã đóng băng (khớp cả tên, phiên bản, SHA-256 – `frozenAttachments`) qua
  `GET /public/sign/:token/documents/:id`; đối tác xem PDF/ảnh ngay trên trang, tải bản gốc, trình duyệt tự đối chiếu SHA-256
  với mã đã đóng băng; mỗi lần mở ghi nhật ký `contract.signature_document_view`. Trang nhắc (không chặn) nếu chưa mở hết tệp.
- Tạo hợp đồng từ tệp: `/contracts/new?from=file` (menu "Tạo hợp đồng từ file") – chọn/kéo thả tệp ngay trên form, tạo hợp đồng
  rồi tải từng tệp lên (tệp lỗi được báo riêng, hợp đồng vẫn giữ), mở tab Tài liệu. Form tạo thường cũng có ô đính kèm tùy chọn.
- Email: `MailService.send(tenantId, …)` dùng SMTP riêng của doanh nghiệp (Cấu hình → Email, `TenantIntegration` provider
  `smtp`, mật khẩu mã hóa bằng `INTEGRATION_SECRET`, có nút gửi thử), không có thì dùng `SMTP_*` của máy chủ (Mailpit trong
  docker-compose). `SMTP_HOST` kết thúc bằng `.invalid` coi như chưa cấu hình. Chưa có SMTP nào: dev ghi email ra log API,
  production báo lỗi "Chưa cấu hình máy chủ gửi email" (không ghi OTP ra log).
- **Chưa có**: chữ ký số có chứng thư CA (VNPT-CA, Viettel-CA, FPT-CA…), dấu thời gian (TSA), xuất PDF/A có nhúng chữ ký phía server.
  Trường `SignatureRequest.provider` dành cho việc tích hợp các nhà cung cấp này.

### Khách hàng xem trước & góp ý

- Tab "Khách hàng góp ý" ở chi tiết hợp đồng: tạo **link xem trước** công khai (`contract.share`) cho bên đối tác không có tài khoản.
  Token ngẫu nhiên 32 byte, DB chỉ lưu hash SHA-256 (`ContractShareLink`), hạn 1–90 ngày, thu hồi được; link chỉ hiển thị một lần
  (sao chép ngay), gửi email kèm link nếu SMTP đã cấu hình. Không tạo/mở được cho hợp đồng đã hủy, thanh lý, lưu trữ hoặc trong thùng rác.
- Trang `/preview/{token}` (API `GET /public/preview/:token`, tenant suy ra từ token): thông tin chung, các bên, nội dung **bản hiện tại**
  đã thay biến (biến trống hiển thị "……"), chỉ đọc. Mỗi lần xem tăng `viewCount`; nhật ký `contract.preview_view` tối đa 1 lần/giờ/link.
- Khách gửi **yêu cầu bổ sung/thay đổi** (họ tên, email/điện thoại, điều khoản/đoạn liên quan, nội dung ≤ 4000 ký tự) hoặc **đồng ý nội dung**
  (`ContractFeedback`) khi hợp đồng còn Nháp / Chờ duyệt / Đã phê duyệt. Mỗi ý kiến lưu phiên bản (`ContractRevision.seq`) và SHA-256 phần khách
  đã xem ⇒ nội bộ thấy cảnh báo khi hợp đồng đã sửa sau đó; "đồng ý" chỉ nhận cho đúng bản hiện tại (409 nếu đã đổi).
  Chống spam: 5 lần/phút/IP, 20 giây giữa hai lần gửi và tối đa 20 ý kiến/24 giờ trên một link, chặn trùng lặp, ô bẫy bot.
- Ý kiến mới ⇒ thông báo trong ứng dụng cho người phụ trách, người tạo hợp đồng và người tạo link; badge số yêu cầu mới trên tab.
  Nội bộ đánh dấu đã xử lý kèm phản hồi (khách thấy phản hồi trên trang xem trước) hoặc mở lại.

### Vòng đời hợp đồng

- **Phụ lục** (`ContractAppendix`, số `{mã HĐ}-PL01`): sửa đổi/bổ sung, gia hạn (bắt buộc ngày hết hạn mới, phải sau ngày hiện tại),
  điều chỉnh giá trị (+/−). Chuyển "Có hiệu lực" ⇒ cập nhật `expiryDate`/`value` của hợp đồng (ghi nhật ký trước → sau);
  gia hạn hợp đồng đã hết hiệu lực ⇒ Đang hiệu lực trở lại. Phụ lục hiện được ký ngoài hệ thống (chưa đi qua luồng ký).
- **Nghĩa vụ** (bên thực hiện, người phụ trách, hạn, tiến độ %, trạng thái; 100% ⇒ Hoàn thành) và **biên bản nghiệm thu**.
- **Lịch thanh toán** theo đợt; ghi nhận thu (không vượt số còn phải thu), Thanh toán một phần/đủ, số hóa đơn; cảnh báo tổng
  lịch lệch giá trị hợp đồng; quá hạn tính theo ngày.
- **Thanh lý** (`contract.liquidate`): chỉ hợp đồng đã ký; còn thanh toán/nghĩa vụ/phụ lục nháp ⇒ trả cảnh báo, cần xác nhận
  (`force`). Sau thanh lý mọi dữ liệu vòng đời chỉ đọc.
- **Tác vụ hằng ngày** (`LifecycleJobs`, 01:00 giờ VN + khi khởi động; chạy tay `POST /lifecycle/jobs/run`): Đã ký → Đang hiệu lực
  khi tới ngày hiệu lực; Đang hiệu lực → Hết hiệu lực khi quá hạn; email nhắc hết hạn (30/7/1 ngày), thanh toán & nghĩa vụ sắp
  đến hạn (3 ngày) / quá hạn. `ReminderLog` chống gửi trùng.
- Trang **Vòng đời** (tổng hợp liên hợp đồng theo nhóm/bộ lọc) và **Lịch hợp đồng** (theo tháng).

### Thông báo & báo cáo

- **Thông báo trong ứng dụng** (`Notification`, `NotificationsService.notify` – ghi cùng transaction nghiệp vụ): đến lượt phê duyệt,
  kết quả phê duyệt (người gửi + người phụ trách), đến lượt ký nội bộ, ký hoàn tất / bị từ chối ký, nhắc hạn của job hằng ngày.
  Chuông ở header (số chưa đọc cập nhật mỗi phút), trang Thông báo; người dùng chỉ đọc/đánh dấu thông báo của chính mình.
- **Báo cáo** (`report.view`, cấp cho Quản trị, Pháp chế, Kế toán, Giám đốc, Tổng giám đốc): theo phòng ban (số lượng, giá trị,
  đã ký, thời gian phê duyệt/ký trung bình), loại hợp đồng, top nhân viên, top đối tác Bên B, trạng thái, thanh toán & công nợ quá hạn.
  Lọc theo ngày tạo, phòng ban, loại; luôn áp phạm vi xem của người dùng; xuất CSV từng bảng.

### Quản trị

- Người dùng (`user.view`/`user.manage`): tạo với mật khẩu ban đầu (≥ 8 ký tự, có chữ và số), gán nhiều vai trò, phòng ban,
  chi nhánh; khóa/vô hiệu ⇒ thu hồi mọi phiên; đặt lại mật khẩu ⇒ thu hồi phiên. Không được tự khóa hoặc tự đổi vai trò.
- Người dùng tự đổi mật khẩu (menu tài khoản) ⇒ đăng xuất mọi thiết bị.
- Vai trò (`role.manage`): ma trận quyền theo nhóm; vai trò `tenant_admin` luôn có toàn bộ quyền (tính lúc nạp phiên,
  kể cả quyền thêm sau). Không xóa vai trò hệ thống, vai trò đang gán, hoặc đang dùng trong quy trình duyệt.
- Phòng ban/chi nhánh (`org.manage`): trưởng phòng (dùng cho bước duyệt "Trưởng phòng"), cây phòng ban có chặn vòng lặp.
- Cấu hình (`settings.manage`): loại hợp đồng và mẫu mã, xem trước mã theo thời gian thực (hàm sinh mã dùng chung ở `@saha/shared`).

### Super Admin & gói dịch vụ

- Doanh nghiệp (`/platform/tenants`): tạo mới kèm vai trò hệ thống, loại hợp đồng mặc định (`src/platform/default-roles.ts`,
  dùng chung với seed), tài khoản quản trị đầu tiên và subscription; sửa thông tin; tạm ngưng/đóng ⇒ thu hồi mọi phiên,
  người dùng không đăng nhập được. Không tạm ngưng được doanh nghiệp chứa chính tài khoản Super Admin.
- Gói (`Plan`): hạn mức người dùng (không tính tài khoản vô hiệu), hợp đồng tạo trong năm (tính cả hợp đồng đã xóa),
  dung lượng (tổng kích thước tài liệu, kể cả bản đã xóa mềm vì file vẫn lưu), đơn giá/tháng.
- Subscription hiệu lực = mới nhất có trạng thái TRIAL/ACTIVE/PAST_DUE, đã bắt đầu, chưa kết thúc. Đổi gói/gia hạn
  ⇒ gói đang chạy kết thúc tại ngày gói mới bắt đầu (gói hẹn trước bị hủy).
- `PlanLimitsService` (module toàn cục) chặn tạo hợp đồng, thêm/kích hoạt lại người dùng, tải tài liệu khi vượt hạn mức
  hoặc không có subscription hiệu lực (403 kèm thông điệp); dữ liệu hiện có vẫn xem/xử lý bình thường.
- Hóa đơn (`Invoice`): số `INV-YYYYMM-NNNN` theo kỳ, mặc định đơn giá gói × số tháng, hạn 15 ngày; ghi nhận thanh toán
  hoặc hủy (kèm lý do) chỉ từ trạng thái chờ thanh toán; "quá hạn" là trạng thái suy ra.
- Tổng quan nền tảng: số doanh nghiệp, MRR theo đơn giá gói, công nợ, thuê bao sắp hết hạn; nhật ký hệ thống liên tenant.
- Phía doanh nghiệp: trang **Gói dịch vụ** (`settings.manage`) xem gói, mức sử dụng, hóa đơn.

### Tích hợp Odoo (chỉ đọc)

- Cấu hình theo doanh nghiệp ở Cấu hình → Tích hợp Odoo (`settings.manage`): URL, database, tài khoản, API key. API key mã hóa
  AES-256-GCM bằng `INTEGRATION_SECRET` (`TenantIntegration.secretEnc`), không bao giờ trả về client.
- URL chỉ HTTPS và không trỏ vào địa chỉ nội bộ (chống SSRF), kiểm tra lại mỗi lần gọi; `INTEGRATION_ALLOW_PRIVATE_HOSTS` chỉ dùng khi dev.
- Gọi Odoo qua JSON-RPC `/jsonrpc` (`common.authenticate`, `object.execute_kw` trên `res.partner`): tìm đối tác cấp cao nhất theo
  tên/MST/email/mã, lọc khách hàng (`customer_rank > 0`) hoặc nhà cung cấp (`supplier_rank > 0`).
- Chọn một đối tác ⇒ nhập vào danh mục với `externalRef = "odoo:<id>"` (duy nhất trong doanh nghiệp); nhập lại hoặc "Cập nhật từ Odoo"
  ghi đè thông tin, khôi phục bản đã xóa mềm. Mã đối tác = Reference của Odoo nếu chưa trùng, ngược lại `ODOO-<id>`.
- Không ghi ngược về Odoo. Odoo 20 dự kiến bỏ JSON-RPC cũ – khi đó chuyển sang API `/json/2`.

### Lưu trữ & triển khai

- `StorageService` chọn driver theo `STORAGE_DRIVER`: `local` (thư mục, chặn path traversal) hoặc `s3` (S3/MinIO,
  tiền tố key, mã hóa phía server tùy chọn). Key do backend sinh, được kiểm tra định dạng ở cả hai driver.
- Health: `/health/live` (tiến trình) và `/health` (DB + kho lưu trữ, timeout 3 giây).
- Production: `docker-compose.prod.yml` (Caddy HTTPS → web standalone → API → Postgres/MinIO), image ở `infra/docker`,
  `prisma/bootstrap.ts` tạo gói mặc định + doanh nghiệp/Super Admin đầu tiên. Xem `docs/DEPLOYMENT.md`.

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
- Ký điện tử: gửi ký (nội bộ + đối tác), ký lần lượt/đồng thời, OTP email, chữ ký vẽ/gõ, từ chối, hủy, cấp lại liên kết,
  bản đã ký + chứng thư, danh sách yêu cầu ký theo trạng thái.
- Quản trị: người dùng, phòng ban & chi nhánh, vai trò & phân quyền, loại hợp đồng & mẫu mã, đổi mật khẩu.
- Vòng đời: phụ lục/gia hạn, nghĩa vụ & tiến độ, nghiệm thu, lịch thanh toán, thanh lý, tự động hiệu lực/hết hạn, nhắc hạn, lịch hợp đồng.
- Thông báo trong ứng dụng và báo cáo quản trị.
- Super Admin: doanh nghiệp, gói dịch vụ & hạn mức, subscription, hóa đơn thuê bao, tổng quan, nhật ký hệ thống.
- Đối tác: danh sách theo loại, thêm/sửa/xóa mềm.
- Nhật ký hoạt động.

Các mục menu chưa triển khai hiển thị mờ kèm nhãn "Sắp có" (không có nút giả).

## 8. Lộ trình đề xuất

1. Hoàn thiện soạn thảo: quét virus (ClamAV), chuyển DOCX → PDF chuẩn để ký, xuất PDF phía server,
   header/footer, chèn hình ảnh, quản lý & so sánh phiên bản nội dung; wizard 6 bước.
2. Mở rộng mẫu: định dạng ngày/số/tiền tệ theo biến, so sánh phiên bản, trình thiết kế mẫu kéo thả.
3. Phê duyệt nâng cao: trình thiết kế kéo thả, điều kiện tùy biến, thông báo (BullMQ + email/Zalo), nhắc hạn, ủy quyền duyệt.
4. Tích hợp chữ ký số CA (VNPT/Viettel/FPT) + TSA, xuất PDF/A ký số phía server, thông báo nhắc ký.
5. Vòng đời nâng cao: ký phụ lục qua luồng ký điện tử, thông báo trong ứng dụng, đối soát thanh toán với kế toán/ERP.
6. Quản trị nâng cao: mời người dùng qua email, SSO, tích hợp CRM/ERP; thanh toán trực tuyến hóa đơn thuê bao,
   tự chuyển PAST_DUE/EXPIRED theo hóa đơn quá hạn, xuất hóa đơn điện tử.

> Ghi chú: file master prompt nguồn kết thúc giữa mục 12.2 (Workflow phê duyệt). Các phần sau đó cần bổ sung
> trước khi thiết kế chi tiết giai đoạn 3 trở đi.
