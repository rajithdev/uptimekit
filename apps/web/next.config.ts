import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Local development convenience: share the monorepo-root .env with the worker.
// (Absent in Docker/CI, where configuration comes from real environment variables.)
const rootEnv = path.join(import.meta.dirname, "../../.env");
if (existsSync(rootEnv) && process.env.NODE_ENV !== "production") process.loadEnvFile(rootEnv);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone output includes workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@uptimekit/shared", "@uptimekit/database"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "ioredis"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
