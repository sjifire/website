const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");

const {
  getClientPrincipal,
  hasAdminRole,
  requireAdmin,
  getUserForLogging,
} = require("../api/src/lib/auth.js");

// Helper to create a mock request with headers
function createMockRequest(headers = {}) {
  const headerMap = new Map(Object.entries(headers));
  return {
    headers: {
      get: (name) => headerMap.get(name) || null,
    },
  };
}

// Helper to create a base64-encoded client principal
function encodeClientPrincipal(principal) {
  return Buffer.from(JSON.stringify(principal)).toString("base64");
}

// Helper to create a mock context for logging
function createMockContext() {
  return {
    warn: () => {},
    log: () => {},
    error: () => {},
  };
}

describe("auth module", () => {
  describe("getClientPrincipal", () => {
    it("returns null when no header is present", () => {
      const request = createMockRequest({});
      assert.strictEqual(getClientPrincipal(request), null);
    });

    it("parses valid base64-encoded client principal", () => {
      const principal = {
        userId: "user123",
        userDetails: "test@example.com",
        userRoles: ["admin", "authenticated"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      const result = getClientPrincipal(request);
      assert.deepStrictEqual(result, principal);
    });

    it("returns null for invalid base64", () => {
      const request = createMockRequest({
        "x-ms-client-principal": "not-valid-base64!!!",
      });
      assert.strictEqual(getClientPrincipal(request), null);
    });

    it("returns null for valid base64 but invalid JSON", () => {
      const request = createMockRequest({
        "x-ms-client-principal": Buffer.from("not json").toString("base64"),
      });
      assert.strictEqual(getClientPrincipal(request), null);
    });

    it("returns null for empty header value", () => {
      const request = createMockRequest({
        "x-ms-client-principal": "",
      });
      assert.strictEqual(getClientPrincipal(request), null);
    });
  });

  describe("hasAdminRole", () => {
    it("returns true when user has admin role", () => {
      const principal = {
        userId: "user123",
        userRoles: ["authenticated", "admin"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(hasAdminRole(request), true);
    });

    it("returns false when user lacks admin role", () => {
      const principal = {
        userId: "user123",
        userRoles: ["authenticated", "reader"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(hasAdminRole(request), false);
    });

    it("returns false when userRoles is empty", () => {
      const principal = {
        userId: "user123",
        userRoles: [],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(hasAdminRole(request), false);
    });

    it("returns false when userRoles is missing", () => {
      const principal = {
        userId: "user123",
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(hasAdminRole(request), false);
    });

    it("returns false when no client principal header", () => {
      const request = createMockRequest({});
      assert.strictEqual(hasAdminRole(request), false);
    });

    it("returns false for invalid principal", () => {
      const request = createMockRequest({
        "x-ms-client-principal": "invalid",
      });
      assert.strictEqual(hasAdminRole(request), false);
    });
  });

  describe("requireAdmin", () => {
    const originalEnv = process.env.TINA_PUBLIC_IS_LOCAL;

    afterEach(() => {
      // Restore original environment
      if (originalEnv === undefined) {
        delete process.env.TINA_PUBLIC_IS_LOCAL;
      } else {
        process.env.TINA_PUBLIC_IS_LOCAL = originalEnv;
      }
    });

    it("returns null (allows access) in local development mode", () => {
      process.env.TINA_PUBLIC_IS_LOCAL = "true";
      const request = createMockRequest({});
      const context = createMockContext();

      assert.strictEqual(requireAdmin(request, context), null);
    });

    it("returns 401 when no client principal in production", () => {
      process.env.TINA_PUBLIC_IS_LOCAL = "false";
      const request = createMockRequest({});
      const context = createMockContext();

      const result = requireAdmin(request, context);
      assert.strictEqual(result.status, 401);
      assert.deepStrictEqual(result.jsonBody, { error: "Authentication required" });
    });

    it("returns 403 when user lacks admin role", () => {
      process.env.TINA_PUBLIC_IS_LOCAL = "false";
      const principal = {
        userId: "user123",
        userRoles: ["authenticated"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });
      const context = createMockContext();

      const result = requireAdmin(request, context);
      assert.strictEqual(result.status, 403);
      assert.deepStrictEqual(result.jsonBody, { error: "Admin role required" });
    });

    it("returns null (allows access) when user has admin role", () => {
      process.env.TINA_PUBLIC_IS_LOCAL = "false";
      const principal = {
        userId: "user123",
        userRoles: ["authenticated", "admin"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });
      const context = createMockContext();

      assert.strictEqual(requireAdmin(request, context), null);
    });

    it("logs warning on unauthorized access attempt", () => {
      process.env.TINA_PUBLIC_IS_LOCAL = "false";
      const request = createMockRequest({});
      let loggedMessage = null;
      const context = {
        warn: (msg) => { loggedMessage = msg; },
        log: () => {},
        error: () => {},
      };

      requireAdmin(request, context);
      assert.ok(loggedMessage.includes("Unauthorized"));
    });

    it("logs warning with userId on forbidden access", () => {
      process.env.TINA_PUBLIC_IS_LOCAL = "false";
      const principal = {
        userId: "user456",
        userRoles: ["authenticated"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });
      let loggedMessage = null;
      const context = {
        warn: (msg) => { loggedMessage = msg; },
        log: () => {},
        error: () => {},
      };

      requireAdmin(request, context);
      assert.ok(loggedMessage.includes("user456"));
      assert.ok(loggedMessage.includes("Forbidden"));
    });

    it("returns 401 when TINA_PUBLIC_IS_LOCAL is not set", () => {
      delete process.env.TINA_PUBLIC_IS_LOCAL;
      const request = createMockRequest({});
      const context = createMockContext();

      const result = requireAdmin(request, context);
      assert.strictEqual(result.status, 401);
    });
  });

  describe("getUserForLogging", () => {
    it("returns 'anonymous' when no client principal", () => {
      const request = createMockRequest({});
      assert.strictEqual(getUserForLogging(request), "anonymous");
    });

    it("returns userDetails when available", () => {
      const principal = {
        userId: "user123",
        userDetails: "test@example.com",
        userRoles: ["admin"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(getUserForLogging(request), "test@example.com");
    });

    it("returns userId when userDetails is not available", () => {
      const principal = {
        userId: "user123",
        userRoles: ["admin"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(getUserForLogging(request), "user123");
    });

    it("returns 'unknown' when neither userDetails nor userId available", () => {
      const principal = {
        userRoles: ["admin"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(getUserForLogging(request), "unknown");
    });

    it("prefers userDetails over userId", () => {
      const principal = {
        userId: "user123",
        userDetails: "preferred@example.com",
        userRoles: ["admin"],
      };
      const request = createMockRequest({
        "x-ms-client-principal": encodeClientPrincipal(principal),
      });

      assert.strictEqual(getUserForLogging(request), "preferred@example.com");
    });
  });
});
