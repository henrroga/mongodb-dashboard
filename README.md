# MongoDB Dashboard

A fast, self-hosted, open-source MongoDB browser. Built to replace MongoDB
Compass for day-to-day work and to run safely on a domain you control.

- **No telemetry, no cloud.** Your connection string never leaves your server.
- **Designed to be exposed on the internet.** Password auth, brute-force
  lockout, helmet-set CSP/security headers, rate limiting, and a `READ_ONLY`
  switch are built in.
- **Drop-in self-host.** One Dockerfile, one compose file, one `.env`.

## Features

Browser, document viewer + JSON editor, schema/index/validation tools,
aggregation/explain runner, server stats, change-stream tab, import/export,
saved connections, dark/light/system theme, and a guarded `db.collection.foo()`
shell — all over plain HTTP/JSON, no heavy framework.

## Quick start (local)

```bash
git clone https://github.com/henrroga/mongodb-dashboard
cd mongodb-dashboard
npm install
cp .env.example .env
# Edit .env and either set AUTH_PASSWORD or generate a hash:
npm run hash-password
npm start
```

Open <http://localhost:3000>.

## Self-host (Docker, recommended)

```bash
cp .env.example .env
# Set at minimum:
#   AUTH_PASSWORD_HASH    (run: npm run hash-password)
#   SESSION_SECRET=$(openssl rand -hex 32)
#   MONGODB_URI=mongodb://...
docker compose up -d --build
```

The compose file binds the dashboard to `127.0.0.1:3000` only. Put a reverse
proxy in front to terminate TLS and expose it on a domain you own. See
[`docs/reverse-proxy/`](./docs/reverse-proxy) for ready-to-paste configs.

## Configuration

All config is via environment variables (see `.env.example`). The most
important knobs:

| Variable             | Default    | Notes                                                                                |
| -------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `AUTH_ENABLED`       | auto       | `true` if password set. **Always `true` for internet-exposed deployments.**          |
| `AUTH_PASSWORD_HASH` | —          | bcrypt hash. Generate with `npm run hash-password`.                                  |
| `AUTH_PASSWORD`      | —          | Plain password (dev only — hashed in memory at boot, never persisted).               |
| `SESSION_SECRET`     | —          | 32+ random bytes. **Required in production.** `openssl rand -hex 32`.                |
| `COOKIE_SECURE`      | prod=true  | Only send the session cookie over HTTPS. Leave on for any public deployment.         |
| `TRUST_PROXY`        | `loopback` | `1` for one proxy, or a CIDR. Required for correct client IPs / secure cookies.      |
| `MONGODB_URI`        | —          | Preset connection. When set, the connect form is disabled and disconnect is blocked. |
| `READ_ONLY`          | `false`    | Reject all DB writes (insert/update/delete/drop/index/validation/import).            |
| `LOGIN_MAX_ATTEMPTS` | 5          | Lock the IP after N failed attempts.                                                 |
| `LOGIN_LOCKOUT_MS`   | 900000     | Lockout duration (15 min).                                                           |
| `RATE_LIMIT_MAX`     | 300        | Requests per minute per IP.                                                          |
| `AUDIT_LOG_DIR`      | `./logs`   | Where write-op audit log is written.                                                 |

## Security

See [`SECURITY.md`](./SECURITY.md) for the threat model and a deployment
checklist. **Do not expose the dashboard on a public domain without
`AUTH_ENABLED=true`, `SESSION_SECRET`, HTTPS, and a reverse proxy.**

## Project structure

```
.
├── server.js              # Express entry — auth, helmet, rate limit, sessions
├── src/
│   ├── config.js          # env → typed config
│   ├── middleware/auth.js # session gate, brute-force lockout
│   ├── routes/
│   │   ├── api.js         # JSON API (read-only enforcement, audit, write guards)
│   │   ├── auth.js        # /login, /logout
│   │   └── pages.js       # SSR pages
│   ├── services/mongodb.js
│   └── utils/
│       ├── audit.js       # JSONL audit log of writes
│       ├── bson.js
│       ├── schema.js
│       └── shellArg.js    # MQL arg parser (no eval)
├── views/                 # EJS
├── public/                # CSS + vanilla JS
├── docs/reverse-proxy/    # Caddy + nginx + systemd examples
├── scripts/hash-password.js
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

MIT
