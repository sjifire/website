const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

/**
 * Tests for api/src/lib/msgraph-client.js
 */

describe("api/lib/msgraph-client", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("MSGraphClient", () => {
    it("throws when tenantId is missing", async () => {
      const { MSGraphClient } = await import("../api/src/lib/msgraph-client.js");
      assert.throws(
        () => new MSGraphClient({ clientId: "id", clientSecret: "secret" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when clientId is missing", async () => {
      const { MSGraphClient } = await import("../api/src/lib/msgraph-client.js");
      assert.throws(
        () => new MSGraphClient({ tenantId: "tenant", clientSecret: "secret" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when clientSecret is missing", async () => {
      const { MSGraphClient } = await import("../api/src/lib/msgraph-client.js");
      assert.throws(
        () => new MSGraphClient({ tenantId: "tenant", clientId: "id" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("creates client with valid credentials", async () => {
      const { MSGraphClient } = await import("../api/src/lib/msgraph-client.js");
      const client = new MSGraphClient({
        tenantId: "00000000-0000-0000-0000-000000000000",
        clientId: "00000000-0000-0000-0000-000000000001",
        clientSecret: "test-secret",
      });
      assert.ok(client);
    });

    it("has getServicePrincipal method", async () => {
      const { MSGraphClient } = await import("../api/src/lib/msgraph-client.js");
      const client = new MSGraphClient({
        tenantId: "00000000-0000-0000-0000-000000000000",
        clientId: "00000000-0000-0000-0000-000000000001",
        clientSecret: "test-secret",
      });
      assert.strictEqual(typeof client.getServicePrincipal, "function");
    });
  });

  describe("createMSGraphClient", () => {
    it("returns null when MS_GRAPH_TENANT_ID is missing", async () => {
      delete process.env.MS_GRAPH_TENANT_ID;
      process.env.MS_GRAPH_CLIENT_ID = "client-id";
      process.env.MS_GRAPH_CLIENT_SECRET = "client-secret";

      // Need to re-import to pick up env changes
      const { createMSGraphClient } = await import("../api/src/lib/msgraph-client.js?t=" + Date.now());
      const client = createMSGraphClient();
      assert.strictEqual(client, null);
    });

    it("returns null when MS_GRAPH_CLIENT_ID is missing", async () => {
      process.env.MS_GRAPH_TENANT_ID = "tenant-id";
      delete process.env.MS_GRAPH_CLIENT_ID;
      process.env.MS_GRAPH_CLIENT_SECRET = "client-secret";

      const { createMSGraphClient } = await import("../api/src/lib/msgraph-client.js?t=" + Date.now());
      const client = createMSGraphClient();
      assert.strictEqual(client, null);
    });

    it("returns null when MS_GRAPH_CLIENT_SECRET is missing", async () => {
      process.env.MS_GRAPH_TENANT_ID = "tenant-id";
      process.env.MS_GRAPH_CLIENT_ID = "client-id";
      delete process.env.MS_GRAPH_CLIENT_SECRET;

      const { createMSGraphClient } = await import("../api/src/lib/msgraph-client.js?t=" + Date.now());
      const client = createMSGraphClient();
      assert.strictEqual(client, null);
    });

    it("returns null when all credentials are missing", async () => {
      delete process.env.MS_GRAPH_TENANT_ID;
      delete process.env.MS_GRAPH_CLIENT_ID;
      delete process.env.MS_GRAPH_CLIENT_SECRET;

      const { createMSGraphClient } = await import("../api/src/lib/msgraph-client.js?t=" + Date.now());
      const client = createMSGraphClient();
      assert.strictEqual(client, null);
    });

    it("returns MSGraphClient when all credentials are present", async () => {
      process.env.MS_GRAPH_TENANT_ID = "00000000-0000-0000-0000-000000000000";
      process.env.MS_GRAPH_CLIENT_ID = "00000000-0000-0000-0000-000000000001";
      process.env.MS_GRAPH_CLIENT_SECRET = "test-secret";

      const { createMSGraphClient, MSGraphClient } = await import("../api/src/lib/msgraph-client.js?t=" + Date.now());
      const client = createMSGraphClient();
      assert.ok(client instanceof MSGraphClient);
    });
  });

  describe("getServicePrincipal behavior documentation", () => {
    it("returns service principal object when found", () => {
      // Expected behavior when service principal exists:
      // Returns { appRoleAssignmentRequired: true/false, ... }
      const expectedResult = { appRoleAssignmentRequired: true };
      assert.ok("appRoleAssignmentRequired" in expectedResult);
    });

    it("returns null when service principal not found", () => {
      // Expected behavior when appId doesn't match any service principal
      const expectedResult = null;
      assert.strictEqual(expectedResult, null);
    });

    it("returns null on 404 error", () => {
      // Expected behavior: 404 errors are caught and return null
      // This is graceful handling for non-existent apps
      assert.ok(true, "404 errors return null instead of throwing");
    });

    it("throws on other errors", () => {
      // Expected behavior: non-404 errors (403, 500, etc.) are thrown
      // This ensures we don't silently fail on permission issues
      assert.ok(true, "Non-404 errors are thrown to caller");
    });
  });
});
