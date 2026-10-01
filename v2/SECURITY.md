# Security — V2

- Passwords are hashed with bcrypt (12 rounds).
- JWTs are validated by REST and Socket.IO.
- Player status is checked before Socket.IO access.
- REST API has rate limiting, Helmet and CORS controls.
- SQL uses PostgreSQL parameterized queries.
- Coin changes happen inside database transactions and are recorded in `coin_ledger`.
- Admin coin changes and game configuration changes are written to `audit_log`.
- Game result generation is server-side using Node `crypto.randomInt`.
- Client-side balance and result values are not authoritative.
- Secrets belong in environment variables and must not be committed.
- `force-result` is an explicit admin/test action and is audited.
- For production, use a strong `JWT_SECRET`, HTTPS, a restricted `CORS_ORIGIN`, and managed PostgreSQL backups.
