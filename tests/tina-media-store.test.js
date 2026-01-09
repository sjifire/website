const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

// Mock fetch globally for tests
global.fetch = async () => {};
global.FormData = class FormData {
  constructor() { this.data = {}; }
  append(key, value) { this.data[key] = value; }
};

// Now we can import the module (TinaCMS types will be ignored at runtime)
const { GitHubMediaStore, createMediaStore, getMediaStoreClass } = require("../tina/media-store.ts");

describe("tina/media-store", () => {
  describe("GitHubMediaStore", () => {
    it("uses default API base when no config provided", () => {
      const store = new GitHubMediaStore();
      assert.strictEqual(store.apiBase, "/api/media");
    });

    it("uses custom API base when provided", () => {
      const store = new GitHubMediaStore({ apiBase: "http://localhost:7071/api/media" });
      assert.strictEqual(store.apiBase, "http://localhost:7071/api/media");
    });

    it("has accept property set to *", () => {
      const store = new GitHubMediaStore();
      assert.strictEqual(store.accept, "*");
    });
  });

  describe("createMediaStore", () => {
    it("returns store with default API base for production", () => {
      const store = createMediaStore(false);
      assert.strictEqual(store.apiBase, "/api/media");
    });

    it("returns store with local API base for local-prod", () => {
      const store = createMediaStore(true, "http://localhost:7071");
      assert.strictEqual(store.apiBase, "http://localhost:7071/api/media");
    });
  });

  describe("getMediaStoreClass", () => {
    it("returns a class that can be instantiated", () => {
      const StoreClass = getMediaStoreClass(false);
      const store = new StoreClass();
      assert.strictEqual(store.apiBase, "/api/media");
    });

    it("returns configured class for local-prod", () => {
      const StoreClass = getMediaStoreClass(true, "http://localhost:7071");
      const store = new StoreClass();
      assert.strictEqual(store.apiBase, "http://localhost:7071/api/media");
    });
  });

  describe("persist method", () => {
    it("calls fetch with correct parameters for upload", async () => {
      const fetchCalls = [];
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return {
          ok: true,
          json: async () => ({ id: "test-id", filename: "test.jpg" }),
        };
      };

      const store = new GitHubMediaStore({ apiBase: "/api/media" });
      const files = [{ file: new Blob(["test"]), directory: "images" }];

      const result = await store.persist(files);

      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].url, "/api/media");
      assert.strictEqual(fetchCalls[0].options.method, "POST");
      assert.strictEqual(fetchCalls[0].options.credentials, "include");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].filename, "test.jpg");
    });

    it("throws error on failed upload", async () => {
      global.fetch = async () => ({
        ok: false,
        json: async () => ({ error: "Upload failed" }),
      });

      const store = new GitHubMediaStore();
      const files = [{ file: new Blob(["test"]), directory: "" }];

      await assert.rejects(store.persist(files), /Upload failed/);
    });
  });

  describe("list method", () => {
    it("calls fetch with correct URL for listing", async () => {
      const fetchCalls = [];
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return {
          ok: true,
          json: async () => [{ id: "1", filename: "photo.jpg" }],
        };
      };

      const store = new GitHubMediaStore({ apiBase: "/api/media" });
      const result = await store.list({ directory: "subfolder" });

      assert.strictEqual(fetchCalls.length, 1);
      assert.ok(fetchCalls[0].url.includes("/api/media?directory=subfolder"));
      assert.strictEqual(fetchCalls[0].options.credentials, "include");
      assert.strictEqual(result.items.length, 1);
    });

    it("uses empty directory when not specified", async () => {
      const fetchCalls = [];
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, json: async () => [] };
      };

      const store = new GitHubMediaStore();
      await store.list();

      assert.ok(fetchCalls[0].url.includes("directory="));
    });

    it("throws error on failed list", async () => {
      global.fetch = async () => ({
        ok: false,
        json: async () => ({ error: "List failed" }),
      });

      const store = new GitHubMediaStore();
      await assert.rejects(store.list(), /List failed/);
    });
  });

  describe("delete method", () => {
    it("calls fetch with DELETE method", async () => {
      const fetchCalls = [];
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, json: async () => ({}) };
      };

      const store = new GitHubMediaStore({ apiBase: "/api/media" });
      await store.delete({ id: "src/assets/images/photo.jpg" });

      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].url, "/api/media");
      assert.strictEqual(fetchCalls[0].options.method, "DELETE");
      assert.strictEqual(fetchCalls[0].options.credentials, "include");

      const body = JSON.parse(fetchCalls[0].options.body);
      assert.strictEqual(body.filepath, "src/assets/images/photo.jpg");
    });

    it("throws error on failed delete", async () => {
      global.fetch = async () => ({
        ok: false,
        json: async () => ({ error: "Delete failed" }),
      });

      const store = new GitHubMediaStore();
      await assert.rejects(store.delete({ id: "test" }), /Delete failed/);
    });
  });
});
