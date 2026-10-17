# SAHA eContract

Nền tảng **Hợp đồng điện tử & Quản lý vòng đời hợp đồng (CLM)** dạng SaaS multi-tenant cho hệ sinh thái SAHA.

## Cấu trúc monorepo

```
apps/
  api/        NestJS 12 + Prisma 7 (PostgreSQL) – REST API /api/v1, Swagger /api/docs
  web/        Next.js 16 (App Router) + Tailwind 4 + shadcn/ui + TanStack Query/Table
packages/
  shared/     Danh mục quyền, trạng thái, nhãn dùng chung giữa API và web
docs/         Kiến trúc, lộ trình
docker-compose.yml   PostgreSQL, Redis, MinIO (S3), Mailpit
```

## Yêu cầu

- Node.js ≥ 22, pnpm 11
- Docker (khuyến nghị) **hoặc** `prisma dev` (Postgres cục bộ không cần Docker)

## Chạy lần đầu

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm infra:up                  # Postgres/Redis/MinIO/Mailpit qua Docker
pnpm build                     # build @saha/shared (bắt buộc trước khi chạy dev)
pnpm db:migrate                # tạo schema
pnpm db:seed                   # dữ liệu mẫu
pnpm dev                       # API :4000, Web :3000
```

Không có Docker: chạy `npx prisma dev -n saha -d` trong `apps/api`, dán URL nó in ra vào `DATABASE_URL`
và đặt `DATABASE_POOL_MAX=1` (PGlite chỉ chịu một kết nối đồng thời).

Đăng nhập dev: mã doanh nghiệp `saha`, mật khẩu `Saha@123456` (đổi bằng `SEED_PASSWORD` khi seed):

| Email | Vai trò | Phạm vi |
| --- | --- | --- |
| admin@saha.vn | Quản trị doanh nghiệp | Toàn quyền |
| phapche@saha.vn | Pháp chế | Xem tất cả hợp đồng, xuất, lưu trữ, nhật ký |
| kinhdoanh@saha.vn | Nhân viên | Chỉ hợp đồng mình phụ trách/tạo |

## Lệnh thường dùng

| Lệnh | Mô tả |
| --- | --- |
| `pnpm dev` | Chạy API + web (watch) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Kiểm tra toàn repo |
| `pnpm --filter @saha/api prisma:studio` | Xem dữ liệu |
| `pnpm --filter @saha/api prisma:migrate` | Tạo migration mới sau khi sửa `schema.prisma` |

Xem [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) để biết kiến trúc, quy ước bảo mật và lộ trình.
