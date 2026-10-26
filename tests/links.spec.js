import { test, expect } from "@playwright/test";

// base.liquid opens external links and PDFs in a new tab. Inject one link of
// each kind into a real page's HTML so the check doesn't depend on what editors
// happen to have linked from it.
const PROBES = `
<a id="probe-pdf" href="/assets/media/docs/example.pdf">pdf</a>
<a id="probe-pdf-upper" href="/assets/media/docs/EXAMPLE.PDF">pdf upper</a>
<a id="probe-internal" href="/news/">internal</a>
<a id="probe-external" href="https://example.com/">external</a>
`;

test("external links and PDFs open in a new tab; internal pages don't", async ({ page }) => {
  await page.route("**/widget/v1.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" })
  );
  await page.route("**/contact/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("</main>", `${PROBES}</main>`);
    await route.fulfill({ response, body });
  });

  await page.goto("/contact/");

  for (const id of ["probe-pdf", "probe-pdf-upper", "probe-external"]) {
    await expect(page.locator(`#${id}`)).toHaveAttribute("target", "_blank");
    await expect(page.locator(`#${id}`)).toHaveAttribute("rel", "noopener");
  }
  await expect(page.locator("#probe-internal")).not.toHaveAttribute("target", /.*/);
});
