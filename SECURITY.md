# Security model

This dashboard is intended for self-hosting by a single operator (or a small,
trusted team) on a domain they control. It is **not** multi-tenant: there is
one logical user, one shared MongoDB connection, and one password.

## Threat model

| Threat                                           | Mitigation                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Unauthenticated access to the dashboard          | `AUTH_ENABLED=true` + bcrypt-hashed password + session cookie.                               |
| Credential brute-forcing                         | Per-IP lockout after `LOGIN_MAX_ATTEMPTS` (default 5) for `LOGIN_LOCKOUT_MS` (default 15m).  |
| Session theft / cookie replay                    | `httpOnly`, `sameSite=strict`, `secure` (HTTPS-only) cookies. Sessions regenerate on login.  |
| CSRF                                             | `sameSite=strict` cookie + the API only accepts JSON bodies on state-changing endpoints.    |
| XSS                                              | helmet CSP forbids `'unsafe-eval'`, blocks framing, `objectSrc 'none'`. EJS auto-escapes.    |
| Clickjacking                                     | `frame-ancestors 'none'` + `X-Frame-Options: DENY`.                                          |
| RCE via the in-app shell                         | `src/utils/shellArg.js` — pure JSON parse with MQL constructor allowlist; no eval/vm.        |
| Credential leak in `/api/status`                 | Connection string is redacted (`mongodb://***@host…`) before being returned to the client.   |
| Operator footgun: dashboard exposes user URI     | Set `MONGODB_URI` server-side; dashboard refuses user-supplied connection strings then.      |
| Accidental destructive ops                       | `READ_ONLY=true` blocks every write API and write shell method; each blocked attempt audit-logged. |
| Forensics for destructive ops                    | All writes are appended to `logs/audit.log` (JSONL) with timestamp, method, path, IP.        |
| Network exposure of Mongo itself                 | Compose binds dashboard to `127.0.0.1` and Mongo (if used) to `127.0.0.1`. Nothing on 0.0.0.0. |
| Container compromise                             | Image runs as non-root `app` user, `read_only` rootfs, `no-new-privileges`, all caps dropped. |

## Production checklist

Before pointing a domain at this:

1. **HTTPS only.** Use Caddy, Cloudflare, or nginx + Let's Encrypt. See
   [`docs/reverse-proxy/`](./docs/reverse-proxy).
2. `AUTH_ENABLED=true` with a 16+ character password. Use
   `npm run hash-password` and store only the hash in `.env`.
3. `SESSION_SECRET=$(openssl rand -hex 32)` — never reuse across instances.
4. `COOKIE_SECURE=true` (auto-on in `NODE_ENV=production`).
5. `TRUST_PROXY` set to match your proxy (`1`, `2`, or a CIDR like
   `10.0.0.0/8`). Otherwise rate limiting and lockout see the proxy IP, not
   the real client.
6. **MongoDB user with least privilege.** Don't reuse a root cluster
   account. If you only browse, give the user `read` on the relevant DBs.
   If you need writes, `readWrite` on those DBs only — never
   `__system`/`root`/`clusterAdmin`.
7. Set `MONGODB_URI` server-side and never share the URL of the connect
   page. With `MONGODB_URI` set, the user-supplied connect form is
   disabled.
8. Consider `READ_ONLY=true` unless you actively need write capability
   that day. Toggling read-only is one env-var + restart.
9. Restrict source IPs at the proxy or with `ufw`/cloud security groups
   if you can. Auth is great; auth + IP allowlist is better.
10. Mount `logs/` to durable storage and ship `audit.log` to your log
    aggregator.

## Reporting a vulnerability

Open a private security advisory on the GitHub repo, or email the
maintainer. Please don't open public issues for security bugs.

## Cryptographic primitives

- Password hashing: bcrypt, cost 12 (`bcryptjs`).
- Session ID: `express-session` defaults — 32 bytes via `crypto.randomBytes`.
- Cookie name: `mdb.sid`.
- TLS: out of scope; terminated at the reverse proxy.
