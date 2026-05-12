# MongoDB Dashboard

A fast, self-hosted MongoDB browser built for production-safe operations.

This project is designed as a practical, open-source alternative to MongoDB Compass for teams that want full control over hosting, auth, and data boundaries.

## Why this exists

- No telemetry, no cloud lock-in; your data and connection strings stay on your infrastructure.
- Internet-safe baseline by default: auth, rate limiting, hardened headers, CSRF, input validation, and audit logging.
- Lightweight stack: Node.js, Express, EJS, vanilla JS; no frontend build pipeline required.

## What you get

### Data exploration and editing

- Database and collection browser (including view awareness)
- Document listing with pagination, filters, projections, and sorting
- JSON document create/edit/duplicate/delete
- Bulk delete and bulk update with dry-run preview
- Field-level schema analysis and inferred distributions

### Query and performance tooling

- Aggregation builder with stage templates, previews, and result runner
- Explain plan runner
- Index management (create/drop/hide/unhide; size and metadata display)
- Collection validation rule viewer/editor
- Collection and server stats panels

### Data movement

- Import: JSON array, JSONL/NDJSON, CSV
- Export: JSON, JSONL, CSV (streamed)
- Backup endpoint with metadata header line and streamed document body
- GridFS download support for `.files` collections

### Operational features

- Change stream live viewer (SSE) with operation filters
- Basic shell (`db.collection.method(...)`) with guarded parsing and command boundaries
- Saved queries and saved pipelines
- Light/dark/system theme

## Security and hardening summary

This repository has gone through multiple audit/hardening phases. Current protections include:

- Structured request logging with request IDs
- Centralized error handling with API-safe JSON responses
- Input validation and JSON query parsing guards on API routes
- Query guardrails for expensive/unsafe patterns (`$where` and similar blocked)
- CSRF protection on unsafe API methods
- Session lifecycle controls: idle + absolute session expiry
- Login brute-force lockout and route-level rate limits
- Read-only mode to block all mutating DB actions
- Shell execution boundaries:
  - safer argument parser (no `eval`)
  - restricted `runCommand` allowlist
- Change stream lifecycle safety:
  - SSE heartbeat
  - max connection rotation
  - robust cleanup on close/abort
- CSV integrity protections:
  - malformed CSV detection
  - duplicate/empty header rejection
  - CSV formula-injection neutralization on export

For details, see `docs/AUDIT_ROADMAP.md` and `SECURITY.md`.

## Quick start (local)

```bash
git clone https://github.com/henrroga/mongodb-dashboard
cd mongodb-dashboard
npm install
cp .env.example .env
npm run hash-password
npm start
```

Then open <http://localhost:3000>.

## Docker deployment (recommended)

```bash
cp .env.example .env
# set at minimum:
# AUTH_PASSWORD_HASH=<bcrypt hash>
# SESSION_SECRET=<openssl rand -hex 32>
# MONGODB_URI=mongodb://...
docker compose up -d --build
```

By default, compose binds to `127.0.0.1:3000`. Expose through TLS reverse proxy only. Ready examples: `docs/reverse-proxy/README.md`.
The compose file persists both `/app/logs` and `/app/data` so auth users, connection vault entries, and backup history survive container restarts.

Prebuilt image (auto-published on `main`): `ghcr.io/henrroga/mongodb-dashboard:latest`.

## Configuration reference (high-impact)

