# UptimeKit — Implementation Plan

Status: active. Started 2026-11-16. Target: 48 hours.

## 1. Environment (verified 2026-11-16)

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22.23 | LTS |
| pnpm | 10.9 | workspace manager |
| Docker / Compose | 29.9 / v5.6 | daemon running |
| PostgreSQL client | 14 (Homebrew) | server runs in Docker (16-alpine) |
| Redis | none locally | runs in Docker (7-alpine) |
| Playwright browsers | chromium cached | |
| gh CLI | authenticated | **no push without explicit approval** |

Local port conflicts exist with other projects (5432, 1025, 8025 in use). UptimeKit uses:
Postgres `5442`, Redis `6380`, Mailpit SMTP `1026` / UI `8026`, web `3000`.

## 2. Key technology decisions

| Area | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces (no Turborepo) | fewer dependencies; `pnpm -r` is sufficient at this size |
| Web | Next.js 16 App Router, React 19, TS 5.9 strict | requested stack; TS 7 (native) skipped — tooling compatibility risk |
| UI | Tailwind v4, shadcn/ui, Lucide, Recharts, TanStack Query | requested stack |
| Auth | Better Auth (email/password, Prisma adapter) | maintained, DB sessions, httpOnly cookies, scrypt hashing, built-in rate limiting; NextAuth v5 is still beta |
| DB | PostgreSQL 16 + Prisma 7 (`@prisma/adapter-pg`) | Prisma "latest" tag is an 8.0 RC — pinned to 7.10 stable |
| Queue | BullMQ on Redis | check jobs + notification delivery with retries |
| HTTP checker | `node:http`/`node:https` with a validating `lookup` | lets us validate the *exact* IP being connected to (DNS-rebinding safe), cap body size, and control redirects |
| IP classification | `ipaddr.js` | CIDR-range matching instead of string blocklists |
| Email | provider interface: SMTP (nodemailer) + console | Mailpit in dev; any SMTP provider (SES, Resend, Postmark) in prod via env |
| Worker build | tsup bundle | independently deployable Node service |

## 3. Architecture

```
Browser ──> Next.js (web) ──> PostgreSQL <── Worker (scheduler + check processor + notifier)
                │                                 │
                └── Redis (API rate limits)       └── Redis (BullMQ queues) ──> SMTP
```

* **The database is the source of truth for scheduling.** Each monitor has `nextCheckAt`.
  The worker's scheduler tick claims due monitors with
  `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`, advancing `nextCheckAt`
  in the same statement, then enqueues BullMQ jobs with deterministic job IDs.
  - Multiple workers never claim the same slot (row locks + `SKIP LOCKED`).
  - Jobs cannot accumulate: a monitor is only re-claimed after `nextCheckAt` passes, and
    stale jobs (older than one interval) are dropped by the processor.
  - Web never talks to the queue; creating/pausing a monitor is a DB write only.
* **Check processing** runs the HTTP check outside any transaction, then applies the result in a
  short transaction that locks the monitor row (`SELECT … FOR UPDATE`), inserts the check,
  upserts the hourly rollup, runs the pure state machine, and opens/closes incidents.
* **Incident uniqueness**: partial unique index `incidents(monitor_id) WHERE resolved_at IS NULL`.
* **Notifications (outbox pattern)**: `notifications` rows are inserted inside the same
  transaction that opens/resolves an incident, unique on `(incident_id, type)`. After commit
  they are enqueued (job id = notification id). A sweeper re-enqueues stuck `PENDING` rows.
  Delivery retries with exponential backoff; status, attempts and last error are persisted.

## 4. Monitoring semantics

* States: `PENDING` (no confirmed result yet), `UP`, `DOWN`, `PAUSED`, `UNKNOWN`
  (no check completed for > 3 intervals while active — computed by a staleness sweep).
* Confirmation: `failureThreshold` consecutive failures → DOWN (default 2);
  `recoveryThreshold` consecutive successes → UP (default 2). While a failure is unconfirmed
  the next check is scheduled after `retryIntervalSeconds` (default 20s) instead of the full interval.
* Check success = connection OK, status in expected set, keyword (if set) present in the first 1 MiB.
* Uptime % (per window) = `successful checks / (successful + failed checks)`.
  - Paused time produces no checks → excluded from both numerator and denominator.
  - Missing checks are **not** counted as up. We also report *coverage* = recorded / expected checks.
  - No checks in window → uptime is `null` ("No data"), never 100%.
* Downtime = sum of confirmed incident durations clipped to the window (open incidents run to "now").

## 5. Security plan (SSRF)

1. Zod: only `http:`/`https:`, no credentials in URL, max length, ports allow-listed (80, 443, 1024–65535 except known infra ports? → allow any port; IP checks are what matter).
2. Hostname: reject `localhost`, `*.localhost`, `*.local`, `*.internal`, metadata hostnames.
3. IP literal and every DNS result checked with `ipaddr.js` range classification — only `unicast`
   is allowed (blocks loopback, private, link-local incl. 169.254.169.254, CGNAT, unique-local,
   multicast, reserved, IPv4-mapped/NAT64/6to4/Teredo embedding private v4).
4. Connection pinning: the validated address is the one handed to the socket (custom `lookup`), so
   DNS rebinding between validation and connect is impossible.
5. Redirects followed manually (max 5), each hop re-validated through the same pipeline.
6. Timeouts (connect + total), 1 MiB body cap, no custom request headers in v1, fixed User-Agent.
7. API: Zod everywhere, ownership filter on every query (`userId` in WHERE), rate limits (Redis),
   origin check on mutating requests, per-user monitor cap.
8. Dev/test escape hatch `CHECKER_ALLOW_CIDRS` (logged loudly; never set in production config).

## 6. Milestones

| # | Milestone | Verification |
| --- | --- | --- |
| M1 | Monorepo scaffold, configs, docker-compose infra | `pnpm install`, `docker compose up` healthy |
| M2 | Prisma schema + migrations + DB package | migrate against local PG |
| M3 | Shared package: Zod schemas, state machine, uptime math, SSRF + safe HTTP client | unit tests |
| M4 | Auth (Better Auth) + protected API skeleton + rate limiting | integration tests |
| M5 | Monitor/incident/stats/notification REST API | integration tests incl. isolation |
| M6 | Worker: scheduler, check processor, incidents, sweeper, graceful shutdown | integration tests vs. local HTTP servers, concurrency test |
| M7 | Email notifications (outbox + BullMQ + SMTP) | integration test against Mailpit |
| M8 | Dashboard UI: shell, landing, auth pages, dashboard, monitors, details, incidents, settings | manual + RTL tests |
| M9 | E2E Playwright suite | green run |
| M10 | Dockerfiles, compose app profile, CI, docs, screenshots | docker build + compose up, actionlint |

## 7. Priorities

**P0** — auth; monitor CRUD/pause/resume; real HTTP checks; SSRF protection; state machine with
confirmation; incidents open/resolve without duplicates; check history; uptime/latency stats;
email down/recovery notifications with retries; dashboard/monitors/detail/incidents/settings pages;
unit + integration + E2E tests; Dockerfiles; compose; CI; README.

**P1** — light mode toggle; hourly rollups + raw-check retention; account settings (password change,
sessions); API docs; staleness → UNKNOWN; landing page polish; screenshots.

**P2** — public status pages; webhooks/Slack; custom headers with secret storage; multi-region
checks; OpenAPI spec generation; team accounts.

Out of scope: billing, AI, mobile, SMS, enterprise SSO.
