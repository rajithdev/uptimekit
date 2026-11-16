import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env automatically. Load the repo-root .env (if present).
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // `prisma generate` needs no database; migrate commands fail clearly if this is empty.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
