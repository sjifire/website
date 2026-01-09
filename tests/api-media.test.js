const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

const {
  MEDIA_ROOT,
  MEDIA_EXTENSIONS,
  formatMediaItem,
  isMediaFile,
  getCorsHeaders,
  createMediaOperations,
} = require("../api/src/lib/media.js");

describe("media module", () => {
  describe("constants", () => {
    it("MEDIA_ROOT points to src/assets/images", () => {
      assert.strictEqual(MEDIA_ROOT, "src/assets/images");
    });

    it("MEDIA_EXTENSIONS includes common image formats and pdf", () => {
      assert.ok(MEDIA_EXTENSIONS.includes("jpg"));
      assert.ok(MEDIA_EXTENSIONS.includes("jpeg"));
      assert.ok(MEDIA_EXTENSIONS.includes("png"));
      assert.ok(MEDIA_EXTENSIONS.includes("gif"));
      assert.ok(MEDIA_EXTENSIONS.includes("webp"));
      assert.ok(MEDIA_EXTENSIONS.includes("svg"));
      assert.ok(MEDIA_EXTENSIONS.includes("pdf"));
    });
  });

  describe("isMediaFile", () => {
    it("returns true for supported image extensions", () => {
      assert.strictEqual(isMediaFile("photo.jpg"), true);
      assert.strictEqual(isMediaFile("photo.jpeg"), true);
      assert.strictEqual(isMediaFile("photo.png"), true);
      assert.strictEqual(isMediaFile("photo.gif"), true);
      assert.strictEqual(isMediaFile("photo.webp"), true);
      assert.strictEqual(isMediaFile("photo.svg"), true);
    });

    it("returns true for PDF files", () => {
      assert.strictEqual(isMediaFile("document.pdf"), true);
    });

    it("returns true regardless of case", () => {
      assert.strictEqual(isMediaFile("photo.JPG"), true);
      assert.strictEqual(isMediaFile("photo.PNG"), true);
      assert.strictEqual(isMediaFile("document.PDF"), true);
    });

    it("returns false for unsupported extensions", () => {
      assert.strictEqual(isMediaFile("file.txt"), false);
      assert.strictEqual(isMediaFile("file.doc"), false);
      assert.strictEqual(isMediaFile("file.html"), false);
      assert.strictEqual(isMediaFile("file.js"), false);
    });

    it("returns false for null/undefined/empty", () => {
      assert.strictEqual(isMediaFile(null), false);
      assert.strictEqual(isMediaFile(undefined), false);
      assert.strictEqual(isMediaFile(""), false);
    });
  });

  describe("formatMediaItem", () => {
    it("formats a GitHub file path into TinaCMS media format", () => {
      const result = formatMediaItem(
        "src/assets/images/photo.jpg",
        "photo.jpg",
        ""
      );

      assert.deepStrictEqual(result, {
        type: "file",
        id: "src/assets/images/photo.jpg",
        filename: "photo.jpg",
        directory: "",
        src: "/assets/images/photo.jpg",
        previewSrc: "/assets/images/photo.jpg",
        thumbnails: {
          "75x75": "/assets/images/photo.jpg",
          "400x400": "/assets/images/photo.jpg",
          "1000x1000": "/assets/images/photo.jpg",
        },
      });
    });

    it("strips src/ prefix from public path", () => {
      const result = formatMediaItem(
        "src/assets/images/subdir/photo.jpg",
        "photo.jpg",
        "subdir"
      );

      assert.strictEqual(result.src, "/assets/images/subdir/photo.jpg");
      assert.strictEqual(result.id, "src/assets/images/subdir/photo.jpg");
    });

    it("handles directory parameter", () => {
      const result = formatMediaItem(
        "src/assets/images/events/photo.jpg",
        "photo.jpg",
        "events"
      );

      assert.strictEqual(result.directory, "events");
    });

    it("handles empty directory as empty string", () => {
      const result = formatMediaItem(
        "src/assets/images/photo.jpg",
        "photo.jpg",
        null
      );

      assert.strictEqual(result.directory, "");
    });
  });

  describe("getCorsHeaders", () => {
    it("returns CORS headers with origin from request", () => {
      const mockRequest = {
        headers: {
          get: (name) => (name === "origin" ? "https://example.com" : null),
        },
      };

      const headers = getCorsHeaders(mockRequest);

      assert.strictEqual(
        headers["Access-Control-Allow-Origin"],
        "https://example.com"
      );
      assert.strictEqual(headers["Access-Control-Allow-Credentials"], "true");
      assert.strictEqual(
        headers["Access-Control-Allow-Methods"],
        "GET, POST, DELETE, OPTIONS"
      );
      assert.strictEqual(
        headers["Access-Control-Allow-Headers"],
        "Content-Type"
      );
    });

    it("defaults to * when no origin header", () => {
      const mockRequest = {
        headers: {
          get: () => null,
        },
      };

      const headers = getCorsHeaders(mockRequest);
      assert.strictEqual(headers["Access-Control-Allow-Origin"], "*");
    });

    it("handles null/undefined request gracefully", () => {
      assert.strictEqual(getCorsHeaders(null)["Access-Control-Allow-Origin"], "*");
      assert.strictEqual(getCorsHeaders(undefined)["Access-Control-Allow-Origin"], "*");
    });
  });

  describe("listMedia (with dependency injection)", () => {
    let githubRequestCalls;
    let mockGithubRequest;
    let mockGetGitHubConfig;
    let mediaOps;

    beforeEach(() => {
      githubRequestCalls = [];
      mockGetGitHubConfig = () => ({
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
      });
    });

    it("returns formatted media items from GitHub API response", async () => {
      mockGithubRequest = async () => [
        { type: "file", name: "photo.jpg", path: "src/assets/images/photo.jpg" },
        { type: "file", name: "doc.pdf", path: "src/assets/images/doc.pdf" },
        { type: "dir", name: "events", path: "src/assets/images/events" },
      ];

      mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.listMedia();

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].type, "file");
      assert.strictEqual(result[0].filename, "photo.jpg");
      assert.strictEqual(result[1].type, "file");
      assert.strictEqual(result[1].filename, "doc.pdf");
      assert.strictEqual(result[2].type, "dir");
      assert.strictEqual(result[2].filename, "events");
    });

    it("filters out non-media files", async () => {
      mockGithubRequest = async () => [
        { type: "file", name: "photo.jpg", path: "src/assets/images/photo.jpg" },
        { type: "file", name: "readme.txt", path: "src/assets/images/readme.txt" },
        { type: "file", name: ".gitkeep", path: "src/assets/images/.gitkeep" },
      ];

      mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.listMedia();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].filename, "photo.jpg");
    });

    it("handles subdirectory parameter", async () => {
      mockGithubRequest = async (endpoint) => {
        githubRequestCalls.push(endpoint);
        return [
          { type: "file", name: "event.jpg", path: "src/assets/images/events/event.jpg" },
        ];
      };

      mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.listMedia("events");

      assert.strictEqual(githubRequestCalls.length, 1);
      assert.ok(githubRequestCalls[0].includes("src/assets/images/events"));
      assert.strictEqual(result[0].directory, "events");
    });

    it("returns empty array for 404 errors", async () => {
      mockGithubRequest = async () => {
        throw new Error("GitHub API error: 404 - Not Found");
      };

      mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.listMedia("nonexistent");
      assert.deepStrictEqual(result, []);
    });

    it("returns empty array when response is not an array", async () => {
      mockGithubRequest = async () => ({ type: "file", name: "single.jpg" });

      mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.listMedia();
      assert.deepStrictEqual(result, []);
    });

    it("throws non-404 errors", async () => {
      mockGithubRequest = async () => {
        throw new Error("GitHub API error: 500 - Server Error");
      };

      mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      await assert.rejects(mediaOps.listMedia(), /500 - Server Error/);
    });
  });

  describe("uploadMedia (with dependency injection)", () => {
    let mockGetGitHubConfig;

    beforeEach(() => {
      mockGetGitHubConfig = () => ({
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
      });
    });

    it("uploads new file via GitHub API", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          throw new Error("GitHub API error: 404");
        }
        return {
          content: {
            path: "src/assets/images/new-photo.jpg",
            name: "new-photo.jpg",
          },
        };
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.uploadMedia("new-photo.jpg", "base64content", "");

      assert.strictEqual(result.filename, "new-photo.jpg");
      assert.strictEqual(result.src, "/assets/images/new-photo.jpg");

      const putCall = calls.find((c) => c.options?.method === "PUT");
      assert.ok(putCall);
      const body = JSON.parse(putCall.options.body);
      assert.strictEqual(body.message, "Add media: new-photo.jpg");
      assert.strictEqual(body.content, "base64content");
    });

    it("updates existing file with SHA", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          return { sha: "existing-sha-123" };
        }
        return {
          content: {
            path: "src/assets/images/existing.jpg",
            name: "existing.jpg",
          },
        };
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      await mediaOps.uploadMedia("existing.jpg", "newcontent", "");

      const putCall = calls.find((c) => c.options?.method === "PUT");
      const body = JSON.parse(putCall.options.body);
      assert.strictEqual(body.message, "Update media: existing.jpg");
      assert.strictEqual(body.sha, "existing-sha-123");
    });

    it("handles subdirectory uploads", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          throw new Error("404");
        }
        return {
          content: {
            path: "src/assets/images/events/photo.jpg",
            name: "photo.jpg",
          },
        };
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.uploadMedia("photo.jpg", "content", "events");

      assert.strictEqual(result.directory, "events");
      const putCall = calls.find((c) => c.options?.method === "PUT");
      assert.ok(putCall.endpoint.includes("events/photo.jpg"));
    });

    it("normalizes directory with leading slash", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          throw new Error("404");
        }
        return {
          content: {
            path: "src/assets/images/photo.jpg",
            name: "photo.jpg",
          },
        };
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      await mediaOps.uploadMedia("photo.jpg", "content", "/");

      const putCall = calls.find((c) => c.options?.method === "PUT");
      // Should not have double slashes - path should be src/assets/images/photo.jpg
      assert.ok(!putCall.endpoint.includes("//"), "Path should not contain double slashes");
      assert.ok(putCall.endpoint.includes("src/assets/images/photo.jpg"));
    });

    it("normalizes directory with leading and trailing slashes", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          throw new Error("404");
        }
        return {
          content: {
            path: "src/assets/images/events/photo.jpg",
            name: "photo.jpg",
          },
        };
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      await mediaOps.uploadMedia("photo.jpg", "content", "/events/");

      const putCall = calls.find((c) => c.options?.method === "PUT");
      assert.ok(!putCall.endpoint.includes("//"), "Path should not contain double slashes");
      assert.ok(putCall.endpoint.includes("src/assets/images/events/photo.jpg"));
    });

    it("URL-encodes filenames with spaces", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          throw new Error("404");
        }
        return {
          content: {
            path: "src/assets/images/my photo.jpg",
            name: "my photo.jpg",
          },
        };
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      await mediaOps.uploadMedia("my photo.jpg", "content", "");

      const putCall = calls.find((c) => c.options?.method === "PUT");
      // Filename should be URL-encoded
      assert.ok(putCall.endpoint.includes("my%20photo.jpg"), "Filename with space should be URL-encoded");
    });
  });

  describe("deleteMedia (with dependency injection)", () => {
    let mockGetGitHubConfig;

    beforeEach(() => {
      mockGetGitHubConfig = () => ({
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
      });
    });

    it("deletes file via GitHub API", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          return { sha: "file-sha-456" };
        }
        return {};
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      const result = await mediaOps.deleteMedia("src/assets/images/photo.jpg");

      assert.deepStrictEqual(result, { success: true });

      const deleteCall = calls.find((c) => c.options?.method === "DELETE");
      assert.ok(deleteCall);
      const body = JSON.parse(deleteCall.options.body);
      assert.strictEqual(body.sha, "file-sha-456");
      assert.strictEqual(body.message, "Delete media: photo.jpg");
    });

    it("extracts filename from path for commit message", async () => {
      const calls = [];
      const mockGithubRequest = async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (!options?.method) {
          return { sha: "sha" };
        }
        return {};
      };

      const mediaOps = createMediaOperations({
        getGitHubConfig: mockGetGitHubConfig,
        githubRequest: mockGithubRequest,
      });

      await mediaOps.deleteMedia("src/assets/images/deep/nested/file.jpg");

      const deleteCall = calls.find((c) => c.options?.method === "DELETE");
      const body = JSON.parse(deleteCall.options.body);
      assert.strictEqual(body.message, "Delete media: file.jpg");
    });
  });
});
