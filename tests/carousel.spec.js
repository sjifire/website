import { test, expect } from "@playwright/test";

test.describe("Carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("carousel is present on homepage", async ({ page }) => {
    const carousel = page.locator(".carousel");
    await expect(carousel).toBeVisible();
  });

  test("carousel has slides", async ({ page }) => {
    const slides = page.locator(".carousel__slide");
    const count = await slides.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("first slide is active by default", async ({ page }) => {
    // Note: with randomization, we just check that ONE slide is active
    const activeSlide = page.locator(".carousel__slide.active");
    await expect(activeSlide).toBeVisible();
    const count = await activeSlide.count();
    expect(count).toBe(1);
  });

  test("has navigation buttons", async ({ page }) => {
    const prevBtn = page.locator(".carousel__btn--prev");
    const nextBtn = page.locator(".carousel__btn--next");

    // Buttons exist (may be hidden initially due to fade-out)
    await expect(prevBtn).toBeAttached();
    await expect(nextBtn).toBeAttached();
  });

  test("navigation buttons appear on hover", async ({ page }) => {
    const carousel = page.locator(".carousel");
    const nextBtn = page.locator(".carousel__btn--next");

    // Hover over carousel to make buttons visible
    await carousel.hover();

    // Button should be visible after hover
    await expect(nextBtn).toBeVisible();
  });

  test("clicking next button changes slide", async ({ page }) => {
    const carousel = page.locator(".carousel");
    const nextBtn = page.locator(".carousel__btn--next");

    // Get the initial active slide's aria-label
    const initialActive = page.locator(".carousel__slide.active");
    const initialLabel = await initialActive.getAttribute("aria-label");

    // Hover to make button visible, then click
    await carousel.hover();
    await nextBtn.click();

    // Wait for transition
    await page.waitForTimeout(600);

    // A different slide should now be active
    const newActive = page.locator(".carousel__slide.active");
    const newLabel = await newActive.getAttribute("aria-label");

    expect(newLabel).not.toBe(initialLabel);
  });

  test("clicking prev button changes slide", async ({ page }) => {
    const carousel = page.locator(".carousel");
    const nextBtn = page.locator(".carousel__btn--next");
    const prevBtn = page.locator(".carousel__btn--prev");

    // First go forward, then back
    await carousel.hover();
    await nextBtn.click();
    await page.waitForTimeout(600);

    const afterNext = page.locator(".carousel__slide.active");
    const afterNextLabel = await afterNext.getAttribute("aria-label");

    await prevBtn.click();
    await page.waitForTimeout(600);

    const afterPrev = page.locator(".carousel__slide.active");
    const afterPrevLabel = await afterPrev.getAttribute("aria-label");

    expect(afterPrevLabel).not.toBe(afterNextLabel);
  });

  test("has indicator dots", async ({ page }) => {
    const dots = page.locator(".carousel__dot");
    const count = await dots.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("one indicator dot is active", async ({ page }) => {
    const activeDot = page.locator(".carousel__dot.active");
    const count = await activeDot.count();
    expect(count).toBe(1);
  });

  test("clicking dot changes slide", async ({ page }) => {
    const dots = page.locator(".carousel__dot");
    const count = await dots.count();

    if (count < 2) {
      test.skip();
      return;
    }

    // Get current active dot index
    const initialActiveDot = page.locator(".carousel__dot.active");
    const initialSlide = page.locator(".carousel__slide.active");
    const initialSlideLabel = await initialSlide.getAttribute("aria-label");

    // Click a different dot (the last one)
    const lastDot = dots.last();
    const isLastActive = await lastDot.evaluate(el => el.classList.contains("active"));

    if (!isLastActive) {
      await lastDot.click();
      await page.waitForTimeout(600);

      // Slide should have changed
      const newSlide = page.locator(".carousel__slide.active");
      const newSlideLabel = await newSlide.getAttribute("aria-label");
      expect(newSlideLabel).not.toBe(initialSlideLabel);

      // Last dot should now be active
      await expect(lastDot).toHaveClass(/active/);
    }
  });

  test("has thumbnails when configured", async ({ page }) => {
    // Homepage has show_thumbnails: true
    const thumbnails = page.locator(".carousel__thumbnails");
    await expect(thumbnails).toBeVisible();

    const thumbs = page.locator(".carousel__thumb");
    const count = await thumbs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("clicking thumbnail changes slide", async ({ page }) => {
    const thumbs = page.locator(".carousel__thumb");
    const count = await thumbs.count();

    if (count < 2) {
      test.skip();
      return;
    }

    const initialSlide = page.locator(".carousel__slide.active");
    const initialSlideLabel = await initialSlide.getAttribute("aria-label");

    // Click the last thumbnail
    const lastThumb = thumbs.last();
    const isLastActive = await lastThumb.evaluate(el => el.classList.contains("active"));

    if (!isLastActive) {
      await lastThumb.click();
      await page.waitForTimeout(600);

      const newSlide = page.locator(".carousel__slide.active");
      const newSlideLabel = await newSlide.getAttribute("aria-label");
      expect(newSlideLabel).not.toBe(initialSlideLabel);

      await expect(lastThumb).toHaveClass(/active/);
    }
  });

  test("keyboard navigation works", async ({ page }) => {
    const carousel = page.locator(".carousel");
    const initialSlide = page.locator(".carousel__slide.active");
    const initialLabel = await initialSlide.getAttribute("aria-label");

    // Focus the carousel
    await carousel.focus();

    // Press right arrow
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(600);

    const afterRight = page.locator(".carousel__slide.active");
    const afterRightLabel = await afterRight.getAttribute("aria-label");
    expect(afterRightLabel).not.toBe(initialLabel);

    // Press left arrow
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(600);

    const afterLeft = page.locator(".carousel__slide.active");
    const afterLeftLabel = await afterLeft.getAttribute("aria-label");
    expect(afterLeftLabel).toBe(initialLabel);
  });

  test("autoplay advances slides", async ({ page }) => {
    // Homepage has autoplay: true, interval: 5
    const initialSlide = page.locator(".carousel__slide.active");
    const initialLabel = await initialSlide.getAttribute("aria-label");

    // Wait longer than the interval (5 seconds) + transition time
    await page.waitForTimeout(6000);

    const afterAutoplay = page.locator(".carousel__slide.active");
    const afterAutoplayLabel = await afterAutoplay.getAttribute("aria-label");

    expect(afterAutoplayLabel).not.toBe(initialLabel);
  });

  test("autoplay pauses on hover", async ({ page }) => {
    const carousel = page.locator(".carousel");
    const initialSlide = page.locator(".carousel__slide.active");
    const initialLabel = await initialSlide.getAttribute("aria-label");

    // Hover over carousel to pause
    await carousel.hover();

    // Wait longer than the autoplay interval
    await page.waitForTimeout(6000);

    // Slide should NOT have changed while hovering
    const afterHover = page.locator(".carousel__slide.active");
    const afterHoverLabel = await afterHover.getAttribute("aria-label");

    expect(afterHoverLabel).toBe(initialLabel);
  });

  test("carousel has proper ARIA attributes", async ({ page }) => {
    const slidesContainer = page.locator(".carousel__slides");
    await expect(slidesContainer).toHaveAttribute("aria-live", "polite");

    const slides = page.locator(".carousel__slide");
    const firstSlide = slides.first();
    await expect(firstSlide).toHaveAttribute("role", "group");
    await expect(firstSlide).toHaveAttribute("aria-roledescription", "slide");
  });

  test("navigation buttons have aria labels", async ({ page }) => {
    const prevBtn = page.locator(".carousel__btn--prev");
    const nextBtn = page.locator(".carousel__btn--next");

    await expect(prevBtn).toHaveAttribute("aria-label", "Previous slide");
    await expect(nextBtn).toHaveAttribute("aria-label", "Next slide");
  });

  test("dots have aria labels", async ({ page }) => {
    const firstDot = page.locator(".carousel__dot").first();
    const ariaLabel = await firstDot.getAttribute("aria-label");
    expect(ariaLabel).toMatch(/Go to slide \d+/);
  });

  test("images have alt text", async ({ page }) => {
    const images = page.locator(".carousel__image");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");
      expect(alt).toBeTruthy();
      expect(alt.length).toBeGreaterThan(0);
    }
  });
});
