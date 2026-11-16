import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Automated WCAG 2.1 AA scan of the public pages; serious and critical issues fail the build. */
for (const path of ["/", "/login", "/register", "/demo", "/demo/monitors/demo-payments-api", "/demo/incidents"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) e.g. ${v.nodes[0]?.target.join(" ")}`);
    expect(blocking).toEqual([]);
  });
}
