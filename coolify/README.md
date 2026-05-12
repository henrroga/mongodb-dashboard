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
After first deploy, exec into the container and run:

```bash
node scripts/create-user.js admin 'strong-password' admin
```

Then sign in with that user.
