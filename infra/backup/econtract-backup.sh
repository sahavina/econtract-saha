#!/usr/bin/env bash
# Sao lưu SAHA eContract (chạy bằng root trên máy chủ, ví dụ qua /etc/cron.d):
#   1. Postgres: pg_dump định dạng custom, kiểm tra đọc lại được (pg_restore --list) rồi mới giữ.
#   2. File tài liệu: đồng bộ dồn bucket MinIO ra thư mục (không xóa ở bản sao – tài liệu chỉ xóa mềm).
#   3. Cấu hình: bản sao .env.production (cần để khôi phục MinIO/JWT).
#   4. Xóa bản dump/cấu hình cũ hơn KEEP_DAYS ngày.
# Khôi phục: xem docs/DEPLOYMENT.md, mục "Sao lưu & khôi phục".
set -euo pipefail
umask 077

APP_DIR=${APP_DIR:-/srv/econtract/app}
ENV_FILE=${ENV_FILE:-/srv/econtract/.env.production}
DEST=${DEST:-/srv/backups/econtract}
KEEP_DAYS=${KEEP_DAYS:-14}
PROJECT=${PROJECT:-econtract}
MINIO_IMAGE=${MINIO_IMAGE:-minio/minio:RELEASE.2025-04-22T22-12-26Z}

log() { echo "$(date '+%F %T') $*"; }
# Đọc một biến từ file env mà không source cả file (file có cả mật khẩu khởi tạo).
env_get() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
compose() {
  docker compose -p "$PROJECT" -f "$APP_DIR/docker-compose.prod.yml" -f "$APP_DIR/docker-compose.external-proxy.yml" \
    --env-file "$ENV_FILE" "$@"
}

stamp=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DEST/db" "$DEST/files" "$DEST/config"
log "Bắt đầu sao lưu $stamp"

# 1. Cơ sở dữ liệu
partial="$DEST/db/.$stamp.dump.partial"
trap 'rm -f "$partial"' EXIT
compose exec -T postgres pg_dump -U saha -d saha_econtract -Fc > "$partial"
compose exec -T postgres pg_restore --list < "$partial" > /dev/null
mv "$partial" "$DEST/db/$stamp.dump"
log "DB: $(du -h "$DEST/db/$stamp.dump" | cut -f1)"

# 2. File tài liệu (MinIO) – đồng bộ dồn
docker run --rm --network "${PROJECT}_default" -v "$DEST/files:/backup" \
  -e U="$(env_get MINIO_ROOT_USER)" -e P="$(env_get MINIO_ROOT_PASSWORD)" -e B="$(env_get S3_BUCKET)" \
  --entrypoint sh "$MINIO_IMAGE" -c \
  'mc alias set src http://minio:9000 "$U" "$P" >/dev/null && mc mirror --overwrite --quiet "src/$B" /backup' >/dev/null
log "Files: $(du -sh "$DEST/files" | cut -f1), $(find "$DEST/files" -type f | wc -l) file"

# 3. Cấu hình
cp "$ENV_FILE" "$DEST/config/env.production.$stamp"

# 4. Dọn bản cũ
find "$DEST/db" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DEST/config" -name 'env.production.*' -mtime +"$KEEP_DAYS" -delete

date '+%F %T' > "$DEST/LAST_SUCCESS"
log "Xong. Đang giữ $(find "$DEST/db" -name '*.dump' | wc -l) bản DB."
