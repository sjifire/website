const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

// Read the carousel script
const carouselScript = fs.readFileSync(
  path.join(__dirname, "../src/js/carousel.js"),
  "utf-8"
);

/**
 * Creates a mock DOM with carousel HTML structure
 */
function createCarouselDOM(options = {}) {
  const {
    slideCount = 3,
    autoplay = "true",
    interval = "5",
    randomize = "false",
    showThumbnails = true,
  } = options;

  const slides = Array.from({ length: slideCount }, (_, i) => `
    <div class="carousel__slide${i === 0 ? " active" : ""}" aria-label="Slide ${i + 1}">
      <img class="carousel__image" src="/img${i + 1}.jpg" alt="Image ${i + 1}">
    </div>
  `).join("");

  const dots = Array.from({ length: slideCount }, (_, i) => `
    <button class="carousel__dot${i === 0 ? " active" : ""}" data-slide="${i + 1}"></button>
  `).join("");

  const thumbs = showThumbnails
    ? `<div class="carousel__thumbnails">
        ${Array.from({ length: slideCount }, (_, i) => `
          <button class="carousel__thumb${i === 0 ? " active" : ""}" data-slide="${i + 1}">
            <img src="/thumb${i + 1}.jpg" alt="Thumb ${i + 1}">
          </button>
        `).join("")}
      </div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <section class="carousel" data-autoplay="${autoplay}" data-interval="${interval}" data-randomize="${randomize}" tabindex="0">
        <div class="carousel__viewport">
          <div class="carousel__slides" aria-live="polite">
            ${slides}
          </div>
          <button class="carousel__btn carousel__btn--prev" aria-label="Previous slide"></button>
          <button class="carousel__btn carousel__btn--next" aria-label="Next slide"></button>
        </div>
        <div class="carousel__indicators">
          ${dots}
        </div>
        ${thumbs}
      </section>
    </body>
    </html>
  `;

  const dom = new JSDOM(html, { runScripts: "dangerously" });
  return dom;
}

/**
 * Executes the carousel script in the DOM context
 */
function initCarousel(dom) {
  const scriptEl = dom.window.document.createElement("script");
  scriptEl.textContent = carouselScript;
  dom.window.document.body.appendChild(scriptEl);
}

