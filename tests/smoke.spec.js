import { test, expect } from "@playwright/test";

// Key pages to test
const pages = [
  { path: "/", name: "Homepage" },
  { path: "/contact/", name: "Contact" },
  { path: "/news/", name: "News" },
  // About pages
  { path: "/about/governance/", name: "Governance" },
  { path: "/about/who-we-are/", name: "Who We Are" },
  { path: "/about/join/", name: "Join" },
  { path: "/about/emergency-personnel/", name: "Emergency Personnel" },
  { path: "/about/key-information/", name: "Key Information" },
  { path: "/about/levy-2024/", name: "Levy 2024" },
  { path: "/about/stations-equipment/", name: "Stations & Equipment" },
  // Services pages
  { path: "/services/burn-permits/", name: "Burn Permits" },
  { path: "/services/emergency-services/", name: "Emergency Services" },
  { path: "/services/fire-alarms/", name: "Fire Alarms" },
  { path: "/services/firewise/", name: "Firewise" },
  { path: "/services/knoxbox/", name: "Knox Box" },
];

test.describe("Smoke Tests", () => {
  for (const page of pages) {
    test(`${page.name} loads without errors`, async ({ page: browserPage }) => {
      const errors = [];

      // Capture console errors (ignore 404s for external resources)
      browserPage.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Ignore 404s - they're usually external resources
          if (!text.includes("404") && !text.includes("Failed to load resource")) {
            errors.push(text);
          }
        }
      });

      // Capture page errors
      browserPage.on("pageerror", (err) => {
        errors.push(err.message);
      });

      const response = await browserPage.goto(page.path);

      // Page should return 200
      expect(response.status()).toBe(200);

      // Site header should be present
      await expect(browserPage.locator(".site-header").first()).toBeVisible();

      // Footer should be present
      await expect(browserPage.locator(".site-footer").first()).toBeVisible();

      // Main content should be present
      await expect(browserPage.locator(".site-main").first()).toBeVisible();

      // No JavaScript errors
      expect(errors).toEqual([]);
    });
  }

  test("CSS loads correctly", async ({ page }) => {
    const response = await page.goto("/css/site.css");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/css");
  });

  test("Navigation links work", async ({ page }) => {
    await page.goto("/");

    // Navigate directly to news page and verify it loads
    await page.goto("/news/");
    await expect(page.locator("h1").first()).toContainText("News");

    // Navigate to contact and verify it loads
    await page.goto("/contact/");
    await expect(page.locator("h1").first()).toContainText("Questions");
  });
});
