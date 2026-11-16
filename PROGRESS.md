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
| Docs | README (Mermaid architecture), API, MONITORING, SECURITY, DEPLOYMENT, screenshots from real data |
| Release check | fresh clone: `install --frozen-lockfile`, generate, lint, typecheck, build all pass without DATABASE_URL; no secrets tracked |

## Acceptance report (2026-11-16)

| Criterion | Result | Evidence |
| --- | --- | --- |
| Application starts | PASS | dev (`pnpm dev`), standalone build, and Docker Compose stack all healthy |
| Users can authenticate | PASS | API tests + E2E register/login/logout |
| Create and manage monitors | PASS | API CRUD tests; E2E create/pause/resume/delete |
| Worker executes real HTTP checks | PASS | integration + E2E vs local servers; real public endpoints in dev; containerised worker recorded checks |
| Monitor status updates correctly | PASS | state-machine unit tests; worker runtime test; E2E UP→DOWN→UP |
| Real check results stored | PASS | `checks` + hourly rollups asserted in tests; visible in UI |
| Incidents open and resolve | PASS | lifecycle + 25-way concurrency tests; E2E outage/recovery |
| Email alerts in dev environment | PASS | Mailpit received DOWN/RECOVERED (worker test, E2E, manual) |
| Dashboards show recorded data | PASS | stats/dashboard API tests; screenshots from real data |
| Authorization and SSRF tested | PASS | isolation tests (API + E2E); SSRF unit, checker, API tests |
| Docker services run together | PASS | `docker compose --profile app up --wait` all healthy |
| Automated tests pass | PASS | 152 + 25 + 47 Vitest, 8 Playwright |
| Application builds | PASS | `pnpm build` (fresh clone) |
| CI configuration valid | PASS | all 7 jobs green on GitHub Actions (run 43963882789); first run failed only because the e2e job did not build the web app — fixed in 882b387 |
| Documentation complete | PASS | README + docs/ |
| Deployment verified | NOT VERIFIED | no credentials/authorization; checklist in docs/DEPLOYMENT.md |

## Blockers / needs user input

- Published 2026-11-16: https://github.com/rajithdev/uptimekit (public).
- **Deployment requires hosting credentials and explicit authorization** — not provided. A
  deployment checklist is in `docs/DEPLOYMENT.md`.

## Next actions

1. With authorization + credentials: deploy (docs/DEPLOYMENT.md checklist).
2. (P2) Public status pages, webhook/Slack channels, custom request headers with secret storage.

## Known limitations

- Single-region checks (one vantage point); no multi-location consensus.
- Email delivery is at-least-once: a crash between SMTP acceptance and the SENT update can resend.
- Historical pause periods are not stored; coverage for previously paused monitors is under-reported.
- No password-reset / email-verification flow (needs a transactional email path in the web tier).
- Custom request headers/auth for monitored endpoints are intentionally unsupported in v1.
- Web rate limiting falls back to per-process memory if Redis is unavailable.
