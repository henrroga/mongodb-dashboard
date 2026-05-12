# Coolify Template

Use `coolify/docker-compose.yml` as your Coolify Docker Compose source.

## Required env vars
- `PUBLIC_URL`
- `SESSION_SECRET`
- `MONGODB_URI`

## Strongly recommended
- `COOKIE_SECURE=true`
- `AUTH_ENABLED=true`
- `CONNECTION_VAULT_SECRET` (separate from session secret)

## Persistence
This template persists:
- `/app/data` for users, connection vault, backup history
- `/app/logs` for audit logs

## First admin user
Preferred: set `AUTH_BOOTSTRAP_USERNAME`, `AUTH_BOOTSTRAP_PASSWORD`, and
`AUTH_BOOTSTRAP_ROLE=admin` in Coolify before first boot. The app seeds this
user only when the user store is empty.

Alternative (manual):

```bash
node scripts/create-user.js admin 'strong-password' admin
```
