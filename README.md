# ROYAL ONLINE — Render-ready demo

> Bộ khung này dùng **số dư ảo/test balance**, không có nạp/rút tiền thật.

## Cấu trúc

- `public/index.html`: giao diện game hiện tại.
- `public/api-client.js`: client JSON API.
- `api/index.php`: JSON API đăng ký/đăng nhập/wallet/game/quest/chat/bet ledger.
- `api/bootstrap.php`: PDO PostgreSQL, session, CSRF, JSON response.
- `config/config.php`: cấu hình app + `DATABASE_URL`.
- `database/schema.sql`: schema PostgreSQL + dữ liệu seed.
- `Dockerfile`: PHP 8.3 + Apache + PDO PostgreSQL.
- `deploy/apache.conf`: document root `public/` và route `/api/`.
- `render.yaml`: Render Blueprint tạo Web Service + Postgres.

## Điểm cần biết trước khi deploy

Source HTML gốc vẫn giữ state gameplay ở JavaScript: `balance`, quest và kết quả các game vẫn có logic client-side. Backend hiện cung cấp tài khoản, wallet ledger, history và API cược demo; nó **chưa chuyển toàn bộ gameplay sang server-authoritative**. Không dùng bản này cho tiền thật.

## Deploy Render

1. Push toàn bộ thư mục này vào GitHub branch `main`.
2. Trong Render chọn **New → Blueprint** và chọn repo.
3. Render đọc `render.yaml`, tạo web service `royal-online` và Postgres `royal-db`.
4. Khi tạo Blueprint, nhập `APP_URL` và `CORS_ORIGIN` bằng URL `https://<ten-service>.onrender.com` sau khi biết tên service.
5. Sau deploy, kiểm tra:
   - `/` → giao diện.
   - `/api/index.php?action=health` → JSON `ok:true`.
   - `/api/index.php?action=games` → danh sách game.

Render hỗ trợ auto-deploy khi commit mới vào branch được liên kết. `render.yaml` đặt `DATABASE_URL` từ connection string của Render Postgres.
