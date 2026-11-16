import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionUser, type SessionUser } from "../server/auth";
import { env } from "../server/env";
import { RATE_LIMITS, rateLimit, type RateLimitRule } from "../server/rate-limit";
import { ApiError, type ApiErrorBody } from "./errors";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface HandlerContext<P> {
  request: Request;
  user: SessionUser;
  params: P;
}

type RouteContext<P> = { params: Promise<P> };

export function json<T>(data: T, init?: number | ResponseInit): NextResponse {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, {
    ...responseInit,
    headers: { "Cache-Control": "no-store", ...(responseInit?.headers ?? {}) },
  });
}

function errorResponse(err: ApiError, requestId?: string): NextResponse {
  const body: ApiErrorBody = { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}), ...(requestId ? { requestId } : {}) } };
  return json(body, err.status);
}

/**
 * Reject cross-site browser requests to mutating endpoints (CSRF defence in depth on top of
 * SameSite=Lax cookies). Requests without an Origin header (curl, server-to-server) carry no
 * ambient browser credentials risk and are allowed.
 */
function assertSameOrigin(request: Request): void {
  if (!MUTATING.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = new Set([new URL(env().APP_URL).origin]);
  const host = request.headers.get("host");
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!allowed.has(origin)) throw new ApiError(403, "FORBIDDEN", "Cross-origin request rejected");
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  const text = await request.text();
  if (text.length > 64 * 1024) throw new ApiError(400, "BAD_REQUEST", "Request body too large");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Malformed JSON body");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}

async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const r = await rateLimit(rule, subject);
  if (!r.allowed) {
    const err = new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${r.resetSeconds}s.`);
    (err as ApiError & { retryAfter?: number }).retryAfter = r.resetSeconds;
    throw err;
  }
}

export { enforceRateLimit };

/**
 * Wrap an authenticated JSON route: session lookup, origin check, rate limiting and
 * consistent error responses. Every handler receives the signed-in user and must scope all
 * data access to `user.id`.
 */
export function authed<P = Record<string, never>>(
  handler: (ctx: HandlerContext<P>) => Promise<Response>,
): (request: Request, context: RouteContext<P>) => Promise<Response> {
  return async (request, context) => {
    let requestId: string | undefined;
    try {
      assertSameOrigin(request);
      const user = await getSessionUser(request.headers);
      if (!user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
      await enforceRateLimit(MUTATING.has(request.method) ? RATE_LIMITS.apiWrite : RATE_LIMITS.api, user.id);
      const params = (await context?.params) ?? ({} as P);
      return await handler({ request, user, params });
    } catch (err) {
      if (err instanceof ApiError) {
        const res = errorResponse(err);
        const retryAfter = (err as ApiError & { retryAfter?: number }).retryAfter;
        if (retryAfter) res.headers.set("Retry-After", String(retryAfter));
        return res;
      }
      if (err instanceof ZodError) {
        return errorResponse(
          new ApiError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
      }
      requestId = randomUUID();
      // Log the error object only — never request headers/bodies, which may carry cookies.
      console.error(`[api] unhandled error requestId=${requestId}`, err);
      return errorResponse(new ApiError(500, "INTERNAL_ERROR", "Something went wrong"), requestId);
    }
  };
}
