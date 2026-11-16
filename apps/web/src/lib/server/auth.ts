import "server-only";
import { getPrisma } from "@uptimekit/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env";

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "UptimeKit",
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL ?? e.APP_URL,
    trustedOrigins: [e.APP_URL],
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh expiry at most daily
    },
    rateLimit: {
      enabled: e.AUTH_RATE_LIMIT_ENABLED,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "uptimekit",
      useSecureCookies: e.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __uptimekitAuth?: Auth };

export function auth(): Auth {
  if (!globalForAuth.__uptimekitAuth) globalForAuth.__uptimekitAuth = createAuth();
  return globalForAuth.__uptimekitAuth;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await auth().api.getSession({ headers });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}
