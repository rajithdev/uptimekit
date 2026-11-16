import { randomUUID } from "node:crypto";
import { getPrisma } from "@uptimekit/database";
import { auth } from "@/lib/server/auth";

export const BASE = "http://localhost:3000";

export async function resetDatabase(): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `TRUNCATE notifications, incidents, check_rollups_hourly, checks, monitors, notification_settings, sessions, accounts, verifications, rate_limits, users RESTART IDENTITY CASCADE`,
  );
}

let ipCounter = 0;
/** A unique client IP per call so Better Auth's per-IP limits don't interfere across tests. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

/** Register through the real Better Auth HTTP handler and return the session cookie. */
export async function signUp(email = `u-${randomUUID()}@example.com`, password = "correct-horse-battery"): Promise<TestUser> {
  const res = await auth().handler(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": freshIp() },
      body: JSON.stringify({ email, password, name: "Test User" }),
    }),
  );
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, email, cookie: cookieFrom(res) };
}

export async function signIn(email: string, password: string, ip = freshIp()): Promise<Response> {
  return auth().handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

export interface CallOptions<P> {
  method?: string;
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  user?: TestUser | null;
  params?: P;
  headers?: Record<string, string>;
  rawBody?: string;
}

/** Invoke a Next.js route handler in-process with a real Request. */
export async function call<P = Record<string, never>>(handler: Handler<P>, opts: CallOptions<P> = {}) {
  const url = new URL(opts.path ?? "/api/test", BASE);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.user) headers.cookie = opts.user.cookie;
  if (opts.body !== undefined || opts.rawBody !== undefined) headers["content-type"] ??= "application/json";
  const req = new Request(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as P) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, json: json as any };
}
