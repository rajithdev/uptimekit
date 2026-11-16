# Deployment

UptimeKit ships as three images that deploy independently:

| Image | Dockerfile | Role | Scaling |
| --- | --- | --- | --- |
| web | `apps/web/Dockerfile` | Next.js UI + REST API (port 3000) | stateless, any number of replicas |
| worker | `apps/worker/Dockerfile` | scheduler, checks, notifications (health on 8081) | any number of replicas (SKIP LOCKED + BullMQ) |
| migrate | `packages/database/Dockerfile` | `prisma migrate deploy`, then exits | run once per release, before web/worker |

Managed services required: **PostgreSQL 14+** (uses `date_bin`), **Redis 6+** (with
`maxmemory-policy noeviction`, as BullMQ requires), and an **SMTP** provider.

## Environment variables

| Variable | Web | Worker | Required | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | ✓ | ✓ | yes | Postgres connection string |
| `REDIS_URL` | ✓ | ✓ | worker: yes; web: recommended | web uses it for shared rate limits |
| `APP_URL` | ✓ | ✓ | yes | public https URL; used for cookies, origin checks, email links |
| `BETTER_AUTH_SECRET` | ✓ | | yes | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | ✓ | | no | defaults to `APP_URL` |
| `MONITOR_MIN_INTERVAL_SECONDS` | ✓ | | no | default 30 |
| `MAX_MONITORS_PER_USER` | ✓ | | no | default 50 |
| `EMAIL_PROVIDER` | | ✓ | yes | `smtp` (or `console` to log only) |
| `EMAIL_FROM` | | ✓ | yes | e.g. `UptimeKit <alerts@yourdomain.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | | ✓ | for smtp | provider credentials (secret) |
| `WORKER_CONCURRENCY` | | ✓ | no | concurrent checks per replica (20) |
| `SCHEDULER_TICK_MS` / `SCHEDULER_BATCH_SIZE` / `MAX_QUEUED_CHECKS` | | ✓ | no | scheduling tuning |
| `CHECK_RETENTION_DAYS` | | ✓ | no | raw check retention (30) |
| `NOTIFICATION_MAX_ATTEMPTS` / `NOTIFICATION_BACKOFF_MS` | | ✓ | no | 6 / 5000 |
| `CHECKER_ALLOW_CIDRS` | | | **never in production** | refused when `NODE_ENV=production` |

Production SMTP options: Amazon SES SMTP, Postmark, Resend (SMTP), Mailgun, SendGrid — any
provider works through the SMTP settings; no code change is needed.

## Self-hosting with Docker Compose

```bash
cp .env.example .env            # set BETTER_AUTH_SECRET, APP_URL, SMTP_* for real email
docker compose --profile app up -d --build --wait
```

This starts Postgres, Redis, Mailpit, runs migrations, then web (`127.0.0.1:3000`) and the
worker. Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of the web
container and set `APP_URL` to the https URL. Replace Mailpit with your SMTP provider via the
`SMTP_*` variables on the worker service.

## Platform deployment (e.g. Railway, Render, Fly.io, ECS)

1. Provision Postgres and Redis (Redis eviction policy `noeviction`).
2. Create three services from the repo using the Dockerfiles above (build context: repo root).
3. Set the environment variables (secrets via the platform's secret store).
4. Configure the **migrate** service as a release/pre-deploy command that must succeed before
   web and worker roll out.
5. Health checks: web `GET /api/health`, worker `GET :8081/healthz`.
6. Give the worker a stop grace period ≥ 80 s so in-flight checks finish on deploy.
7. Restrict the worker's network egress to the public internet (see SECURITY.md).

## Deployment checklist

- [ ] Repository pushed to GitHub; CI green on `main`
- [ ] Postgres provisioned; backups enabled
- [ ] Redis provisioned with `maxmemory-policy noeviction` and persistence
- [ ] SMTP provider account; sending domain verified (SPF/DKIM)
- [ ] `BETTER_AUTH_SECRET` generated and stored as a secret
- [ ] `APP_URL` set to the final https origin on web **and** worker
- [ ] migrate service runs before each release
- [ ] web and worker deployed, health checks green
- [ ] Sign up, create a monitor, observe a check within one interval
- [ ] Create a monitor that fails (e.g. expects `200` from a `204` endpoint) and confirm the DOWN email arrives
- [ ] `CHECKER_ALLOW_CIDRS` unset in every production service
- [ ] Worker egress restricted; IMDSv2 enforced (cloud VMs)

## Current status

Deployment has **not** been performed: no hosting credentials or authorization were provided.
All local verification (images build, compose stack healthy, containerised worker recording
real checks) is documented in `PROGRESS.md`.
