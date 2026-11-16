# How monitoring works

This document describes the monitoring engine precisely: scheduling, the check itself, state
transitions, incidents, notifications and how analytics are computed.

## 1. Scheduling

The **database is the source of truth**. Every monitor row has `next_check_at`.

The worker's scheduler ticks every `SCHEDULER_TICK_MS` (default 2 s) and claims due monitors in
one statement:

```sql
WITH due AS (
  SELECT id, next_check_at, interval_seconds FROM monitors
  WHERE status <> 'PAUSED' AND next_check_at <= now()
  ORDER BY next_check_at LIMIT $batch
  FOR UPDATE SKIP LOCKED
)
UPDATE monitors m SET next_check_at = now() + interval_seconds * '1 second'
FROM due WHERE m.id = due.id
RETURNING m.id, due.next_check_at AS scheduled_for;
```

* `FOR UPDATE SKIP LOCKED` lets any number of worker replicas claim **disjoint** sets of monitors.
* `next_check_at` moves forward in the same statement, so a monitor is claimed at most once per
  interval.
* Claimed monitors are enqueued in BullMQ with a deterministic job id
  (`<monitorId>-<scheduledFor>`), so a double enqueue is a no-op.
* **Backpressure:** if more than `MAX_QUEUED_CHECKS` jobs are waiting, the scheduler claims
  nothing that tick. Due monitors wait in the database instead of piling up in Redis.
* **Stale jobs:** a job that waited longer than one interval is dropped by the processor; a
  fresh slot is (or will be) scheduled anyway.

Web never touches the queue. Creating, editing or pausing a monitor is a database write; the
worker picks it up on its next tick. Monitoring therefore never depends on a browser session.

## 2. The check

`performHttpCheck()` (`packages/shared/src/server/http-check.ts`):

| Aspect | Behaviour |
| --- | --- |
| Methods | `GET` or `HEAD` |
| Connection | fresh connection per check (`agent: false`), `Connection: close` |
| DNS | resolved inside the socket's `lookup` hook; every address validated (see SECURITY.md) |
| Timeout | hard deadline over the whole check including redirects (`timeoutMs`, 1–60 s) |
| Redirects | followed manually, max 5 hops, each hop re-validated; `303` downgrades to GET |
| Status | must match `expectedStatusCodes` (e.g. `200-299`, `200,204,301-302`) |
| Keyword | optional, case-sensitive substring of the first 1 MiB of the decoded body (GET only) |
| Body | read only when a keyword is set; gzip/deflate/br decoded with a byte cap |
| Latency | **time to response headers** (DNS + TCP + TLS + server time), summed across redirect hops |

Failures are classified: `TIMEOUT`, `DNS`, `CONNECTION`, `TLS`, `STATUS`, `KEYWORD`, `BLOCKED`,
`REDIRECT`, `INVALID_URL`, `ERROR`.

## 3. State machine

States: `PENDING` (new or just resumed/edited), `UP`, `DOWN`, `PAUSED`, `UNKNOWN`.

| From | Check result | Rule | To |
| --- | --- | --- | --- |
| PENDING / UNKNOWN | success | first success | UP |
| UP / PENDING / UNKNOWN | failure | `consecutiveFailures ≥ failureThreshold` | DOWN |
| DOWN | success | `consecutiveSuccesses ≥ recoveryThreshold` | UP |
| PAUSED | — | results are discarded | PAUSED |

* A single transient failure never marks a monitor down (default `failureThreshold = 2`).
* While a change is being confirmed (an unconfirmed failure, or a partial recovery) the next check
  runs after `retryIntervalSeconds` (default 20 s) instead of the full interval.
* `UNKNOWN` is set by a sweep when an active `UP`/`PENDING` monitor has had no completed check for
  `max(3 × interval, 5 min)` — e.g. the worker is down or badly behind. `DOWN` monitors stay
  `DOWN` (their incident stays open) and the UI flags their data as stale.

The state machine is a pure function (`applyCheckOutcome`) with exhaustive unit tests.

## 4. Applying a result (concurrency)

Each result is applied in **one transaction** (`apps/worker/src/apply-result.ts`):

