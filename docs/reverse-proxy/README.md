# Reverse-proxy / deployment recipes

The dashboard listens on plain HTTP on `127.0.0.1:3000`. You're expected to
put HTTPS in front of it before exposing it to the internet.

| File                            | When to use                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `Caddyfile`                     | Easiest path. Auto Let's Encrypt, HTTP/2, one config block.       |
| `nginx.conf`                    | Already running nginx, or want manual cert control via certbot.   |
| `mongodb-dashboard.service`     | Running under systemd directly (no Docker), with hardening flags. |

After editing the proxy config, set `TRUST_PROXY=1` in `.env` so the app
trusts `X-Forwarded-*` from the proxy. Without it, login lockouts and rate
limits will see the proxy's loopback IP for every request.

## Cloudflare Tunnel (no public IP needed)

If you don't want to expose any port at all, install `cloudflared` on the
host and create a tunnel pointing at `http://localhost:3000`. Cloudflare
terminates TLS, optionally enforces SSO via Cloudflare Access (which is a
fine second auth layer on top of the dashboard's password), and your
firewall stays closed.

```bash
cloudflared tunnel create mongo-dashboard
cloudflared tunnel route dns mongo-dashboard mongo.example.com
cloudflared tunnel run --url http://localhost:3000 mongo-dashboard
```