All options are env-driven (`.env.example` is the source of truth).

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_ENABLED` | auto | Enables auth (auto-true if password/hash exists) |
| `AUTH_PASSWORD_HASH` | — | bcrypt hash used for login |
| `AUTH_USERS_FILE` | `data/users.json` | JSON user store for multi-user auth (`username`, `passwordHash`, `role`) |
| `AUTH_BOOTSTRAP_USERNAME` | — | optional first-boot user (applies only when user store is empty) |
| `AUTH_BOOTSTRAP_PASSWORD` | — | password for bootstrapped user |
| `AUTH_BOOTSTRAP_ROLE` | `admin` | role for bootstrapped user (`viewer`, `editor`, `admin`) |
| `AUTH_PASSWORD` | — | dev convenience plaintext password |
| `SESSION_SECRET` | random in non-prod | session signing secret (required in production auth setups) |
| `CONNECTION_VAULT_SECRET` | falls back to `SESSION_SECRET` | encryption key for saved server-side connection vault entries |
| `SESSION_MAX_AGE_MS` | 7d | cookie/session max age |
| `SESSION_IDLE_TIMEOUT_MS` | 8h | idle session invalidation threshold |
| `SESSION_ABSOLUTE_TIMEOUT_MS` | 24h | max lifetime from login time |
| `COOKIE_SECURE` | prod=true | secure cookie flag |
| `TRUST_PROXY` | `loopback` | correct client IP/cookie handling behind proxy |
| `MONGODB_URI` | — | preset cluster URI; locks connect/disconnect UI |
| `READ_ONLY` | `false` | blocks mutating DB operations |
| `LOGIN_MAX_ATTEMPTS` | 5 | brute-force lockout threshold |
| `LOGIN_LOCKOUT_MS` | 900000 | lockout window |
| `RATE_LIMIT_MAX` | 300 | default requests/window per IP |
| `RATE_LIMIT_LOGIN_MAX` | 10 | tighter login route limit |
| `AUDIT_LOG_DIR` | `./logs` | JSONL audit log directory |

### RBAC roles

- `viewer`: read-only app access
- `editor`: read + write CRUD access
- `admin`: full access including shell, index admin, and audit viewer

### User management CLI

- Create/update users in the JSON auth store:
  - `npm run create-user -- alice strong-password editor`
  - `npm run create-user -- admin another-password admin`
- The script writes to `AUTH_USERS_FILE` (default `data/users.json`) and updates the user if the username already exists.

### Local test runner fallback

- If your system Node is broken/mismatched, run:
  - `npm run test:local`
- This uses bundled runtime Node when available (`$BUNDLED_NODE_BIN` override supported), then falls back to system `node`.

### Plugin SDK (preview)

- Place plugin folders in `plugins/` with a `plugin.json` manifest.
- View discovered plugins at `/plugins` or via `GET /api/plugins`.
- Current release includes manifest discovery and hook metadata exposure.

## API surface (high level)

The API is mounted under `/api` and split by concern:

- `connection`: connect/disconnect/status/server info/current operations
- `databases`: database + collection lifecycle
- `documents`: CRUD, list pagination, bulk delete, bulk update
- `query`: explain and aggregate execution
- `collection`: schema, validation, stats, watch stream
- `indexes`: list/create/drop/toggle hidden
- `transfer`: import/export/backup/GridFS download
- `shell`: guarded shell command execution

All major write paths are audited and pass through read-only and auth controls.

## Development workflow

```bash
# run app
npm start

# run tests
npm test
npm run test:local

# verify Coolify template/env contract
npm run lint:coolify

# run post-deploy smoke checks (pass base URL)
npm run postdeploy:check -- http://127.0.0.1:3000

# generate auth hash
npm run hash-password
```

The test suite is Node's built-in runner and includes focused regression tests for security-hardening areas.

## Reverse proxy and production checklist

- Use HTTPS termination at proxy layer
- Set `AUTH_ENABLED=true`
- Set strong `SESSION_SECRET`
- Keep `COOKIE_SECURE=true` in public deployments
- Set `TRUST_PROXY` correctly for your topology
- Prefer `MONGODB_URI` preset mode for fixed deployment targets
- Consider `READ_ONLY=true` for investigation-only environments

Start with `docs/reverse-proxy/README.md` and `SECURITY.md`.

Health endpoints:
- `GET /healthz`: liveness (+ optional `?deep=1`)
- `GET /readyz`: readiness for orchestrators; checks data dir writability and, when `MONGODB_URI` is preset, active Mongo connectivity
- `GET /api/self-check`: deployment hardening checklist (admin/audit role)

## Coolify deployment template

- Ready-to-import compose template: [coolify/docker-compose.yml](coolify/docker-compose.yml)
- Example env set: [coolify/.env.example](coolify/.env.example)
- Setup notes: [coolify/README.md](coolify/README.md)
- Post-deploy verification script: `scripts/post-deploy-check.sh`

## Project structure

```text
.
├── server.js
├── src/
│   ├── config.js
│   ├── middleware/        # auth, csrf, validation, errors, request-id
│   ├── routes/            # modular API + auth + pages
│   ├── services/          # MongoDB client lifecycle
│   └── utils/             # bson/audit/query-guards/shell/csv/change-stream
├── public/                # frontend JS/CSS (no build system)
├── views/                 # EJS templates
├── tests/                 # security and behavior regression tests
├── docs/                  # roadmap + reverse proxy docs
└── scripts/               # tooling (password hash generation)
```

## License

MIT
