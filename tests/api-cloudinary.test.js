const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");

const {
  optimizeImage,
  isOptimizableFile,
  getCloudinaryConfig,
  generateSignature,
  CLOUD_NAME,
  MIN_SIZE_BYTES,
  TRANSFORM,
} = require("../api/src/lib/cloudinary.js");

describe("cloudinary module", () => {
  describe("constants", () => {
    it("CLOUD_NAME is extracted from site config", () => {
      assert.strictEqual(CLOUD_NAME, "san-juan-fire-district-3");
    });

    it("MIN_SIZE_BYTES is 500KB", () => {
      assert.strictEqual(MIN_SIZE_BYTES, 500 * 1024);
    });

    it("TRANSFORM includes limit mode, auto quality and auto format", () => {
      assert.ok(TRANSFORM.includes("c_limit"));
      assert.ok(TRANSFORM.includes("q_auto"));
      assert.ok(TRANSFORM.includes("w_1600"));
      assert.ok(TRANSFORM.includes("h_1600"));
      assert.ok(TRANSFORM.includes("f_auto"));
    });
  });

  describe("isOptimizableFile", () => {
    it("returns true for JPEG files", () => {
      assert.strictEqual(isOptimizableFile("photo.jpg"), true);
      assert.strictEqual(isOptimizableFile("photo.jpeg"), true);
      assert.strictEqual(isOptimizableFile("photo.JPG"), true);
      assert.strictEqual(isOptimizableFile("photo.JPEG"), true);
    });

    it("returns true for PNG files", () => {
      assert.strictEqual(isOptimizableFile("image.png"), true);
      assert.strictEqual(isOptimizableFile("image.PNG"), true);
    });

    it("returns true for GIF files", () => {
      assert.strictEqual(isOptimizableFile("animation.gif"), true);
    });

    it("returns true for WebP files", () => {
      assert.strictEqual(isOptimizableFile("modern.webp"), true);
    });

    it("returns false for SVG files (vector)", () => {
      assert.strictEqual(isOptimizableFile("logo.svg"), false);
    });

    it("returns false for PDF files", () => {
      assert.strictEqual(isOptimizableFile("document.pdf"), false);
    });

    it("returns false for non-image files", () => {
      assert.strictEqual(isOptimizableFile("file.txt"), false);
      assert.strictEqual(isOptimizableFile("file.doc"), false);
      assert.strictEqual(isOptimizableFile("file.html"), false);
    });

    it("returns false for null/undefined/empty", () => {
      assert.strictEqual(isOptimizableFile(null), false);
      assert.strictEqual(isOptimizableFile(undefined), false);
      assert.strictEqual(isOptimizableFile(""), false);
    });
  });

  describe("generateSignature", () => {
    it("generates SHA-1 signature from sorted params", () => {
      const params = { timestamp: 1234567890, transformation: "w_100" };
      const secret = "test-secret";

      const signature = generateSignature(params, secret);

      // Signature should be a hex string
      assert.ok(/^[a-f0-9]{40}$/.test(signature));
    });

    it("produces consistent signatures for same input", () => {
      const params = { timestamp: 1234567890, transformation: "w_100" };
      const secret = "test-secret";

      const sig1 = generateSignature(params, secret);
      const sig2 = generateSignature(params, secret);

      assert.strictEqual(sig1, sig2);
    });

    it("produces different signatures for different secrets", () => {
      const params = { timestamp: 1234567890 };

      const sig1 = generateSignature(params, "secret1");
      const sig2 = generateSignature(params, "secret2");

      assert.notStrictEqual(sig1, sig2);
    });

    it("sorts params alphabetically", () => {
      const params1 = { a: "1", b: "2" };
      const params2 = { b: "2", a: "1" };
      const secret = "test";

      // Same signature regardless of param order
      assert.strictEqual(
        generateSignature(params1, secret),
        generateSignature(params2, secret)
      );
    });
  });

  describe("getCloudinaryConfig", () => {
    const originalApiKey = process.env.CLOUDINARY_API_KEY;
    const originalApiSecret = process.env.CLOUDINARY_API_SECRET;

    afterEach(() => {
      // Restore original values
      if (originalApiKey) {
        process.env.CLOUDINARY_API_KEY = originalApiKey;
      } else {
        delete process.env.CLOUDINARY_API_KEY;
      }
      if (originalApiSecret) {
        process.env.CLOUDINARY_API_SECRET = originalApiSecret;
      } else {
        delete process.env.CLOUDINARY_API_SECRET;
      }
    });

    it("returns null when API key is missing", () => {
      delete process.env.CLOUDINARY_API_KEY;
      process.env.CLOUDINARY_API_SECRET = "secret";

      assert.strictEqual(getCloudinaryConfig(), null);
    });

    it("returns null when API secret is missing", () => {
      process.env.CLOUDINARY_API_KEY = "key";
      delete process.env.CLOUDINARY_API_SECRET;

      assert.strictEqual(getCloudinaryConfig(), null);
    });

    it("returns config when both credentials are present", () => {
      process.env.CLOUDINARY_API_KEY = "test-key";
      process.env.CLOUDINARY_API_SECRET = "test-secret";

      const config = getCloudinaryConfig();

      assert.strictEqual(config.apiKey, "test-key");
      assert.strictEqual(config.apiSecret, "test-secret");
      assert.strictEqual(config.cloudName, "san-juan-fire-district-3");
    });
  });

  describe("optimizeImage", () => {
    const originalApiKey = process.env.CLOUDINARY_API_KEY;
    const originalApiSecret = process.env.CLOUDINARY_API_SECRET;

    afterEach(() => {
      if (originalApiKey) {
        process.env.CLOUDINARY_API_KEY = originalApiKey;
      } else {
        delete process.env.CLOUDINARY_API_KEY;
      }
      if (originalApiSecret) {
        process.env.CLOUDINARY_API_SECRET = originalApiSecret;
      } else {
        delete process.env.CLOUDINARY_API_SECRET;
      }
    });

    it("returns original when no credentials configured", async () => {
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;

      const content = Buffer.from("test image data").toString("base64");
      const result = await optimizeImage(content, "photo.jpg");

      assert.strictEqual(result.content, content);
      assert.strictEqual(result.optimized, false);
      assert.strictEqual(result.reason, "no_credentials");
    });

    it("returns original for non-optimizable file types", async () => {
      process.env.CLOUDINARY_API_KEY = "key";
      process.env.CLOUDINARY_API_SECRET = "secret";

      const content = Buffer.from("svg content").toString("base64");
      const result = await optimizeImage(content, "logo.svg");

      assert.strictEqual(result.content, content);
      assert.strictEqual(result.optimized, false);
      assert.strictEqual(result.reason, "not_optimizable_type");
    });

    it("returns original for PDF files", async () => {
      process.env.CLOUDINARY_API_KEY = "key";
      process.env.CLOUDINARY_API_SECRET = "secret";

      const content = Buffer.from("pdf content").toString("base64");
      const result = await optimizeImage(content, "document.pdf");

      assert.strictEqual(result.content, content);
      assert.strictEqual(result.optimized, false);
      assert.strictEqual(result.reason, "not_optimizable_type");
    });

    it("returns original for files under size threshold", async () => {
      process.env.CLOUDINARY_API_KEY = "key";
      process.env.CLOUDINARY_API_SECRET = "secret";

      // Create content smaller than 500KB
      const smallContent = Buffer.alloc(100 * 1024).toString("base64"); // 100KB
      const result = await optimizeImage(smallContent, "small.jpg");

      assert.strictEqual(result.content, smallContent);
      assert.strictEqual(result.optimized, false);
      assert.strictEqual(result.reason, "already_small");
    });
  });
});
