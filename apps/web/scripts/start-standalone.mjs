// Run the Next.js standalone build locally exactly as the Docker image does:
// copy static assets next to server.js, then start it.
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneWeb = path.join(webDir, ".next/standalone/apps/web");
if (!existsSync(path.join(standaloneWeb, "server.js"))) {
  console.error("No standalone build found. Run `pnpm --filter @uptimekit/web build` first.");
  process.exit(1);
}
cpSync(path.join(webDir, ".next/static"), path.join(standaloneWeb, ".next/static"), { recursive: true });
if (existsSync(path.join(webDir, "public"))) cpSync(path.join(webDir, "public"), path.join(standaloneWeb, "public"), { recursive: true });

process.env.HOSTNAME ??= "127.0.0.1";
process.env.PORT ??= "3000";
process.env.NODE_ENV = "production";
await import(path.join(standaloneWeb, "server.js"));
