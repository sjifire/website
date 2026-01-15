const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

// Read the gallery script
const galleryScript = fs.readFileSync(
  path.join(__dirname, "../src/js/gallery.js"),
  "utf-8"
);

/**
 * Creates a mock DOM with gallery HTML structure
 */
function createGalleryDOM(options = {}) {
  const { imageCount = 5 } = options;

  const thumbnails = Array.from({ length: imageCount }, (_, i) => `
    <button type="button" class="photo-gallery__item" data-index="${i}">
      <img class="photo-gallery__thumb" src="/thumb${i + 1}.jpg" alt="Image ${i + 1}">
    </button>
  `).join("");

  const slides = Array.from({ length: imageCount }, (_, i) => `
    <div class="gallery-lightbox__slide${i === 0 ? " active" : ""}" data-index="${i}">
      <img class="gallery-lightbox__image" src="/img${i + 1}.jpg" alt="Image ${i + 1}">
      <p class="gallery-lightbox__caption">Image ${i + 1}</p>
    </div>
  `).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <div class="photo-gallery">
        ${thumbnails}
      </div>

      <div class="gallery-lightbox" id="gallery-lightbox" role="dialog" aria-modal="true">
        <div class="gallery-lightbox__backdrop"></div>
        <button type="button" class="gallery-lightbox__close" aria-label="Close"></button>
        <div class="gallery-lightbox__content">
          <div class="gallery-lightbox__slides">
            ${slides}
          </div>
          <button type="button" class="gallery-lightbox__btn gallery-lightbox__btn--prev" aria-label="Previous"></button>
          <button type="button" class="gallery-lightbox__btn gallery-lightbox__btn--next" aria-label="Next"></button>
        </div>
        <div class="gallery-lightbox__counter">
          <span class="gallery-lightbox__current">1</span> / <span class="gallery-lightbox__total">${imageCount}</span>
        </div>
      </div>
    </body>
    </html>
  `;

  const dom = new JSDOM(html, { runScripts: "dangerously" });
  return dom;
}

/**
 * Executes the gallery script in the DOM context
 */
function initGallery(dom) {
  const scriptEl = dom.window.document.createElement("script");
  scriptEl.textContent = galleryScript;
  dom.window.document.body.appendChild(scriptEl);
}

describe("Gallery Lightbox Unit Tests", () => {
  let dom;

  afterEach(() => {
    if (dom) {
      dom.window.close();
      dom = null;
    }
  });

  describe("Initialization", () => {
    it("does not throw when lightbox element exists", () => {
      dom = createGalleryDOM();
      assert.doesNotThrow(() => initGallery(dom));
    });

    it("does not throw when lightbox element is missing", () => {
      dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
        runScripts: "dangerously",
      });
      assert.doesNotThrow(() => initGallery(dom));
    });

    it("lightbox is not active initially", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      const lightbox = dom.window.document.getElementById("gallery-lightbox");
      assert.ok(!lightbox.classList.contains("active"));
    });

    it("first slide is active initially", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      const activeSlides = dom.window.document.querySelectorAll(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlides.length, 1);
      assert.strictEqual(activeSlides[0].dataset.index, "0");
    });
  });

  describe("Opening Lightbox", () => {
    it("clicking thumbnail opens lightbox", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      const lightbox = dom.window.document.getElementById("gallery-lightbox");
      assert.ok(lightbox.classList.contains("active"));
    });

    it("clicking thumbnail shows correct slide", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      const thumbs = dom.window.document.querySelectorAll(".photo-gallery__item");
      thumbs[2].click(); // Click third thumbnail

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "2");
    });

    it("clicking thumbnail updates counter", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      const thumbs = dom.window.document.querySelectorAll(".photo-gallery__item");
      thumbs[2].click(); // Click third thumbnail

      const counter = dom.window.document.querySelector(".gallery-lightbox__current");
      assert.strictEqual(counter.textContent, "3"); // 1-indexed
    });

    it("opening lightbox sets body overflow hidden", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      assert.strictEqual(dom.window.document.body.style.overflow, "hidden");
    });
  });

  describe("Closing Lightbox", () => {
    it("clicking close button closes lightbox", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      // Open first
      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      // Then close
      const closeBtn = dom.window.document.querySelector(".gallery-lightbox__close");
      closeBtn.click();

      const lightbox = dom.window.document.getElementById("gallery-lightbox");
      assert.ok(!lightbox.classList.contains("active"));
    });

    it("clicking backdrop closes lightbox", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      // Open first
      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      // Then close via backdrop
      const backdrop = dom.window.document.querySelector(".gallery-lightbox__backdrop");
      backdrop.click();

      const lightbox = dom.window.document.getElementById("gallery-lightbox");
      assert.ok(!lightbox.classList.contains("active"));
    });

    it("closing lightbox restores body overflow", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      const closeBtn = dom.window.document.querySelector(".gallery-lightbox__close");
      closeBtn.click();

      assert.strictEqual(dom.window.document.body.style.overflow, "");
    });
  });

  describe("Navigation - Next Button", () => {
    it("clicking next advances to next slide", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      // Open lightbox
      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      // Click next
      const nextBtn = dom.window.document.querySelector(".gallery-lightbox__btn--next");
      nextBtn.click();

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "1");
    });

    it("clicking next wraps from last to first", () => {
      dom = createGalleryDOM({ imageCount: 3 });
      initGallery(dom);

      // Open lightbox on last slide
      const thumbs = dom.window.document.querySelectorAll(".photo-gallery__item");
      thumbs[2].click();

      // Click next - should wrap to first
      const nextBtn = dom.window.document.querySelector(".gallery-lightbox__btn--next");
      nextBtn.click();

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });

    it("clicking next updates counter", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      const nextBtn = dom.window.document.querySelector(".gallery-lightbox__btn--next");
      nextBtn.click();

      const counter = dom.window.document.querySelector(".gallery-lightbox__current");
      assert.strictEqual(counter.textContent, "2");
    });
  });

  describe("Navigation - Prev Button", () => {
    it("clicking prev goes to previous slide", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      // Open on second slide
      const thumbs = dom.window.document.querySelectorAll(".photo-gallery__item");
      thumbs[1].click();

      // Click prev
      const prevBtn = dom.window.document.querySelector(".gallery-lightbox__btn--prev");
      prevBtn.click();

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });

    it("clicking prev wraps from first to last", () => {
      dom = createGalleryDOM({ imageCount: 3 });
      initGallery(dom);

      // Open lightbox on first slide
      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      // Click prev - should wrap to last
      const prevBtn = dom.window.document.querySelector(".gallery-lightbox__btn--prev");
      prevBtn.click();

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "2");
    });
  });

  describe("Keyboard Navigation", () => {
    it("Escape closes lightbox", () => {
      dom = createGalleryDOM();
      initGallery(dom);

      // Open first
      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      // Press Escape
      const event = new dom.window.KeyboardEvent("keydown", { key: "Escape" });
      dom.window.document.dispatchEvent(event);

      const lightbox = dom.window.document.getElementById("gallery-lightbox");
      assert.ok(!lightbox.classList.contains("active"));
    });

    it("ArrowRight advances to next slide", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      const event = new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" });
      dom.window.document.dispatchEvent(event);

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "1");
    });

    it("ArrowLeft goes to previous slide", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      // Open on second slide
      const thumbs = dom.window.document.querySelectorAll(".photo-gallery__item");
      thumbs[1].click();

      const event = new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft" });
      dom.window.document.dispatchEvent(event);

      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });

    it("keyboard navigation does nothing when lightbox is closed", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      // Don't open lightbox, try keyboard nav
      const event = new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" });
      dom.window.document.dispatchEvent(event);

      // First slide should still be active (no change)
      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });
  });

  describe("Edge Cases", () => {
    it("works with single image", () => {
      dom = createGalleryDOM({ imageCount: 1 });
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      // Should not throw when clicking next/prev
      const nextBtn = dom.window.document.querySelector(".gallery-lightbox__btn--next");
      assert.doesNotThrow(() => nextBtn.click());

      // Should still be on the same slide
      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });

    it("handles rapid navigation clicks", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      const thumb = dom.window.document.querySelector(".photo-gallery__item");
      thumb.click();

      const nextBtn = dom.window.document.querySelector(".gallery-lightbox__btn--next");

      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        nextBtn.click();
      }

      // Should have exactly one active slide
      const activeSlides = dom.window.document.querySelectorAll(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlides.length, 1);

      // 10 clicks on 5 slides = index 0
      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });

    it("maintains state after open/close cycle", () => {
      dom = createGalleryDOM({ imageCount: 5 });
      initGallery(dom);

      // Open on third slide
      const thumbs = dom.window.document.querySelectorAll(".photo-gallery__item");
      thumbs[2].click();

      // Close
      const closeBtn = dom.window.document.querySelector(".gallery-lightbox__close");
      closeBtn.click();

      // Reopen on first slide
      thumbs[0].click();

      // Should show first slide, not third
      const activeSlide = dom.window.document.querySelector(".gallery-lightbox__slide.active");
      assert.strictEqual(activeSlide.dataset.index, "0");
    });
  });
});
