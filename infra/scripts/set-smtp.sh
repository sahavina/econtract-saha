#!/usr/bin/env bash
# Đặt cấu hình SMTP cho SAHA eContract trên máy chủ, nhập mật khẩu ẩn (không lưu vào lịch sử shell),
# khởi động lại API rồi gửi một email thử về chính hộp thư gửi.
#   Gmail:  SMTP_USER=ten@gmail.com /srv/econtract/bin/set-smtp.sh   (mật khẩu = Mật khẩu ứng dụng 16 ký tự)
#   Khác:   SMTP_HOST=smtp.example.vn SMTP_PORT=465 SMTP_USER=... MAIL_FROM='Ten <no-reply@example.vn>' set-smtp.sh
# Cổng 465 = TLS ngay khi kết nối; cổng khác dùng STARTTLS nếu máy chủ hỗ trợ.
set -euo pipefail
umask 077

BASE=${BASE:-/srv/econtract}
ENV_FILE="$BASE/.env.production"
PROJECT=${PROJECT:-econtract}
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
SMTP_PORT=${SMTP_PORT:-465}
SMTP_USER=${SMTP_USER:?Đặt SMTP_USER (địa chỉ email/tài khoản SMTP)}
MAIL_FROM=${MAIL_FROM:-"SAHA eContract <$SMTP_USER>"}

read -rsp "Mật khẩu SMTP cho $SMTP_USER (gõ ẩn): " SMTP_PASS; echo
SMTP_PASS=${SMTP_PASS// /}   # Gmail hiển thị mật khẩu ứng dụng có dấu cách – bỏ đi
[ -n "$SMTP_PASS" ] || { echo "Chưa nhập mật khẩu"; exit 1; }
if [ "$SMTP_HOST" = smtp.gmail.com ] && ! [[ "$SMTP_PASS" =~ ^[a-zA-Z]{16}$ ]]; then
  echo "Mật khẩu ứng dụng Gmail phải gồm 16 chữ cái (không phải mật khẩu đăng nhập Gmail)."; exit 1
fi

# Ghi đè các dòng SMTP_*/MAIL_FROM, giữ nguyên phần còn lại của file.
SMTP_HOST_V=$SMTP_HOST SMTP_PORT_V=$SMTP_PORT SMTP_USER_V=$SMTP_USER SMTP_PASS_V=$SMTP_PASS MAIL_FROM_V=$MAIL_FROM \
  python3 - "$ENV_FILE" <<'PY'
import sys, os
path = sys.argv[1]
values = {
    "SMTP_HOST": os.environ["SMTP_HOST_V"], "SMTP_PORT": os.environ["SMTP_PORT_V"],
    "SMTP_USER": os.environ["SMTP_USER_V"], "SMTP_PASS": os.environ["SMTP_PASS_V"],
    "MAIL_FROM": '"' + os.environ["MAIL_FROM_V"].replace('"', '') + '"',
}
lines = open(path, encoding="utf-8").read().splitlines()
seen = set()
for i, line in enumerate(lines):
    key = line.split("=", 1)[0]
    if key in values:
        lines[i] = f"{key}={values[key]}"; seen.add(key)
lines += [f"{k}={v}" for k, v in values.items() if k not in seen]
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
PY
cp "$ENV_FILE" "$BASE/app/.env.production"
echo "Đã cập nhật cấu hình SMTP ($SMTP_HOST:$SMTP_PORT, $SMTP_USER)."
# DRY_RUN=1: chỉ kiểm tra bước ghi cấu hình (dùng với BASE trỏ tới thư mục tạm), không khởi động lại API.
[ "${DRY_RUN:-0}" = 1 ] && exit 0

cd "$BASE/app"
C=(docker compose -p "$PROJECT" -f docker-compose.prod.yml -f docker-compose.external-proxy.yml --env-file .env.production)
"${C[@]}" up -d --no-build --wait api >/dev/null
echo "API đã khởi động lại với cấu hình mới. Đang gửi email thử tới $SMTP_USER ..."
"${C[@]}" exec -T api node -e '
const nodemailer = require("nodemailer");
const port = Number(process.env.SMTP_PORT);
const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
t.verify()
  .then(() => t.sendMail({ from: process.env.MAIL_FROM, to: process.env.SMTP_USER,
    subject: "[SAHA eContract] Email thử cấu hình SMTP",
    text: "Cấu hình SMTP của SAHA eContract (" + process.env.APP_URL + ") đã hoạt động." }))
  .then((r) => { console.log("GỬI THÀNH CÔNG: " + r.response); })
  .catch((e) => { console.error("LỖI SMTP: " + e.message); process.exit(1); });
'