1. `SELECT … FROM monitors WHERE id = $1 FOR UPDATE` — serialises all results for a monitor,
   no matter how many workers run.
2. Drop the result if the monitor was deleted or paused meanwhile.
3. Insert the check and upsert the hourly rollup.
4. If the check *started* before the last applied check (a slow request finishing late), keep it
   for history but do not evaluate it.
5. Run the state machine, then decide the incident action from the **resulting status and whether
   an incident is open** (not from the transition), which makes replays idempotent:
   `DOWN` + no open incident → open; `UP` + open incident → resolve.
6. Insert outbox notification rows; update monitor state and `next_check_at`.

Database constraints back this up:

* `incidents_one_open_per_monitor` — partial unique index on `incidents(monitor_id) WHERE resolved_at IS NULL`.
* `notifications (incident_id, type, channel)` unique — one alert per incident event.

An integration test fires 25 concurrent failing results at one monitor and asserts exactly one
incident and one notification.

## 5. Incidents

* **Start time** = the first failed check of the confirming failure streak (not the moment the
  threshold was reached).
* **Resolution time** = the first successful check of the confirming success streak.
* **Duration** = resolution − start, stored on the incident.
* **Pausing** a monitor closes its open incident at the pause time without a recovery alert (the
  recovery was not observed).
* Editing the URL/method/expected codes/keyword resets the monitor to `PENDING`; an open incident
  stays open until a confirmed `UP` resolves it.

## 6. Notifications

Transactional outbox → BullMQ → email provider.

* Rows are created in the incident transaction with status `PENDING`, or `SKIPPED` (kept for the
  audit log) when disabled by monitor or user preferences.
* After commit, a delivery job is enqueued with `jobId = notification.id`.
* Delivery retries with exponential backoff (`NOTIFICATION_MAX_ATTEMPTS`, default 6;
  `NOTIFICATION_BACKOFF_MS`, default 5 s). Attempts, last error, `sentAt` and final
  `SENT`/`FAILED` status are persisted and visible in **Settings → Notifications**.
* A sweeper re-enqueues rows still `PENDING` after 2 minutes with no job (crash between commit
  and enqueue).
* Delivery is **at-least-once**: a crash after the SMTP server accepted the message but before
  `SENT` is committed can cause one duplicate email.
* Providers: `smtp` (Mailpit in development; SES/Postmark/Resend/… SMTP in production),
  `resend` (Resend HTTPS API — for hosts that block outbound SMTP, such as Railway's Hobby
  plan) and `console` (logs subject + recipient only).

## 7. Analytics definitions

| Metric | Definition |
| --- | --- |
| Uptime % | `successful checks / (successful + failed checks)` in the window |
| No data | zero recorded checks → uptime is `null` ("No data"), **never 100%** |
| Paused time | produces no checks, so it is excluded from both numerator and denominator |
| Missing checks | not counted as up; surfaced as **coverage** = recorded / expected checks (capped at 1) |
| Expected checks | `(window ∩ [createdAt, pausedAt ?? now]) / interval` |
| Avg / min / max latency | over checks that produced a response time |
| p50 / p95 | nearest-rank percentiles, 24 h window only (raw checks) |
| Downtime | union of confirmed incident spans overlapping the window, clipped to it; open incidents run to now |
| Incident count | incidents that *started* inside the window |

Data sources:

* **24 h** — raw `checks` (exact window, true percentiles), bucketed in 15-minute bins with `date_bin`.
* **7 d / 30 d** — `check_rollups_hourly`, maintained in the same transaction as each check
  (hour-granular window edges; no percentiles). 7 d is plotted hourly, 30 d in 6-hour buckets.
* **Daily uptime bars** — rollups grouped by UTC day; days without checks are grey.
* Dashboard "Uptime 24h" is the mean of per-monitor 24 h uptimes (monitors with no data excluded).

Raw checks are pruned after `CHECK_RETENTION_DAYS` (default 30) in bounded batches; rollups are kept.

Known limitation: historical pause periods are not stored, so coverage for a monitor that was
paused in the past and later resumed is under-reported for that window.
