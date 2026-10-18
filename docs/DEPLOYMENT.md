# Triển khai production

Hướng dẫn chạy SAHA eContract trên **một máy chủ Linux** bằng Docker Compose. Mọi thành phần nằm trong
`docker-compose.prod.yml`; chỉ Caddy mở cổng ra Internet.

```
Internet ──443──► caddy (HTTPS, Let's Encrypt)
                    └─► web :3000 (Next.js standalone; /api/v1/* rewrite)
                          └─► api :4000 (NestJS) ──► postgres :5432
                                                └──► minio :9000 (bucket riêng tư)
migrate: chạy một lần mỗi lần khởi động (prisma migrate deploy + bootstrap) rồi thoát
```

## 1. Yêu cầu

- Linux x86_64/arm64, Docker Engine 24+ với Compose v2; tối thiểu 2 vCPU, 4 GB RAM (build image Next.js cần ~2 GB).
- Tên miền trỏ bản ghi A/AAAA về máy chủ; mở cổng 80 và 443.
- Tài khoản SMTP (bắt buộc: email mời ký, OTP, thông báo).

## 2. Cài đặt lần đầu

```bash
git clone <repo> saha-econtract && cd saha-econtract
cp .env.production.example .env.production
```

Điền `.env.production`:

| Biến | Ghi chú |
| --- | --- |
| `DOMAIN`, `ACME_EMAIL` | Tên miền và email nhận thông báo chứng chỉ |
| `POSTGRES_PASSWORD` | Chỉ chữ/số (`openssl rand -hex 24`) vì nằm trong `DATABASE_URL` |
| `JWT_ACCESS_SECRET` | ≥ 32 ký tự ngẫu nhiên (`openssl rand -base64 48`); API từ chối giá trị mẫu |
| `MINIO_ROOT_*`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Root MinIO chỉ dùng để tạo bucket và tài khoản riêng cho API |
| `SMTP_*`, `MAIL_FROM` | Máy chủ gửi thư |
| `BOOTSTRAP_*` | Doanh nghiệp vận hành và tài khoản **Super Admin** đầu tiên |

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f migrate api
```

Khi `migrate` in "Đã tạo doanh nghiệp … và Super Admin …", mở `https://<DOMAIN>`, đăng nhập bằng mã doanh nghiệp
`BOOTSTRAP_TENANT_CODE` và tài khoản Super Admin, **đổi mật khẩu**, rồi xóa `BOOTSTRAP_ADMIN_PASSWORD` khỏi
`.env.production`. Bootstrap chỉ tạo tài khoản khi DB chưa có doanh nghiệp nào, chạy lại không ảnh hưởng.

Không chạy `prisma:seed` trên production: seed tạo dữ liệu demo với mật khẩu mặc định và sẽ tự từ chối khi
`NODE_ENV=production`.

### Máy chủ đã có reverse proxy (Caddy/nginx giữ cổng 80/443)

Dùng thêm `docker-compose.external-proxy.yml`: bỏ service caddy, không mở cổng console MinIO, web chỉ nghe
`127.0.0.1:${WEB_PORT:-3300}`.

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.external-proxy.yml --env-file .env.production up -d --build
```

Ví dụ với Caddy hệ thống (file riêng, ví dụ `/etc/caddy/local.d/econtract.caddy` nếu Caddyfile có `import`):

```
hopdong.example.vn {
	encode zstd gzip
	request_body {
		max_size 25MB
	}
	reverse_proxy 127.0.0.1:3300
}
```

Kiểm tra bằng `caddy validate --config /etc/caddy/Caddyfile` rồi `systemctl reload caddy`. Nếu tên miền đi qua Cloudflare,
để chế độ DNS only (hoặc cấu hình `trusted_proxies` cho dải IP Cloudflare) để nhật ký ghi đúng IP người dùng.

## 3. Kiểm tra sức khỏe

| Endpoint | Ý nghĩa |
| --- | --- |
| `GET /api/v1/health/live` | Tiến trình API còn chạy (healthcheck trong image) |
| `GET /api/v1/health` | DB và kho lưu trữ dùng được (`database`, `storage`, `storageDriver`); 503 nếu lỗi |

Khi khởi động, API ghi cảnh báo `[Config]` nếu cấu hình production chưa ổn (lưu file cục bộ, `APP_URL` không HTTPS).

## 4. Cập nhật phiên bản

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` chạy trước `api`; nếu migration lỗi, `api` bản mới không khởi động (xem `logs migrate`). Migration có thể
đã áp dụng một phần, vì vậy luôn **sao lưu DB trước khi cập nhật**. Đặt `APP_VERSION` để gắn tag image và có thể quay lại bản trước.