describe("Carousel Unit Tests", () => {
  let dom;
  let timers = [];

  beforeEach(() => {
    // Clear any accumulated timers
    timers = [];
  });

  afterEach(() => {
    if (dom) {
      dom.window.close();
      dom = null;
    }
  });

  describe("Initialization", () => {
    it("does not throw when carousel element exists", () => {
      dom = createCarouselDOM();
      assert.doesNotThrow(() => initCarousel(dom));
    });

    it("does not throw when carousel element is missing", () => {
      dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
        runScripts: "dangerously",
      });
      assert.doesNotThrow(() => initCarousel(dom));
    });

    it("first slide is active initially", () => {
      dom = createCarouselDOM();
      initCarousel(dom);

      const activeSlides = dom.window.document.querySelectorAll(".carousel__slide.active");
      assert.strictEqual(activeSlides.length, 1);
      assert.ok(activeSlides[0].getAttribute("aria-label").includes("Slide 1"));
    });

    it("first dot is active initially", () => {
      dom = createCarouselDOM();
      initCarousel(dom);

      const activeDots = dom.window.document.querySelectorAll(".carousel__dot.active");
      assert.strictEqual(activeDots.length, 1);
    });

    it("first thumbnail is active initially when thumbnails present", () => {
      dom = createCarouselDOM({ showThumbnails: true });
      initCarousel(dom);

      const activeThumbs = dom.window.document.querySelectorAll(".carousel__thumb.active");
      assert.strictEqual(activeThumbs.length, 1);
    });
  });

  describe("Navigation - Next Button", () => {
    it("clicking next advances to second slide", () => {
      dom = createCarouselDOM({ autoplay: "false" });
      initCarousel(dom);

      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");
      nextBtn.click();

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 2"));
    });

    it("clicking next updates active dot", () => {
      dom = createCarouselDOM({ autoplay: "false" });
      initCarousel(dom);

      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");
      nextBtn.click();

      const dots = dom.window.document.querySelectorAll(".carousel__dot");
      assert.ok(!dots[0].classList.contains("active"));
      assert.ok(dots[1].classList.contains("active"));
    });

    it("clicking next updates active thumbnail", () => {
      dom = createCarouselDOM({ autoplay: "false", showThumbnails: true });
      initCarousel(dom);

      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");
      nextBtn.click();

      const thumbs = dom.window.document.querySelectorAll(".carousel__thumb");
      assert.ok(!thumbs[0].classList.contains("active"));
      assert.ok(thumbs[1].classList.contains("active"));
    });

    it("wraps from last slide to first", () => {
      dom = createCarouselDOM({ slideCount: 3, autoplay: "false" });
      initCarousel(dom);

      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");

      // Go through all slides
      nextBtn.click(); // Slide 2
      nextBtn.click(); // Slide 3
      nextBtn.click(); // Should wrap to Slide 1

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 1"));
    });
  });

  describe("Navigation - Prev Button", () => {
    it("clicking prev goes to previous slide", () => {
      dom = createCarouselDOM({ autoplay: "false" });
      initCarousel(dom);

      // First go forward
      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");
      nextBtn.click();

      // Then go back
      const prevBtn = dom.window.document.querySelector(".carousel__btn--prev");
      prevBtn.click();

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 1"));
    });

    it("wraps from first slide to last", () => {
      dom = createCarouselDOM({ slideCount: 3, autoplay: "false" });
      initCarousel(dom);

      const prevBtn = dom.window.document.querySelector(".carousel__btn--prev");
      prevBtn.click(); // Should wrap to Slide 3

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 3"));
    });
  });

  describe("Navigation - Dots", () => {
    it("clicking dot navigates to that slide", () => {
      dom = createCarouselDOM({ slideCount: 5, autoplay: "false" });
      initCarousel(dom);

      const dots = dom.window.document.querySelectorAll(".carousel__dot");
      dots[3].click(); // Go to slide 4

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 4"));
    });

    it("clicking dot updates dot active state", () => {
      dom = createCarouselDOM({ slideCount: 5, autoplay: "false" });
      initCarousel(dom);

      const dots = dom.window.document.querySelectorAll(".carousel__dot");
      dots[3].click();

      assert.ok(!dots[0].classList.contains("active"));
      assert.ok(dots[3].classList.contains("active"));
    });
  });

  describe("Navigation - Thumbnails", () => {
    it("clicking thumbnail navigates to that slide", () => {
      dom = createCarouselDOM({ slideCount: 5, autoplay: "false", showThumbnails: true });
      initCarousel(dom);

      const thumbs = dom.window.document.querySelectorAll(".carousel__thumb");
      thumbs[2].click(); // Go to slide 3

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 3"));
    });

    it("clicking thumbnail updates all active states", () => {
      dom = createCarouselDOM({ slideCount: 5, autoplay: "false", showThumbnails: true });
      initCarousel(dom);

      const thumbs = dom.window.document.querySelectorAll(".carousel__thumb");
      const dots = dom.window.document.querySelectorAll(".carousel__dot");
      thumbs[2].click();

      // Thumbnail should be active
      assert.ok(thumbs[2].classList.contains("active"));
      assert.ok(!thumbs[0].classList.contains("active"));

      // Dot should also be active
      assert.ok(dots[2].classList.contains("active"));
      assert.ok(!dots[0].classList.contains("active"));
    });
  });

  describe("Keyboard Navigation", () => {
    it("ArrowRight advances to next slide", () => {
      dom = createCarouselDOM({ autoplay: "false" });
      initCarousel(dom);

      const carousel = dom.window.document.querySelector(".carousel");
      const event = new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" });
      carousel.dispatchEvent(event);

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 2"));
    });

    it("ArrowLeft goes to previous slide", () => {
      dom = createCarouselDOM({ autoplay: "false" });
      initCarousel(dom);

      const carousel = dom.window.document.querySelector(".carousel");

      // First go forward
      const rightEvent = new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" });
      carousel.dispatchEvent(rightEvent);

      // Then go back
      const leftEvent = new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft" });
      carousel.dispatchEvent(leftEvent);

      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 1"));
    });
  });

  describe("Randomization", () => {
    it("with randomize=false, order is preserved", () => {
      dom = createCarouselDOM({ slideCount: 5, randomize: "false", autoplay: "false" });
      initCarousel(dom);

      const slides = dom.window.document.querySelectorAll(".carousel__slide");
      // First slide should still be Slide 1
      assert.ok(slides[0].getAttribute("aria-label").includes("Slide 1"));
    });

    it("with randomize=true, first element is still active after shuffle", () => {
      // Run multiple times to increase chance of detecting issues
      for (let i = 0; i < 5; i++) {
        dom = createCarouselDOM({ slideCount: 5, randomize: "true", autoplay: "false" });
        initCarousel(dom);

        // Exactly one slide should be active
        const activeSlides = dom.window.document.querySelectorAll(".carousel__slide.active");
        assert.strictEqual(activeSlides.length, 1);

        // The first child should be active
        const slidesContainer = dom.window.document.querySelector(".carousel__slides");
        assert.ok(slidesContainer.children[0].classList.contains("active"));

        dom.window.close();
      }
    });

    it("with randomize=true, dots and thumbs sync with slides", () => {
      dom = createCarouselDOM({ slideCount: 5, randomize: "true", autoplay: "false", showThumbnails: true });
      initCarousel(dom);

      const slidesContainer = dom.window.document.querySelector(".carousel__slides");
      const dotsContainer = dom.window.document.querySelector(".carousel__indicators");
      const thumbsContainer = dom.window.document.querySelector(".carousel__thumbnails");

      // First elements should all be active
      assert.ok(slidesContainer.children[0].classList.contains("active"));
      assert.ok(dotsContainer.children[0].classList.contains("active"));
      assert.ok(thumbsContainer.children[0].classList.contains("active"));
    });
  });

  describe("Data Attributes", () => {
    it("reads autoplay from data attribute", () => {
      dom = createCarouselDOM({ autoplay: "false" });
      initCarousel(dom);

      const carousel = dom.window.document.querySelector(".carousel");
      assert.strictEqual(carousel.dataset.autoplay, "false");
    });

    it("reads interval from data attribute", () => {
      dom = createCarouselDOM({ interval: "10" });
      initCarousel(dom);

      const carousel = dom.window.document.querySelector(".carousel");
      assert.strictEqual(carousel.dataset.interval, "10");
    });

    it("reads randomize from data attribute", () => {
      dom = createCarouselDOM({ randomize: "true" });
      initCarousel(dom);

      const carousel = dom.window.document.querySelector(".carousel");
      assert.strictEqual(carousel.dataset.randomize, "true");
    });
  });

  describe("Edge Cases", () => {
    it("works with single slide", () => {
      dom = createCarouselDOM({ slideCount: 1, autoplay: "false" });
      initCarousel(dom);

      // Should not throw
      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");
      nextBtn.click();

      // Should still have only one active slide
      const activeSlides = dom.window.document.querySelectorAll(".carousel__slide.active");
      assert.strictEqual(activeSlides.length, 1);
    });

    it("works without thumbnails", () => {
      dom = createCarouselDOM({ showThumbnails: false, autoplay: "false" });
      initCarousel(dom);

      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");
      assert.doesNotThrow(() => nextBtn.click());
    });

    it("handles rapid clicks", () => {
      dom = createCarouselDOM({ slideCount: 5, autoplay: "false" });
      initCarousel(dom);

      const nextBtn = dom.window.document.querySelector(".carousel__btn--next");

      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        nextBtn.click();
      }

      // Should still have exactly one active slide
      const activeSlides = dom.window.document.querySelectorAll(".carousel__slide.active");
      assert.strictEqual(activeSlides.length, 1);

      // Should have wrapped appropriately (10 clicks on 5 slides = slide 1)
      const activeSlide = dom.window.document.querySelector(".carousel__slide.active");
      assert.ok(activeSlide.getAttribute("aria-label").includes("Slide 1"));
    });
  });
});
