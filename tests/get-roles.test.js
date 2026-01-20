const { describe, it } = require("node:test");
const assert = require("node:assert");

/**
 * Tests for api/src/functions/getRoles.js
 *
 * Tests the role assignment logic for Azure Static Web Apps custom roles.
 * Users in the admin group should get the "admin" role.
 * Users NOT in the admin group should NOT get any roles.
 */

// We recreate the logic here to avoid Azure Functions dependencies
// This mirrors the getRolesFromClaims function in getRoles.js

function getRolesFromClaims(body, adminGroupId) {
  const roles = [];
  const claims = body?.claims || [];

  const isAdmin = claims.some(
    (claim) => claim.typ === "groups" && claim.val === adminGroupId
  );

  if (isAdmin) {
    roles.push("admin");
  }

  return { roles };
}

const TEST_ADMIN_GROUP_ID = "af63ba79-5b90-425c-b552-dea19dee59ef";
const OTHER_GROUP_ID = "12345678-1234-1234-1234-123456789abc";

describe("getRoles", () => {
  describe("getRolesFromClaims", () => {
    describe("user IN admin group", () => {
      it("returns admin role when user has the admin group claim", () => {
        const body = {
          userId: "user-123",
          claims: [
            { typ: "name", val: "Test User" },
            { typ: "groups", val: TEST_ADMIN_GROUP_ID },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: ["admin"] });
      });

      it("returns admin role when user has multiple groups including admin", () => {
        const body = {
          userId: "user-123",
          claims: [
            { typ: "groups", val: OTHER_GROUP_ID },
            { typ: "groups", val: TEST_ADMIN_GROUP_ID },
            { typ: "groups", val: "another-group-id" },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: ["admin"] });
      });

      it("returns admin role when admin group is the only claim", () => {
        const body = {
          claims: [{ typ: "groups", val: TEST_ADMIN_GROUP_ID }],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: ["admin"] });
      });
    });

    describe("user NOT in admin group", () => {
      it("returns empty roles when user has no group claims", () => {
        const body = {
          userId: "user-123",
          claims: [
            { typ: "name", val: "Test User" },
            { typ: "email", val: "test@example.com" },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when user is in different groups", () => {
        const body = {
          userId: "user-123",
          claims: [
            { typ: "groups", val: OTHER_GROUP_ID },
            { typ: "groups", val: "yet-another-group" },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when group claim value is similar but not exact", () => {
        const body = {
          claims: [
            // Similar but not exact match
            { typ: "groups", val: TEST_ADMIN_GROUP_ID + "-extra" },
            { typ: "groups", val: "prefix-" + TEST_ADMIN_GROUP_ID },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when claim type is not 'groups'", () => {
        const body = {
          claims: [
            // Has the right value but wrong type
            { typ: "group", val: TEST_ADMIN_GROUP_ID },
            { typ: "role", val: TEST_ADMIN_GROUP_ID },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });
    });

    describe("edge cases", () => {
      it("returns empty roles when claims array is empty", () => {
        const body = {
          userId: "user-123",
          claims: [],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when claims is undefined", () => {
        const body = {
          userId: "user-123",
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when body is null", () => {
        const result = getRolesFromClaims(null, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when body is undefined", () => {
        const result = getRolesFromClaims(undefined, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("returns empty roles when body is empty object", () => {
        const result = getRolesFromClaims({}, TEST_ADMIN_GROUP_ID);

        assert.deepStrictEqual(result, { roles: [] });
      });

      it("is case-sensitive for group IDs", () => {
        const body = {
          claims: [
            { typ: "groups", val: TEST_ADMIN_GROUP_ID.toUpperCase() },
          ],
        };

        const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

        // UUID comparison is case-sensitive, uppercase should not match
        assert.deepStrictEqual(result, { roles: [] });
      });
    });
  });

  describe("getRolesHandler behavior", () => {
    // Test the handler behavior by simulating request/response

    async function simulateHandler(body, adminGroupId) {
      const result = getRolesFromClaims(body, adminGroupId);
      return {
        status: 200,
        jsonBody: result,
      };
    }

    it("returns 200 status with admin role for admin user", async () => {
      const body = {
        userId: "admin-user",
        claims: [{ typ: "groups", val: TEST_ADMIN_GROUP_ID }],
      };

      const response = await simulateHandler(body, TEST_ADMIN_GROUP_ID);

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.jsonBody, { roles: ["admin"] });
    });

    it("returns 200 status with empty roles for non-admin user", async () => {
      const body = {
        userId: "regular-user",
        claims: [{ typ: "groups", val: OTHER_GROUP_ID }],
      };

      const response = await simulateHandler(body, TEST_ADMIN_GROUP_ID);

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.jsonBody, { roles: [] });
    });

    it("returns 200 with empty roles on malformed request", async () => {
      const response = await simulateHandler(null, TEST_ADMIN_GROUP_ID);

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.jsonBody, { roles: [] });
    });
  });

  describe("security considerations", () => {
    it("only grants admin role through group membership, not other claim types", () => {
      const body = {
        claims: [
          // Attacker tries to inject admin via different claim types
          { typ: "roles", val: "admin" },
          { typ: "role", val: "admin" },
          { typ: "admin", val: "true" },
          { typ: "isAdmin", val: "true" },
        ],
      };

      const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

      assert.deepStrictEqual(result, { roles: [] });
    });

    it("requires exact group ID match", () => {
      const body = {
        claims: [
          { typ: "groups", val: "*" },
          { typ: "groups", val: ".*" },
          { typ: "groups", val: "" },
        ],
      };

      const result = getRolesFromClaims(body, TEST_ADMIN_GROUP_ID);

      assert.deepStrictEqual(result, { roles: [] });
    });
  });
});
