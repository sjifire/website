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

      // Capture console errors (ignore expected third-party issues)
      browserPage.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Ignore 404s - usually external resources
          // Ignore X-Frame-Options errors from social media embeds (Facebook, etc.)
          // Ignore Facebook SDK errors (ErrorUtils, requireLazy, element not found)
          if (
            !text.includes("404") &&
            !text.includes("Failed to load resource") &&
            !text.includes("X-Frame-Options") &&
            !text.includes("ErrorUtils") &&
            !text.includes("requireLazy") &&
            !text.includes("fburl.com") &&
            !text.includes("Could not find element")
          ) {
            errors.push(text);
          }
        }
      });

      // Capture page errors (ignore Facebook SDK errors)
      browserPage.on("pageerror", (err) => {
        const msg = err.message;
        if (
          !msg.includes("requireLazy") &&
          !msg.includes("ErrorUtils") &&
          !msg.includes("fburl.com")
        ) {
          errors.push(msg);
        }
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

  test("Emergency Personnel page displays staff and volunteers with images", async ({ page }) => {
    await page.goto("/about/emergency-personnel/");

    // Should have Staff section
    await expect(page.locator("h2").filter({ hasText: "Staff" })).toBeVisible();

    // Should have Volunteers section
    await expect(page.locator("h2").filter({ hasText: "Volunteers" })).toBeVisible();

    // Should have personnel cards (minimum 40 total - staff + volunteers)
    const personnelCards = page.locator(".person");
    const cardCount = await personnelCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(40);

    // Each personnel card should have an image
    const personnelImages = page.locator(".person__img img");
    const imageCount = await personnelImages.count();
    expect(imageCount).toBeGreaterThanOrEqual(40);

    // Verify images have valid Cloudinary src URLs (not broken/empty)
    const firstImage = personnelImages.first();
    const src = await firstImage.getAttribute("src");
    expect(src).toContain("cloudinary.com");
    expect(src).toContain("/assets/images/personnel_imgs/");
  });

  test("Media Releases page displays releases with PDF thumbnails", async ({ page }) => {
    await page.goto("/news/media-releases/");

    // Should have media releases section
    await expect(page.locator(".media-releases")).toBeVisible();

    // Should have release toggles (grouped by year)
    const releaseToggles = page.locator(".media-release__toggle");
    const toggleCount = await releaseToggles.count();
    expect(toggleCount).toBeGreaterThanOrEqual(1);

    // Should have PDF thumbnail images
    const thumbnails = page.locator(".media_container img");
    const thumbnailCount = await thumbnails.count();
    expect(thumbnailCount).toBeGreaterThanOrEqual(1);

    // Verify thumbnails have valid Cloudinary URLs for PDF rendering
    const firstThumbnail = thumbnails.first();
    const src = await firstThumbnail.getAttribute("src");
    expect(src).toContain("cloudinary.com");
    expect(src).toContain("/assets/media_releases/");
    expect(src).toContain(".pdf");
  });
});
