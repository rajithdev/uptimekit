// Captures README screenshots from a running UptimeKit instance with real monitoring data.
// Usage: SHOT_BASE_URL=http://localhost:3300 SHOT_EMAIL=... SHOT_PASSWORD=... \
//        pnpm --filter @uptimekit/e2e exec tsx support/capture-screenshots.ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const base = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const email = process.env.SHOT_EMAIL;
const password = process.env.SHOT_PASSWORD;
if (!email || !password) throw new Error("Set SHOT_EMAIL and SHOT_PASSWORD");
const out = path.resolve(import.meta.dirname, "../../../docs/screenshots");
mkdirSync(out, { recursive: true });

async function shot(page: Page, name: string, url: string, waitFor?: string) {
  await page.goto(`${base}${url}`);
  if (waitFor) await page.getByText(waitFor).first().waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`saved ${name}.png`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await context.newPage();

await shot(page, "landing", "/");
await page.goto(`${base}/login`);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/dashboard/);

await shot(page, "dashboard", "/dashboard", "Response time");
await shot(page, "monitors", "/monitors", "Uptime · 24h");
const firstMonitor = await page.locator('a[href^="/monitors/c"]').first().getAttribute("href");
if (firstMonitor) await shot(page, "monitor-detail", firstMonitor, "Uptime history");
await shot(page, "incidents", "/incidents", "Duration");
const firstIncident = await page.locator('a[href^="/incidents/c"]').first().getAttribute("href");
if (firstIncident) await shot(page, "incident-detail", firstIncident, "Failure reason");
await shot(page, "new-monitor", "/monitors/new", "Endpoint");
await shot(page, "notifications", "/settings/notifications", "Delivery log");

await page.evaluate(() => localStorage.setItem("theme", "light"));
await shot(page, "dashboard-light", "/dashboard", "Response time");
await page.evaluate(() => localStorage.setItem("theme", "dark"));

await context.close();
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
const m = await mobile.newPage();
await m.goto(`${base}/login`);
await m.getByLabel("Email").fill(email);
await m.getByLabel("Password").fill(password);
await m.getByRole("button", { name: "Sign in" }).click();
await m.waitForURL(/dashboard/);
await shot(m, "mobile-dashboard", "/dashboard", "Response time");
await browser.close();
