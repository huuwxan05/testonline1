# SIC BO 3D Commercial V2

V2 turns the supplied SIC BO 3D HTML into a server-authoritative virtual-coin platform **without editing the original 3D game source**.

## What was added

- Register / login / character name.
- PostgreSQL-backed virtual coin balance.
- Immutable-style coin ledger records for bets, wins, refunds, signup reward and admin adjustments.
- Server-authoritative round state machine: BETTING → SHAKING → PEEKING → RESULT → next round.
- Socket.IO real-time round synchronization.
- Server-side cryptographic dice generation.
- Server-side bet validation and settlement.
- Admin dashboard for players, coin adjustments, account suspension, game pause/enable, betting limits and audited test result forcing.
- Audit log.
- GitHub/Render-ready structure.

## Important 3D preservation rule

`apps/player/game.html` is the supplied HTML source copied into V2. Do not edit it to implement server logic. `bridge.js` is the additive integration layer.

## Run on Android / Termux

```bash
pkg update -y
pkg install git nodejs -y
cd ~
git clone YOUR_GITHUB_REPO_URL sicbo-v2
cd sicbo-v2
cp .env.example .env
# Edit .env and set DATABASE_URL + JWT_SECRET
npm install
npm start
```

The app serves from port 3000.

For local PostgreSQL, Docker is easiest on a normal computer/server. On Android, use a remote PostgreSQL URL (for example a managed database) and run Node in Termux.

## GitHub

```bash
git init
git add .
git commit -m "SicBo 3D V2 authoritative platform"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## Render

The included `render.yaml` provisions a web service plus PostgreSQL. Set `ADMIN_SEED_USER` and `ADMIN_SEED_PASSWORD` as Render environment secrets before first production use.

## Default virtual economy

New player: **1,000,000 virtual coins**. No real-money deposit or withdrawal is implemented.

## Admin

Open `/admin`. The seeded admin account is controlled by `ADMIN_SEED_USER` and `ADMIN_SEED_PASSWORD`; there is no hard-coded password.


## V3 — Realtime Chat + Bot Room
- `game.html` 3D gốc vẫn được giữ nguyên, không chỉnh sửa.
- Chat người chơi realtime qua Socket.IO event `chat:send` / `chat:message`.
- 8 bot phòng tự động chat theo trạng thái phiên.
- Bot chỉ tạo hoạt động/chat mô phỏng, không được quyền thay đổi xúc xắc, số dư thật của người chơi hoặc kết quả server-authoritative.
- Khung chat được chèn bằng `bridge.js`, nên phần 3D gốc không bị sửa.
