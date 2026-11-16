import { expect, test, type Page } from "@playwright/test";
import { E2E, targetUrl } from "../support/env";

/**
 * The main user journey, against real services:
 * register → login → create monitor → see real check results → outage → incident + email →
 * recovery → pause → delete. Plus auth guards and cross-user isolation.
 */

test.describe.configure({ mode: "serial" });

const password = "e2e-password-123";
const owner = { name: "E2E Owner", email: `owner-${Date.now()}@example.com` };
const monitorName = "E2E target API";

async function setTarget(mode: "up" | "down") {
  const res = await fetch(`${targetUrl}/__mode/${mode}`, { method: "POST" });
  expect(res.ok).toBeTruthy();
}

async function mailSubjects(): Promise<string[]> {
  const res = await fetch(`${E2E.mailpitApi}/api/v1/messages?limit=100`);
  const body = (await res.json()) as { messages: { Subject: string }[] };
  return body.messages.map((m) => m.Subject);
}

async function register(page: Page, user: { name: string; email: string }) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  const api = await page.request.get("/api/v1/monitors");
  expect(api.status()).toBe(401);
});

test("registration", async ({ page }) => {
  await register(page, owner);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No monitors yet")).toBeVisible();
});

test("login and logout", async ({ page }) => {
  await login(page, owner.email);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, owner.email);
});

test("create a monitor and view real monitoring results", async ({ page }) => {
  await setTarget("up");
  await login(page, owner.email);
  await page.goto("/monitors/new");

  // SSRF protection is visible to the user.
  await page.getByLabel("Name").fill("Metadata");
  await page.getByLabel("URL").fill("http://169.254.169.254/latest/meta-data/");
  await page.getByRole("button", { name: "Create monitor" }).click();
  await expect(page.getByText(/Target not allowed/)).toBeVisible();

  await page.getByLabel("Name").fill(monitorName);
  await page.getByLabel("URL").fill(`${targetUrl}/health`);
  await page.getByLabel("Check interval (seconds)").fill("5");
  await page.getByLabel("Timeout (ms)").fill("2000");
  await page.getByLabel("Failures before DOWN").fill("2");
  await page.getByLabel("Successes before UP").fill("1");
  await page.getByLabel("Confirmation retry (s)").fill("5");
  await page.getByRole("button", { name: "Create monitor" }).click();

  await expect(page.getByRole("heading", { name: monitorName })).toBeVisible();
  // The worker performs a real HTTP check; the UI polls and shows the recorded result.
  await expect(page.locator("[data-status=UP]").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("cell", { name: "200" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Last checked/)).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(monitorName)).toBeVisible();
  await expect(page.getByText("All active monitors are operational")).toBeVisible();
});

test("an outage opens an incident, sends an email, and recovery resolves it", async ({ page }) => {
  await login(page, owner.email);
  await page.goto("/monitors");
  await page.getByRole("link", { name: monitorName }).click();

  await setTarget("down");
  await expect(page.locator("[data-status=DOWN]").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Currently down/)).toBeVisible();

  await page.goto("/incidents");
  await page.getByRole("link", { name: monitorName }).click();
  await expect(page.getByRole("heading", { name: `${monitorName} outage` })).toBeVisible();
  await expect(page.getByText("Ongoing").first()).toBeVisible();
  await expect(page.getByText(/Unexpected HTTP status 503/).first()).toBeVisible();

  await expect.poll(mailSubjects, { timeout: 30_000 }).toContain(`[DOWN] ${monitorName} is not responding`);

  await setTarget("up");
  await expect(page.getByText("Resolved").first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(mailSubjects, { timeout: 30_000 }).toContain(`[RECOVERED] ${monitorName} is back up`);
  await expect(page.getByText("Recovery alert").first()).toBeVisible();
});

test("other users cannot see the monitor", async ({ page }) => {
  await register(page, { name: "Someone Else", email: `other-${Date.now()}@example.com` });
  await expect(page.getByText("No monitors yet")).toBeVisible();
  await page.goto("/incidents");
  await expect(page.getByText(monitorName)).toHaveCount(0);
  const list = await page.request.get("/api/v1/monitors");
  expect((await list.json()).data).toEqual([]);
});

test("pause and resume a monitor", async ({ page }) => {
  await login(page, owner.email);
  await page.goto("/monitors");
  await page.getByRole("link", { name: monitorName }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator("[data-status=PAUSED]").first()).toBeVisible();

  // No checks are recorded while paused.
  const id = page.url().split("/").pop()!;
  const before = (await (await page.request.get(`/api/v1/monitors/${id}/checks?pageSize=1`)).json()).pagination.total;
  await page.waitForTimeout(7_000);
  const after = (await (await page.request.get(`/api/v1/monitors/${id}/checks?pageSize=1`)).json()).pagination.total;
  expect(after).toBe(before);

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator("[data-status=UP]").first()).toBeVisible({ timeout: 45_000 });
});

test("delete a monitor", async ({ page }) => {
  await login(page, owner.email);
  await page.goto("/monitors");
  await page.getByRole("link", { name: monitorName }).click();
  await page.getByRole("button", { name: "Delete monitor" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete monitor" }).click();
  await expect(page).toHaveURL(/\/monitors$/);
  await expect(page.getByText("No monitors yet")).toBeVisible();
});
