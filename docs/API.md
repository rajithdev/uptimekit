# REST API

Base path: `/api/v1`. All endpoints require an authenticated session cookie (obtained through the
auth endpoints below) and return JSON.

## Conventions

**Errors** always have this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [{ "path": "url", "message": "Target not allowed: internal hostname" }] } }
```

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` / `BAD_REQUEST` | invalid body/query, malformed JSON |
| 401 | `UNAUTHORIZED` | no or invalid session |
| 403 | `FORBIDDEN` | cross-origin write rejected |
| 403 | `LIMIT_EXCEEDED` | per-user monitor cap reached |
| 404 | `NOT_FOUND` | missing **or owned by another user** |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | body is not `application/json` |
| 429 | `RATE_LIMITED` | rate limit hit (`Retry-After` header set) |
| 500 | `INTERNAL_ERROR` | unexpected; includes `requestId` |

**Pagination:** `?page=1&pageSize=20` → `{ "data": [...], "pagination": { "page", "pageSize", "total", "totalPages" } }`.

**Timestamps** are ISO-8601 UTC. Check ids are strings (64-bit integers).

## Authentication (Better Auth)

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/auth/sign-up/email` | `{ name, email, password }` (password 8–128 chars) |
| POST | `/api/auth/sign-in/email` | `{ email, password }` |
| POST | `/api/auth/sign-out` | — |
| GET | `/api/auth/get-session` | — |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword, revokeOtherSessions }` |
| GET | `/api/auth/list-sessions` | — |

Successful sign-in/up sets the `uptimekit.session_token` cookie.

```bash
curl -c jar -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"a-long-password"}' \
  http://localhost:3000/api/auth/sign-up/email
```

## Monitors

### `GET /monitors`

Query: `page`, `pageSize` (≤100), `sort` (`name|createdAt|status|lastCheckedAt|lastResponseTimeMs`),
`order` (`asc|desc`), `status` (`PENDING|UP|DOWN|PAUSED|UNKNOWN`), `q` (name/URL search).

Each item is a monitor plus `stats24h: { uptime, avgResponseTimeMs, checks }` and
`sparkline` (24 hourly average response times, `null` for hours without data).

### `POST /monitors` → `201`

| Field | Type | Default | Rules |
| --- | --- | --- | --- |
| `name` | string | — | 1–100 chars |
| `url` | string | — | http(s), public target (see SECURITY.md) |
| `method` | `GET`\|`HEAD` | `GET` | |
| `intervalSeconds` | int | 60 | `MONITOR_MIN_INTERVAL_SECONDS` (30) – 86400 |
| `timeoutMs` | int | 10000 | 1000–60000, `< intervalSeconds × 1000` |
| `expectedStatusCodes` | string | `200-299` | codes/ranges, e.g. `200,301-302` |
| `keyword` | string\|null | null | ≤200 chars; GET only |
| `followRedirects` | bool | true | |
| `failureThreshold` | int | 2 | 1–10 |
| `recoveryThreshold` | int | 2 | 1–10 |
| `retryIntervalSeconds` | int | 20 | 5–3600 |
| `notificationsEnabled` | bool | true | |

Unknown fields are rejected. Rate limit: 10 creations/min/user.

```bash
curl -b jar -H 'content-type: application/json' \
  -d '{"name":"API","url":"https://api.example.com/health","keyword":"ok"}' \
  http://localhost:3000/api/v1/monitors
```

### `GET /monitors/:id` · `PATCH /monitors/:id` · `DELETE /monitors/:id` (→ `204`)

`PATCH` accepts any subset of the create fields; cross-field rules are validated against the
merged result. Changing the target resets the state to `PENDING` and schedules an immediate check.

### `POST /monitors/:id/pause` · `POST /monitors/:id/resume`

Pause stops checks and closes an open incident at the pause time. Resume sets `PENDING` and
checks immediately. Both are idempotent.

### `GET /monitors/:id/checks`

Raw check history. Query: `page`, `pageSize` (≤500, default 50), `result` (`UP|DOWN`),
`from`, `to` (ISO dates), `order`.

```json
{ "id": "1842", "checkedAt": "…", "result": "DOWN", "responseTimeMs": 31, "statusCode": 503,
  "errorType": "STATUS", "errorMessage": "Unexpected HTTP status 503 (expected 200-299)" }
```

### `GET /monitors/:id/stats?range=24h|7d|30d`

```json
{ "data": {
  "range": "24h", "source": "checks", "windowStart": "…", "windowEnd": "…",
  "uptime": 99.861, "totalChecks": 1440, "upChecks": 1438, "downChecks": 2,
  "expectedChecks": 1440, "coverage": 1,
  "latency": { "avg": 182, "min": 96, "max": 1204, "p50": 170, "p95": 310 },
  "incidents": { "count": 1, "downtimeSeconds": 125 },
  "bucketSeconds": 900,
  "series": [{ "t": "…", "avgResponseTimeMs": 175, "minResponseTimeMs": 120, "maxResponseTimeMs": 240,
               "upChecks": 15, "downChecks": 0, "uptime": 100 }],
  "daily": [{ "date": "2026-11-16", "uptime": 99.86, "checks": 1440 }]
} }
```

`uptime` is `null` when there are no checks. See [MONITORING.md](MONITORING.md#7-analytics-definitions)
for exact definitions.

## Incidents

### `GET /incidents`

Query: `page`, `pageSize`, `status` (`open|resolved|all`), `monitorId`, `order`.

```json
{ "id": "…", "monitorId": "…", "monitor": { "id": "…", "name": "API", "url": "…" },
  "startedAt": "…", "resolvedAt": null, "durationSeconds": null,
  "cause": "Timed out after 10000ms", "errorType": "TIMEOUT", "statusCode": null }
```

### `GET /incidents/:id`

Incident plus `notifications` (delivery status, attempts, last error) and `checks` recorded from
5 minutes before the start until 5 minutes after resolution (max 200).

## Notifications

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notification-settings` | `{ emailEnabled, notifyOnDown, notifyOnRecovery, alertEmail, accountEmail }` |
| PUT | `/notification-settings` | any subset; `alertEmail: null` or `""` uses the account email |
| GET | `/notifications` | delivery log, paginated |

## Dashboard

`GET /dashboard/summary`

```json
{ "data": {
  "totals": { "monitors": 5, "up": 4, "down": 1, "paused": 0, "pending": 0, "unknown": 0 },
  "averageUptime24h": 99.2, "averageResponseTimeMs24h": 240,
  "openIncidents": 1, "incidentsLast24h": 2, "checksLast24h": 7180,
  "recentIncidents": [ … ],
  "responseTimeSeries": [{ "t": "…", "avgResponseTimeMs": 231 }]
} }
```

## Health

`GET /api/health` (no auth) → `200 {"status":"ok","dependencies":{"database":true,"redis":true}}`
or `503` when the database is unreachable. The worker exposes `GET :8081/healthz` (database, Redis,
scheduler freshness).
