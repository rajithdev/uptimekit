import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";
export { PrismaClient };

export interface CreatePrismaClientOptions {
  connectionString?: string;
  /** Max pool connections (pg Pool `max`). */
  maxConnections?: number;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString, max: options.maxConnections ?? 10 });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { __uptimekitPrisma?: PrismaClient };

/**
 * Lazily-created process-wide client. Cached on globalThis so Next.js dev-mode hot reloads
 * don't exhaust the connection pool.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__uptimekitPrisma) {
    globalForPrisma.__uptimekitPrisma = createPrismaClient();
  }
  return globalForPrisma.__uptimekitPrisma;
}
