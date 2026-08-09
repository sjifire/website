import { test, expect } from "@playwright/test";

const ENDPOINT = "**/v1/agencies/sjifire/status";

const PAYLOAD = {
  agency: { slug: "sjifire", displayName: "San Juan Island Fire & Rescue" },
  season: { start: "2026-10-06", end: "2027-06-05" },
  fireDanger: "very_high",
  statuses: [
    { slug: "residential", label: "Residential Burn Permits", state: "restricted" },
    { slug: "commercial", label: "Commercial Burn Permits", state: "closed" },
    { slug: "recreational-county", label: "County lands", state: "open" },
    { slug: "recreational-dnr", label: "State Park & DNR lands", state: "closed" },
    { slug: "recreational-nps", label: "National Park lands", state: "closed" },
  ],
  airQuality: {
    station: "Anacortes",
    pm25Aqi: 17,
    category: "Good",
    linkUrl: "https://www.airnow.gov/?reportingArea=Anacortes&stateCode=WA",
  },
};

// The widget renders on the homepage and in the sidebar of interior pages.
const PAGES = [
  { path: "/", name: "homepage" },
  { path: "/services/burn-permits/", name: "sidebar page" },
];

test.describe("Fire Safety widget", () => {
  for (const target of PAGES) {
    test(`fills every row on the ${target.name}`, async ({ page }) => {
      await page.route(ENDPOINT, (route) =>
        route.fulfill({ json: PAYLOAD })
      );
      await page.goto(target.path);

      const widget = page.locator("[data-burn-status]");

      await expect(widget.locator('[data-row="fire-danger"]'))
        .toHaveText("Very High");
      await expect(widget.locator('[data-row="fire-danger"]'))
        .toHaveClass(/level--very-high/);
      await expect(widget.locator('[data-row="residential"]'))
        .toHaveText("Restricted");
      await expect(widget.locator('[data-row="residential"]'))
        .toHaveClass(/level--restricted/);
      await expect(widget.locator('[data-row="recreational-county"]'))
        .toHaveText("Open");
      await expect(widget.locator("[data-season-range]"))
        .toHaveText("Oct 6-Jun 5");
      await expect(widget.locator("[data-aqi-score]")).toHaveText("17");
      await expect(widget).not.toHaveAttribute("aria-busy", "true");

      // No placeholder survives a successful load.
      await expect(widget.locator(".level--unknown")).toHaveCount(0);
    });
  }

  const FAILURES = [
    ["a 500", (route) => route.fulfill({ status: 500, body: "nope" })],
    ["a garbage body", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{{{" })],
    ["an aborted request", (route) => route.abort()],
  ];

  for (const [label, handler] of FAILURES) {
    test(`shows the warning on ${label}`, async ({ page }) => {
      await page.route(ENDPOINT, handler);
      await page.goto("/");

      const warning = page.locator(".widget__warning");
      await expect(warning).toBeVisible();
      await expect(warning).toContainText("Live fire status unavailable");
      await expect(warning.locator('a[href="tel:(360) 378-5334"]')).toBeVisible();
      await expect(page.locator("[data-burn-status]"))
        .not.toHaveAttribute("aria-busy", "true");
      // Never blank, never half-filled.
      await expect(page.locator("[data-row]")).toHaveCount(0);
    });
  }
});
