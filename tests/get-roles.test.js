const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");

/**
 * Tests for api/src/functions/getRoles.js
 *
 * SECURITY MODEL:
 * 1. Verifies "User assignment required" is enabled on the Enterprise App via Graph API
 * 2. If not enabled (or can't verify), denies access (fails closed)
 * 3. If enabled, grants admin role (assigned users already passed Azure AD check)
 */

describe("getRoles", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.reset();
  });

  describe("isAssignmentRequired", () => {
    it("returns false when AAD_CLIENT_ID is missing", async () => {
      delete process.env.AAD_CLIENT_ID;
      process.env.MS_GRAPH_TENANT_ID = "tenant";
      process.env.MS_GRAPH_CLIENT_ID = "client";
      process.env.MS_GRAPH_CLIENT_SECRET = "secret";

      const { isAssignmentRequired } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );
      const result = await isAssignmentRequired();
      assert.strictEqual(result, false);
    });

    it("returns false when MS_GRAPH credentials are missing", async () => {
      process.env.AAD_CLIENT_ID = "app-id";
      delete process.env.MS_GRAPH_TENANT_ID;
      delete process.env.MS_GRAPH_CLIENT_ID;
      delete process.env.MS_GRAPH_CLIENT_SECRET;

      const { isAssignmentRequired } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );
      const result = await isAssignmentRequired();
      assert.strictEqual(result, false);
    });
  });

  describe("getRolesHandler", () => {
    it("returns status 200 with roles array", async () => {
      // Even when denying access, status is 200 (Azure SWA requirement)
      delete process.env.AAD_CLIENT_ID; // Force isAssignmentRequired to return false

      const { getRolesHandler } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      const mockRequest = {
        json: async () => ({ userId: "test-user" }),
      };

      const result = await getRolesHandler(mockRequest);

      assert.strictEqual(result.status, 200);
      assert.ok(Array.isArray(result.jsonBody.roles));
    });

    it("returns empty roles when isAssignmentRequired returns false", async () => {
      delete process.env.AAD_CLIENT_ID; // Force failure

      const { getRolesHandler } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      const mockRequest = {
        json: async () => ({}),
      };

      const result = await getRolesHandler(mockRequest);

      assert.deepStrictEqual(result.jsonBody, { roles: [] });
    });

    it("handles request body parsing errors gracefully", async () => {
      delete process.env.AAD_CLIENT_ID;

      const { getRolesHandler } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      const mockRequest = {
        json: async () => {
          throw new Error("Invalid JSON");
        },
      };

      // Should not throw, should return empty roles
      const result = await getRolesHandler(mockRequest);

      assert.strictEqual(result.status, 200);
      assert.deepStrictEqual(result.jsonBody, { roles: [] });
    });

  });

  describe("fail closed security model", () => {
    it("denies access (empty roles) when AAD_CLIENT_ID missing", async () => {
      delete process.env.AAD_CLIENT_ID;

      const { isAssignmentRequired } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      assert.strictEqual(await isAssignmentRequired(), false);
    });

    it("denies access (empty roles) when MS_GRAPH_TENANT_ID missing", async () => {
      process.env.AAD_CLIENT_ID = "app-id";
      delete process.env.MS_GRAPH_TENANT_ID;
      process.env.MS_GRAPH_CLIENT_ID = "client";
      process.env.MS_GRAPH_CLIENT_SECRET = "secret";

      const { isAssignmentRequired } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      assert.strictEqual(await isAssignmentRequired(), false);
    });

    it("denies access (empty roles) when MS_GRAPH_CLIENT_ID missing", async () => {
      process.env.AAD_CLIENT_ID = "app-id";
      process.env.MS_GRAPH_TENANT_ID = "tenant";
      delete process.env.MS_GRAPH_CLIENT_ID;
      process.env.MS_GRAPH_CLIENT_SECRET = "secret";

      const { isAssignmentRequired } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      assert.strictEqual(await isAssignmentRequired(), false);
    });

    it("denies access (empty roles) when MS_GRAPH_CLIENT_SECRET missing", async () => {
      process.env.AAD_CLIENT_ID = "app-id";
      process.env.MS_GRAPH_TENANT_ID = "tenant";
      process.env.MS_GRAPH_CLIENT_ID = "client";
      delete process.env.MS_GRAPH_CLIENT_SECRET;

      const { isAssignmentRequired } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      assert.strictEqual(await isAssignmentRequired(), false);
    });
  });

  describe("response format", () => {
    it("always returns status 200 (Azure SWA requirement)", async () => {
      delete process.env.AAD_CLIENT_ID;

      const { getRolesHandler } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      const result = await getRolesHandler({ json: async () => ({}) });

      // Azure SWA rolesSource must return 200, even for "denied"
      assert.strictEqual(result.status, 200);
    });

    it("returns jsonBody with roles array", async () => {
      delete process.env.AAD_CLIENT_ID;

      const { getRolesHandler } = await import(
        `../api/src/functions/getRoles.js?t=${Date.now()}`
      );

      const result = await getRolesHandler({ json: async () => ({}) });

      assert.ok("jsonBody" in result);
      assert.ok("roles" in result.jsonBody);
      assert.ok(Array.isArray(result.jsonBody.roles));
    });

  });

});
