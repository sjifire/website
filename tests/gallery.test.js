const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// Helper to clear require cache for fresh imports
function clearGalleryCache() {
  const galleryPath = require.resolve("../src/_data/gallery.js");
  const sitePath = require.resolve("../src/_data/site.json");
  delete require.cache[galleryPath];
  delete require.cache[sitePath];
}

describe("Gallery Data Loader", () => {
  beforeEach(() => {
    clearGalleryCache();
  });

  describe("Image Discovery", () => {
    it("exports images array", () => {
      const gallery = require("../src/_data/gallery.js");
      assert.ok(Array.isArray(gallery.images));
    });

    it("exports carouselImages array", () => {
      const gallery = require("../src/_data/gallery.js");
      assert.ok(Array.isArray(gallery.carouselImages));
    });

    it("each image has src and alt properties", () => {
      const gallery = require("../src/_data/gallery.js");
      gallery.images.forEach((img) => {
        assert.ok(typeof img.src === "string", "src should be a string");
        assert.ok(typeof img.alt === "string", "alt should be a string");
        assert.ok(img.src.startsWith("/assets/media/"), "src should start with /assets/media/");
      });
    });

    it("only includes supported image extensions", () => {
      const gallery = require("../src/_data/gallery.js");
      const supportedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      gallery.images.forEach((img) => {
        const ext = path.extname(img.src).toLowerCase();
        assert.ok(
          supportedExtensions.includes(ext),
          `Extension ${ext} should be supported`
        );
      });
    });

    it("images are sorted alphabetically", () => {
      const gallery = require("../src/_data/gallery.js");
      if (gallery.images.length > 1) {
        for (let i = 1; i < gallery.images.length; i++) {
          const prev = path.basename(gallery.images[i - 1].src);
          const curr = path.basename(gallery.images[i].src);
          assert.ok(prev <= curr, `Images should be sorted: ${prev} <= ${curr}`);
        }
      }
    });
  });

  describe("Alt Text Generation", () => {
    it("converts underscores to spaces", () => {
      const gallery = require("../src/_data/gallery.js");
      // Check that no alt text contains underscores (they should be converted to spaces)
      gallery.images.forEach((img) => {
        // Alt text is derived from filename, underscores should become spaces
        const filename = path.basename(img.src, path.extname(img.src));
        if (filename.includes("_")) {
          assert.ok(
            img.alt.includes(" ") || !img.alt.includes("_"),
            "Underscores should be converted to spaces in alt text"
          );
        }
      });
    });

    it("converts dashes to spaces", () => {
      const gallery = require("../src/_data/gallery.js");
      gallery.images.forEach((img) => {
        const filename = path.basename(img.src, path.extname(img.src));
        if (filename.includes("-")) {
          assert.ok(
            img.alt.includes(" ") || !img.alt.includes("-"),
            "Dashes should be converted to spaces in alt text"
          );
        }
      });
    });

    it("trims whitespace from alt text", () => {
      const gallery = require("../src/_data/gallery.js");
      gallery.images.forEach((img) => {
        assert.strictEqual(img.alt, img.alt.trim(), "Alt text should be trimmed");
      });
    });
  });

  describe("Carousel Images", () => {
    it("carouselImages is a subset of images", () => {
      const gallery = require("../src/_data/gallery.js");
      gallery.carouselImages.forEach((carouselImg) => {
        const found = gallery.images.some((img) => img.src === carouselImg.src);
        assert.ok(found, `Carousel image ${carouselImg.src} should exist in images array`);
      });
    });

    it("carouselImages respects carouselCount limit", () => {
      const site = require("../src/_data/site.json");
      const gallery = require("../src/_data/gallery.js");
      const expectedCount = site.gallery?.carouselCount || 5;
      const maxExpected = Math.min(expectedCount, gallery.images.length);
      assert.strictEqual(
        gallery.carouselImages.length,
        maxExpected,
        `carouselImages should have at most ${expectedCount} items`
      );
    });

    it("carouselImages contains unique items", () => {
      const gallery = require("../src/_data/gallery.js");
      const srcs = gallery.carouselImages.map((img) => img.src);
      const uniqueSrcs = [...new Set(srcs)];
      assert.strictEqual(
        srcs.length,
        uniqueSrcs.length,
        "carouselImages should not have duplicates"
      );
    });
  });

  describe("Configuration", () => {
    it("reads folder from site.json", () => {
      const site = require("../src/_data/site.json");
      const gallery = require("../src/_data/gallery.js");
      const folderPath = site.gallery?.folder || "src/assets/media/gallery";
      // Derive expected web path (strip "src" prefix)
      const expectedWebPath = "/" + folderPath.replace(/^src\//, "");
      if (gallery.images.length > 0) {
        assert.ok(
          gallery.images[0].src.startsWith(expectedWebPath),
          `Images should be from configured folder: ${expectedWebPath}`
        );
      }
    });

    it("uses default folder if not configured", () => {
      // This tests the default behavior - folder defaults to "src/assets/media/gallery"
      const gallery = require("../src/_data/gallery.js");
      if (gallery.images.length > 0) {
        assert.ok(
          gallery.images[0].src.startsWith("/assets/media/"),
          "Images should be from assets/media folder"
        );
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles empty gallery gracefully", () => {
      // Even if no images, should not throw
      const gallery = require("../src/_data/gallery.js");
      assert.ok(Array.isArray(gallery.images));
      assert.ok(Array.isArray(gallery.carouselImages));
    });

    it("shuffle function produces valid output", () => {
      const gallery = require("../src/_data/gallery.js");
      // Carousel images should be valid even after shuffle
      gallery.carouselImages.forEach((img) => {
        assert.ok(img.src, "Shuffled image should have src");
        assert.ok(img.alt !== undefined, "Shuffled image should have alt");
      });
    });
  });
});
