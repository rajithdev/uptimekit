# UptimeKit — Progress

Resume here after interruption: read this file, `docs/IMPLEMENTATION_PLAN.md`, `git log --oneline`,
then run `pnpm infra:up && pnpm test`.

## Completed (verified)

| Milestone | Evidence |
| --- | --- |
| M1 Monorepo scaffold, docker-compose infra | `pnpm install`; Postgres/Redis/Mailpit healthy |
| M2 Prisma schema + migration (partial unique index, check constraints) | `prisma migrate dev` applied; DB rejects 2nd open incident (test) |
| M3 Shared core: Zod schemas, state machine, analytics, SSRF policy, pinned HTTP checker | 152 unit tests |
| M4/M5 Better Auth + REST API (monitors, checks, stats, incidents, notifications, dashboard, health) | 31 API integration tests |
| M6 Worker: SKIP LOCKED scheduler, transactional result apply, incidents, sweeps, graceful shutdown | 25 integration tests (real PG/Redis/HTTP/Mailpit); bundle health + SIGTERM exit 0 |
| M7 Email notifications: outbox, BullMQ retries, SMTP/console providers | Mailpit receives DOWN/RECOVERED emails (tests + manual) |
| M8 Dashboard UI (landing, auth, dashboard, monitors, detail, incidents, settings) | 16 RTL tests; manual browser walkthrough with real data |
| M9 Playwright E2E | 8/8 passing against production build + real worker |
| M10 Docker images, compose app profile, CI workflow | images built; compose stack healthy; container worker recorded real checks; actionlint clean |

## In progress

- Documentation (README, API, monitoring, security, deployment) and screenshots.

## Blockers / needs user input

- **Deployment and `git push` require explicit authorization** — not requested. A deployment
  checklist is in `docs/DEPLOYMENT.md`.

## Next actions

1. Finish docs + screenshots, final acceptance report.
2. (P2) Public status pages, webhook/Slack channels, custom request headers with secret storage.

## Known limitations

- Single-region checks (one vantage point); no multi-location consensus.
- Email delivery is at-least-once: a crash between SMTP acceptance and the SENT update can resend.
- Historical pause periods are not stored; coverage for previously paused monitors is under-reported.
- No password-reset / email-verification flow (needs a transactional email path in the web tier).
- Custom request headers/auth for monitored endpoints are intentionally unsupported in v1.
- Web rate limiting falls back to per-process memory if Redis is unavailable.
