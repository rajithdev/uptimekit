import { expect, test } from "@playwright/test";

/**
 * Public read-only demo: reachable without an account, clearly labelled as sample data,
 * fixture-backed (no API calls), and offers no way to change anything.
 */

test("landing page leads to the demo without signing up", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "View live demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("note", { name: "Sample data notice" })).toBeVisible();
});

test("demo is read-only, fixture-backed and error-free", async ({ page }) => {
  const apiCalls: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("[data-status=DOWN]").first()).toBeVisible();
  await expect(page.locator("[data-status=DEGRADED]").first()).toBeVisible();
  await expect(page.locator("[data-status=UP]").first()).toBeVisible();

  await page.getByRole("link", { name: /Payments API/ }).first().click();
  await expect(page).toHaveURL(/\/demo\/monitors\/demo-payments-api/);
  await expect(page.getByRole("heading", { name: "Payments API" })).toBeVisible();
  await expect(page.getByText("Response time")).toBeVisible();
  await page.getByRole("button", { name: "30 days" }).click();
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("6-hour averages · sample data")).toBeVisible();

  // No controls that could change state.
  for (const name of ["Pause", "Resume", "Edit", "Delete monitor", "New monitor"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }

  await page.getByRole("link", { name: "Incidents", exact: true }).click();
  await expect(page.getByText("Ongoing").first()).toBeVisible();
  await expect(page.getByText("Resolved").first()).toBeVisible();

  expect(apiCalls).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("demo does not grant access to the real API", async ({ request }) => {
  expect((await request.get("/api/v1/monitors")).status()).toBe(401);
  expect((await request.post("/api/v1/monitors", { data: { name: "x", url: "https://example.com" } })).status()).toBe(401);
});

test("demo has no horizontal overflow on a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  for (const path of ["/demo", "/demo/monitors/demo-admin-portal", "/demo/incidents"]) {
    await page.goto(path);
    await expect(page.getByRole("note", { name: "Sample data notice" })).toBeVisible();
    await page.waitForTimeout(300);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll, path).toBeLessThanOrEqual(inner);
  }
  await ctx.close();
});
