import { test, expect } from "@playwright/test";

// Horizontal overflow is the failure mode this guards against: when any block is
// wider than the viewport, iOS Safari's text autosizing inflates that block's
// font size to keep it readable at the scaled-down width. The visible symptom is
// giant, clipped text -- which reads as a font bug but is really a width bug, so
// it tends to get diagnosed in the wrong place. Assert the width instead.
//
// Driven off sitemap.xml rather than a hand-kept list so that a new page with a
// wide table is covered the day it ships, without anyone remembering to add it.
//
// 390px is the CSS width of the iPhone 14/15 class of device -- narrow enough to
// catch real breakage, and the narrowest mainstream phone worth supporting.
const VIEWPORT = { width: 390, height: 844 };

// Subpixel layout rounding can leave scrollWidth a hair over clientWidth on a
// page that is visually fine, so require more than a rounding error's worth of
// overflow before failing.
const TOLERANCE_PX = 1;

test.describe("mobile layout", () => {
  test.use({ viewport: VIEWPORT, isMobile: true, hasTouch: true });

  // One test walking every page, rather than one test per page: the whole point
  // is a single report naming every offender, instead of stopping at the first.
  test.setTimeout(180000);

  test("no page overflows the viewport horizontally", async ({ page, baseURL }) => {
    const sitemap = await (await page.request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, loc]) => new URL(loc).pathname,
    );
    expect(paths.length, "sitemap should list pages").toBeGreaterThan(0);

    const offenders = [];
    for (const path of paths) {
      await page.goto(path, { waitUntil: "load" });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      if (overflow > TOLERANCE_PX) {
        // Name the widest element so the failure points at the cause, not just
        // the page. Without this the report tells you a page is broken but
        // leaves you to re-derive which element did it.
        const culprit = await page.evaluate(() => {
          let worst = null;
          for (const el of document.querySelectorAll("body *")) {
            const right = el.getBoundingClientRect().right;
            if (!worst || right > worst.right) {
              worst = {
                right,
                desc:
                  el.tagName.toLowerCase() +
                  (typeof el.className === "string" && el.className
                    ? "." + el.className.trim().split(/\s+/).join(".")
                    : ""),
              };
            }
          }
          return worst?.desc ?? "unknown";
        });
        offenders.push(`${path} (+${overflow}px, widest: <${culprit}>)`);
      }
    }

    expect(
      offenders,
      `Pages wider than the ${VIEWPORT.width}px viewport:\n  ${offenders.join("\n  ")}\n`,
    ).toEqual([]);
  });
});
