import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

/**
 * Tests for scripts/msgraph-client.mjs
 *
 * These tests mock the global fetch to test the MSGraphClient behavior
 * without making actual API calls.
 */

// Store original fetch
let originalFetch;
let mockFetch;

// Helper to create mock responses
function createMockResponse(data, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    json: async () => data,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

// Helper to check if URL contains a query param (handles URL encoding)
function urlContainsParam(url, paramName, paramValue) {
  const decoded = decodeURIComponent(url);
  return decoded.includes(`${paramName}=${paramValue}`);
}

// Helper to setup fetch mock
function setupFetchMock(responses) {
  let callIndex = 0;
  mockFetch = mock.fn(async (url, options) => {
    const response = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    if (typeof response === "function") {
      return response(url, options);
    }
    return response;
  });
  global.fetch = mockFetch;
}

describe("MSGraphClient", () => {
  let MSGraphClient;

  beforeEach(async () => {
    originalFetch = global.fetch;
    // Fresh import for each test
    const module = await import("../scripts/msgraph-client.mjs");
    MSGraphClient = module.MSGraphClient;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.reset();
  });

  describe("constructor", () => {
    it("throws when tenantId is missing", () => {
      assert.throws(
        () => new MSGraphClient({ clientId: "id", clientSecret: "secret" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when clientId is missing", () => {
      assert.throws(
        () => new MSGraphClient({ tenantId: "tenant", clientSecret: "secret" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when clientSecret is missing", () => {
      assert.throws(
        () => new MSGraphClient({ tenantId: "tenant", clientId: "id" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("creates client with valid credentials", () => {
      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });
      assert.ok(client);
    });
  });

  describe("authentication", () => {
    it("authenticates and makes API request", async () => {
      setupFetchMock([
        // Auth response
        createMockResponse({
          access_token: "test-token",
          expires_in: 3600,
        }),
        // API response
        createMockResponse({ value: [{ id: "user1" }] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.listUsers();

      assert.strictEqual(mockFetch.mock.calls.length, 2);

      // Verify auth request
      const authCall = mockFetch.mock.calls[0];
      assert.ok(authCall.arguments[0].includes("login.microsoftonline.com"));
      assert.ok(authCall.arguments[0].includes("tenant"));

      // Verify API request has auth header
      const apiCall = mockFetch.mock.calls[1];
      assert.strictEqual(
        apiCall.arguments[1].headers.Authorization,
        "Bearer test-token"
      );

      assert.deepStrictEqual(result, { value: [{ id: "user1" }] });
    });

    it("throws on authentication failure", async () => {
      setupFetchMock([
        createMockResponse("Invalid credentials", { ok: false, status: 401 }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await assert.rejects(
        () => client.listUsers(),
        /authentication failed: 401/
      );
    });

    it("caches token for subsequent requests", async () => {
      setupFetchMock([
        // Auth response (only once)
        createMockResponse({
          access_token: "test-token",
          expires_in: 3600,
        }),
        // First API response
        createMockResponse({ value: [{ id: "user1" }] }),
        // Second API response
        createMockResponse({ value: [{ id: "user2" }] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.listUsers();
      await client.listUsers();

      // Should only authenticate once
      const authCalls = mockFetch.mock.calls.filter((c) =>
        c.arguments[0].includes("login.microsoftonline.com")
      );
      assert.strictEqual(authCalls.length, 1);
    });
  });

  describe("listUsers", () => {
    it("lists users without options", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [{ id: "user1", displayName: "User 1" }] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.listUsers();

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].endsWith("/users"));
      assert.deepStrictEqual(result.value, [{ id: "user1", displayName: "User 1" }]);
    });

    it("applies filter option", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.listUsers({ filter: "department eq 'Fire'" });

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$filter", "department"));
    });

    it("applies select option", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.listUsers({ select: ["id", "displayName"] });

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$select", "id,displayName"));
    });

    it("applies orderBy option", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.listUsers({ orderBy: "displayName" });

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$orderby", "displayName"));
    });

    it("applies top option", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.listUsers({ top: 10 });

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$top", "10"));
    });
  });

  describe("getGroupMembers", () => {
    it("gets group members by ID", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [{ id: "member1" }] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.getGroupMembers("group-123");

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].includes("/groups/group-123/members"));
      assert.deepStrictEqual(result.value, [{ id: "member1" }]);
    });

    it("applies select parameter", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.getGroupMembers("group-123", ["id", "mail"]);

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$select", "id,mail"));
    });
  });

  describe("getUser", () => {
    it("gets user by ID", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ id: "user1", displayName: "Test User" }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.getUser("user-123");

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].includes("/users/user-123"));
      assert.strictEqual(result.displayName, "Test User");
    });

    it("applies select parameter", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ id: "user1" }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.getUser("user-123", ["id", "mail"]);

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$select", "id,mail"));
    });
  });

  describe("getUserPhoto", () => {
    it("returns photo as ArrayBuffer", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse(new ArrayBuffer(8)),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.getUserPhoto("user-123");

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].includes("/users/user-123/photos/648x648/$value"));
      assert.ok(result instanceof ArrayBuffer);
    });

    it("uses custom size parameter", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse(new ArrayBuffer(8)),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.getUserPhoto("user-123", "240x240");

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].includes("/photos/240x240/"));
    });

    it("returns null for 404 (no photo)", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse("Not found", { ok: false, status: 404 }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.getUserPhoto("user-123");

      assert.strictEqual(result, null);
    });
  });

  describe("getUserGroups", () => {
    it("gets user group memberships", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [{ id: "group1" }, { id: "group2" }] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.getUserGroups("user-123");

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].includes("/users/user-123/memberOf"));
      assert.strictEqual(result.value.length, 2);
    });
  });

  describe("listGroups", () => {
    it("lists groups without options", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [{ id: "group1", displayName: "Group 1" }] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      const result = await client.listGroups();

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(apiCall.arguments[0].endsWith("/groups"));
      assert.deepStrictEqual(result.value, [{ id: "group1", displayName: "Group 1" }]);
    });

    it("applies filter option", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await client.listGroups({ filter: "displayName eq 'Admins'" });

      const apiCall = mockFetch.mock.calls[1];
      assert.ok(urlContainsParam(apiCall.arguments[0], "$filter", "displayName"));
    });
  });

  describe("fetchAllPages", () => {
    it("iterates through all pages", async () => {
      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({
          value: [{ id: "1" }, { id: "2" }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skip=2",
        }),
        createMockResponse({
          value: [{ id: "3" }],
        }),
      ]);

      // Get first page
      const firstPage = await client.listUsers();

      // Iterate through all pages
      const items = [];
      for await (const item of client.fetchAllPages(firstPage)) {
        items.push(item);
      }

      assert.strictEqual(items.length, 3);
      assert.deepStrictEqual(items.map((i) => i.id), ["1", "2", "3"]);
    });

    it("handles single page response", async () => {
      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({
          value: [{ id: "1" }],
        }),
      ]);

      const firstPage = await client.listUsers();
      const items = [];
      for await (const item of client.fetchAllPages(firstPage)) {
        items.push(item);
      }

      assert.strictEqual(items.length, 1);
    });

    it("handles empty response", async () => {
      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse({ value: [] }),
      ]);

      const firstPage = await client.listUsers();
      const items = [];
      for await (const item of client.fetchAllPages(firstPage)) {
        items.push(item);
      }

      assert.strictEqual(items.length, 0);
    });
  });

  describe("error handling", () => {
    it("throws on API error", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse("Forbidden", { ok: false, status: 403 }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await assert.rejects(() => client.listUsers(), /API error: 403/);
    });

    it("includes error message from response", async () => {
      setupFetchMock([
        createMockResponse({ access_token: "token", expires_in: 3600 }),
        createMockResponse("Access denied for this resource", {
          ok: false,
          status: 403,
        }),
      ]);

      const client = new MSGraphClient({
        tenantId: "tenant",
        clientId: "id",
        clientSecret: "secret",
      });

      await assert.rejects(
        () => client.listUsers(),
        /Access denied for this resource/
      );
    });
  });
});