Lưu ý: `API_URL` của web được ghi cứng lúc build (`build-arg`), đổi tên service/cổng API thì phải build lại web.

## 5. Sao lưu & khôi phục

Hai nơi chứa dữ liệu: PostgreSQL (nghiệp vụ, nhật ký) và bucket MinIO (file tài liệu). Sao lưu **cả hai cùng thời điểm**.

```bash
# Postgres
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U saha -Fc saha_econtract > backup/db-$(date +%F).dump
# Khôi phục (vào DB trống)
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U saha -d saha_econtract --clean --if-exists < backup/db-YYYY-MM-DD.dump

# File: đồng bộ bucket ra thư mục (hoặc sang một S3 khác)
docker run --rm --network saha-econtract-prod_default -v "$PWD/backup/files:/backup" --entrypoint sh \
  minio/mc:RELEASE.2025-04-16T18-13-26Z -c \
  'mc alias set src http://minio:9000 "$U" "$P" && mc mirror --overwrite src/econtract /backup' \
  -e U=<MINIO_ROOT_USER> -e P=<MINIO_ROOT_PASSWORD>
```

Đưa bản sao lưu ra ngoài máy chủ (khác vùng/nhà cung cấp) và thử khôi phục định kỳ.

## 6. Lưu trữ file

`STORAGE_DRIVER`:

- `local` – thư mục `STORAGE_DIR` (mặc định ở môi trường dev). Trong image là `/data/storage`, cần mount volume bền vững.
- `s3` – S3 hoặc tương thích. Biến: `S3_BUCKET` (bắt buộc), `S3_ENDPOINT` (bỏ trống với AWS), `S3_REGION`,
  `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (bỏ trống ⇒ dùng IAM role), `S3_FORCE_PATH_STYLE` (`true` cho MinIO,
  `false` cho AWS), `S3_PREFIX` (ví dụ `econtract/`, kết thúc bằng `/`), `S3_SSE` (`AES256` | `aws:kms`).

Dùng AWS S3 thay MinIO: bỏ hai service `minio`, `minio-init` (và `depends_on` tương ứng), đặt `S3_ENDPOINT` rỗng,
`S3_FORCE_PATH_STYLE=false`, cấp quyền `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` trên bucket.

Chuyển từ `local` sang `s3`: driver không tự di chuyển dữ liệu. Chép nguyên cấu trúc thư mục lên bucket (key trong DB là
đường dẫn tương đối, ví dụ `<tenantId>/contracts/<contractId>/<uuid>`), cộng thêm `S3_PREFIX` nếu có:

```bash
mc mirror ./apps/api/storage local/econtract/   # hoặc local/econtract/<S3_PREFIX>
```

File không còn trong kho ⇒ tải tài liệu trả 404 "File tài liệu không còn trong kho lưu trữ".

## 7. Bảo mật – danh sách kiểm tra

- Chỉ Caddy (80/443) mở ra ngoài; Postgres, MinIO API, API, web chỉ trong mạng Docker. Console MinIO bind `127.0.0.1:9001`
  (truy cập qua `ssh -L 9001:127.0.0.1:9001`).
- Không expose trực tiếp cổng web/API: API tin `X-Forwarded-For` một tầng (`trust proxy 1`) để ghi IP vào nhật ký và
  chứng thư ký; proxy phía trước phải ghi đè header này (Caddy mặc định làm vậy).
- Cookie refresh có cờ `Secure` khi `NODE_ENV=production` ⇒ bắt buộc HTTPS.
- Bucket riêng tư (`mc anonymous set none`), API dùng tài khoản riêng thay cho root MinIO.
- Đổi `JWT_ACCESS_SECRET` ⇒ mọi access token hiện có mất hiệu lực (người dùng tự refresh lại phiên).
- Swagger (`/api/docs`) tắt ở production.

## 8. Giới hạn hiện tại

- Image Docker và `docker-compose.prod.yml` được kiểm tra bằng job `docker` trong CI (build image, `compose config`);
  chưa có kiểm thử end-to-end trên máy chủ thật – nên chạy thử trên staging trước.
- Một bản API (một tiến trình): job nhắc hạn hằng ngày chạy trong tiến trình API (`@nestjs/schedule`), **không scale
  nhiều bản API** khi chưa chuyển job sang hàng đợi có khóa (BullMQ/Redis), nếu không email nhắc hạn sẽ gửi trùng.
