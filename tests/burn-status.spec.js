import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// __dirname, not import.meta.url: package.json has no "type": "module", so
// Playwright transpiles this spec to CJS and import.meta does not survive.
const site = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/_data/site.json"), "utf-8")
);
const WIDGET = site.burn_widget;

// The real widget script is loaded from permits.sjifire.org; only its API
// call is mocked, so these tests prove our embed markup actually boots it.
const API = "https://api.stationworks.app/v1/permits/agencies/**";

// A recorded real response, not a hand-written one: the widget validates the
// payload and renders "temporarily unavailable" for anything short of the
// real contract, which a hand-written mock drifts from as the API grows.
// Re-record with: curl "<api>/v1/permits/agencies/<id>/status?key=<key>"
const PAYLOAD = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/burn-status.json"), "utf-8")
);

// The widget renders on the homepage and in the sidebar of any page with
// include_burn_widget.
const PAGES = [
  { path: "/", name: "homepage" },
  { path: "/services/burn-permits/", name: "Burn Information page" },
];

test.describe("Fire Safety widget", () => {
  for (const target of PAGES) {
    test(`embeds and renders on the ${target.name}`, async ({ page }) => {
      let requested;
      await page.route(API, (route) => {
        requested = route.request().url();
        return route.fulfill({ json: PAYLOAD });
      });
      await page.goto(target.path);

      const widget = page.locator("burn-status");
      await expect(widget).toHaveCount(1);
      await expect(widget).toHaveAttribute("agency-id", WIDGET.agency_id);
      await expect(widget).toHaveAttribute("key", WIDGET.key);
      // Every placement is a sidebar; the full card is for main columns.
      await expect(widget).toHaveAttribute("layout", "compact");
      await expect(page.locator(`script[src="${WIDGET.script}"]`)).toHaveCount(1);

      // Playwright locators pierce open shadow roots.
      await expect(widget.getByText("Can I have a fire today?")).toBeVisible();
      await expect(widget.getByText("Residential Burn Permits")).toBeVisible();
      expect(requested).toContain(WIDGET.agency_id);
    });
  }

  test("shows the fallback notice when the widget script can't load", async ({ page }) => {
    await page.route("**/widget/v1.js", (route) => route.abort());
    await page.goto("/");

    const notice = page.locator("[data-burn-fallback]");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Live fire status unavailable");
    await expect(notice.locator('a[href="tel:+13603785334"]')).toBeVisible();
    await expect(notice.locator(`a[href="${site.permits_url}"]`)).toBeVisible();
  });

  test("keeps the fallback notice hidden when the widget loads", async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    await page.goto("/");

    await expect(page.locator("burn-status").getByText("Can I have a fire today?")).toBeVisible();
    await expect(page.locator("[data-burn-fallback]")).toBeHidden();
  });

  test("preconnects to both embed hosts only on widget pages", async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    const scriptOrigin = new URL(WIDGET.script).origin;

    await page.goto("/");
    await expect(page.locator(`head link[rel=preconnect][href="${scriptOrigin}"]`)).toHaveCount(1);
    await expect(page.locator('head link[rel=preconnect][href="https://api.stationworks.app"]')).toHaveCount(1);

    await page.goto("/contact/");
    await expect(page.locator("burn-status")).toHaveCount(0);
    await expect(page.locator(`head link[rel=preconnect][href="${scriptOrigin}"]`)).toHaveCount(0);
  });

  test("hides the portal button off-sale and links More information to our burn page", async ({ page }) => {
    // The recorded fixture has no permit on sale.
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    await page.goto("/");
    const widget = page.locator("burn-status");
    await expect(widget.getByText("Can I have a fire today?")).toBeVisible();
    await expect(widget.getByRole("link", { name: /See burn permits and rules|Get a burn permit/ })).toHaveCount(0);
    // more-info-href must be absolute; it uses the serving origin, so previews
    // and local dev link to their own copy of the page.
    const origin = new URL(page.url()).origin;
    await expect(widget.getByRole("link", { name: "More information" })).toHaveAttribute(
      "href",
      `${origin}/services/burn-permits/`
    );
  });

  test("leaves the More information link off the Burn Information page itself", async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    await page.goto("/services/burn-permits/");
    const widget = page.locator("burn-status");
    await expect(widget.getByText("Can I have a fire today?")).toBeVisible();
    await expect(widget.getByRole("link", { name: "More information" })).toHaveCount(0);
  });

  test("Burn Information page links to the permits portal", async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    await page.goto("/services/burn-permits/");
    await expect(
      page.locator(".l-grid__main a", { hasText: "Get a Permit Now" }).first()
    ).toHaveAttribute("href", site.permits_url);
  });

  test("Services menu links to the Burn Information page", async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    await page.goto("/");
    await expect(
      page.locator('nav a[href="/services/burn-permits/"]', { hasText: "Burn Information" }).first()
    ).toBeAttached();
  });

  test("homepage Burn Permits quick link goes to the permits portal", async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ json: PAYLOAD }));
    await page.goto("/");
    await expect(
      page.locator(".quick-actions-box__body a", { hasText: "Burn Permits" })
    ).toHaveAttribute("href", site.permits_url);
  });
});

test.describe("Fire Safety widget, JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("shows the static no-JS fallback with a working phone and permits link", async ({ page }) => {
    await page.goto("/");

    // The <noscript> copy; the [data-burn-fallback] one stays hidden with JS off.
    const notice = page.locator(".widget__notice:not([data-burn-fallback])", {
      hasText: "Live fire status unavailable",
    });
    await expect(notice).toBeVisible();
    await expect(notice.locator('a[href="tel:+13603785334"]')).toBeVisible();
    await expect(notice.locator(`a[href="${site.permits_url}"]`)).toBeVisible();
  });
});
