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
      await expect(warning.locator('a[href="tel:+13603785334"]')).toBeVisible();
      await expect(page.locator("[data-burn-status]"))
        .not.toHaveAttribute("aria-busy", "true");
      // Never blank, never half-filled.
      await expect(page.locator("[data-row]")).toHaveCount(0);
    });
  }

  test("removes the AQI href instead of leaving a dud href=\"#\" when linkUrl is null", async ({ page }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({ json: { ...PAYLOAD, airQuality: { ...PAYLOAD.airQuality, linkUrl: null } } })
    );
    await page.goto("/");

    const link = page.locator("[data-aqi-link]");
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toBeNull();
  });

  test("never writes a javascript: URL from the API into the AQI href", async ({ page }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({
        json: {
          ...PAYLOAD,
          airQuality: { ...PAYLOAD.airQuality, linkUrl: "javascript:alert(document.cookie)" },
        },
      })
    );
    await page.goto("/");

    const link = page.locator("[data-aqi-link]");
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toBeNull();
  });
});

test.describe("Fire Safety widget, JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("shows the static no-JS fallback with a working phone and permits link", async ({ page }) => {
    await page.goto("/");

    const notice = page.locator(".widget__notice--burn-status");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Live fire status unavailable");
    await expect(notice.locator('a[href="tel:+13603785334"]')).toBeVisible();
    await expect(notice.locator('a[href="/services/burn-permits/"]')).toBeVisible();

    // The un-patched table is still there, but nothing claims to be busy --
    // no JS ran, so nothing ever set aria-busy in the first place.
    await expect(page.locator("[data-burn-status]"))
      .not.toHaveAttribute("aria-busy", "true");
  });
});

test.describe("Head-started request", () => {
  // Both pages that render the widget. /services/burn-permits/ goes through the
  // layout: page -> layout: base chain, which is the case the head snippet's
  // gating can silently miss.
  for (const target of PAGES) {
    test(`starts the request before the deferred script on the ${target.name}`, async ({ page }) => {
      let apiCalls = 0;
      await page.route(ENDPOINT, (route) => {
        apiCalls += 1;
        return route.fulfill({ json: PAYLOAD });
      });

      await page.goto(target.path, { waitUntil: "load" });

      // The real claim: the request starts before /js/burn-status.js has even
      // finished downloading. Comparing against DOMContentLoaded proves nothing
      // -- deferred scripts already run before DCL, so that assertion holds
      // even with the head snippet deleted.
      const timing = await page.evaluate(() => {
        const r = performance.getEntriesByType("resource");
        const api = r.find((e) => e.name.includes("/v1/agencies/sjifire/status"));
        const js = r.find((e) => e.name.includes("burn-status.js"));
        return api && js ? { apiStart: api.startTime, jsEnd: js.responseEnd } : null;
      });
      expect(timing, "expected both the API request and the script").not.toBeNull();
      expect(
        timing.apiStart,
        "API request must start before burn-status.js finishes loading"
      ).toBeLessThan(timing.jsEnd);

      // Exactly one request: the head snippet's, reused by the script.
      expect(apiCalls, "head-started request must be reused, not duplicated").toBe(1);

      await expect(
        page.locator('head link[rel=preconnect][href="https://permits.stationworks.app"]')
      ).toHaveCount(1);
      await expect(page.locator('[data-row="fire-danger"]')).toHaveText("Very High");
    });
  }

  test("omits the head snippet on pages without the widget", async ({ page }) => {
    let apiCalls = 0;
    await page.route(ENDPOINT, (route) => {
      apiCalls += 1;
      return route.fulfill({ json: PAYLOAD });
    });

    await page.goto("/contact/");

    await expect(page.locator("[data-burn-status]")).toHaveCount(0);
    await expect(
      page.locator('head link[rel=preconnect][href*="permits.stationworks"]')
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__burnStatusFetch === undefined)
    ).toBe(true);
    expect(apiCalls, "a page without the widget must not call the API").toBe(0);
  });
});
