# Security

## Threat: server-side request forgery (SSRF)

A monitoring service makes HTTP requests to URLs chosen by its users. Without care, a user could
point a monitor at `http://169.254.169.254/` (cloud credentials), `http://localhost:6379`,
internal admin panels, or a hostname that resolves to one of those. UptimeKit defends in layers;
no layer relies on a string blocklist alone.

### Layer 1 — URL validation (API and worker, every hop)

`validateTargetUrl()` (`packages/shared/src/url-policy.ts`):

* Only `http:` and `https:`; no embedded credentials; max 2048 chars; port 0 rejected.
* Rejects `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.localdomain`, `*.lan`,
  `metadata.google.internal`, other metadata names, and **single-label hosts** (`redis`,
  `postgres` — container DNS names).
* IP literals are classified (below). The WHATWG URL parser normalises exotic forms first, so
  `http://2130706433`, `http://0x7f000001`, `http://0177.0.0.1` and `http://127.1` are all seen
  as `127.0.0.1` and rejected.

### Layer 2 — IP range classification

`checkAddress()` (`packages/shared/src/ip-policy.ts`) parses addresses with `ipaddr.js` and allows
**only globally routable unicast**. Blocked include:

* IPv4: `0.0.0.0/8`, `10/8`, `127/8`, `100.64/10` (CGNAT, Alibaba metadata), `169.254/16`
  (AWS/GCP/Azure metadata), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`,
  `198.51.100/24`, `203.0.113/24`, multicast, `240/4`, broadcast.
* IPv6: `::`, `::1`, `fc00::/7` (incl. AWS `fd00:ec2::254`), `fe80::/10`, `fec0::/10`, multicast,
  documentation, and transition ranges that can embed internal IPv4: `::ffff:0:0/96` (mapped —
  unwrapped and re-checked), `64:ff9b::/96` (NAT64), `2002::/16` (6to4), `2001::/32` (Teredo).

### Layer 3 — connection pinning (DNS-rebinding safe)

The HTTP client is Node's `http`/`https` with a custom `lookup` function
(`packages/shared/src/server/safe-lookup.ts`). Node calls it while opening the socket and
connects to **exactly** the address it returns. The lookup resolves the hostname, validates
**every** returned address, and fails if any is non-public (so mixing a public and a private
record does not work). There is no "validate first, connect later" window to rebind into.
Connection reuse is disabled, so every request passes through the hook.

### Layer 4 — redirects, limits, headers

* Redirects are never followed by the client; UptimeKit follows them manually (max 5) and runs
  layers 1–3 on every hop. Redirects to `file:`, `localhost`, private IPs or metadata are `BLOCKED`.
* Hard overall deadline (1–60 s), 32 KiB header limit, 1 MiB decoded body cap (decompression
  output is counted and both streams destroyed at the cap).
* No user-supplied request headers in v1 (so no secrets are stored or logged). A fixed
  `User-Agent` identifies UptimeKit.

### Network-level isolation (recommended in production)

Application-level controls are complemented by running the worker in a network segment with
egress to the public internet only (no route to the VPC, metadata service, or databases other than
its own Postgres/Redis). On AWS, also enforce IMDSv2 with hop limit 1.

### Test-only escape hatch

`CHECKER_ALLOW_CIDRS` (e.g. `127.0.0.1/32`) lets local tests monitor a server on loopback. It:

* applies only to IP literals/resolved addresses in the listed CIDRs (hostname rules still apply);
* is logged as a warning at worker start;
* is **refused** when `NODE_ENV=production`, unless the Playwright suite sets `UPTIMEKIT_E2E=1`.

Tests: `ip-policy.test.ts`, `url-policy.test.ts`, `http-check.test.ts` (rebinding, mixed records,
redirect to metadata/localhost/file, mapped IPv6), API tests rejecting SSRF on create and update.

## Authentication & sessions

* [Better Auth](https://better-auth.com) email/password: passwords hashed with scrypt; database
  sessions; 7-day expiry refreshed daily.
* Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` when `APP_URL` is https, prefixed `uptimekit.`.
* Auth rate limits (database-backed): sign-in 10/min, sign-up 5/min, change-password 5/min per IP.
* Password change revokes other sessions; users can list/revoke sessions and delete their account.

## Authorization & data isolation

* Every API route goes through `authed()`; every query includes `userId` in its `WHERE`.
* Foreign resources return **404**, not 403, so IDs cannot be probed.
* Zod schemas are `.strict()` — unknown fields (e.g. `userId`, `status`) are rejected, preventing
  mass assignment.
* Integration tests attempt read/update/delete/pause/stats/checks/incident access across users.

## API hardening

* **CSRF:** SameSite=Lax cookies plus an Origin check on all mutating routes; JSON-only bodies
  (`415` otherwise), 64 KiB body limit.
* **Rate limiting:** Redis fixed-window per user — 240 reads/min, 60 writes/min, 10 monitor
  creations/min — with per-process fallback if Redis is unavailable; plus a per-user monitor cap
  (`MAX_MONITORS_PER_USER`).
* **Errors:** consistent `{ error: { code, message, details? } }`; unexpected errors return a
  request id and log the error object only (never headers, cookies or bodies).
* Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`; `X-Powered-By` removed.

## Secrets & logging

* Configuration comes from environment variables only; `.env` files are git-ignored.
* The worker logger (pino) redacts `password`, `token`, `authorization`, `cookie`,
  `DATABASE_URL`, `REDIS_URL`, `SMTP_PASSWORD` keys.
* Email templates HTML-escape user content and strip CR/LF from subjects (header injection).
* Containers run as non-root users.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
