const { app } = require("@azure/functions");

// Admin group ID from environment variable (set in Azure Static Web App config)
// Falls back to site.json for local development
let ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
if (!ADMIN_GROUP_ID) {
  try {
    const siteConfig = require("../../../src/_data/site.json");
    ADMIN_GROUP_ID = siteConfig.adminGroupId;
  } catch {
    // site.json not available in deployed API context
  }
}

/**
 * Determines user roles based on Entra ID group membership.
 * Users in the admin group get the "admin" role.
 *
 * @param {Object} body - The request body containing claims
 * @param {Array} body.claims - Array of identity claims from Entra ID
 * @param {string} adminGroupId - The Entra ID group ID for admin access
 * @returns {{ roles: string[] }} Object containing array of assigned roles
 */
function getRolesFromClaims(body, adminGroupId) {
  const roles = [];
  const claims = body?.claims || [];

  // Look for group claims that match our admin group
  const isAdmin = claims.some(
    (claim) => claim.typ === "groups" && claim.val === adminGroupId
  );

  if (isAdmin) {
    roles.push("admin");
  }

  return { roles };
}

/**
 * Azure Function handler for role assignment.
 * Called by Azure Static Web Apps during authentication.
 */
async function getRolesHandler(request, context) {
  try {
    const body = await request.json();
    const result = getRolesFromClaims(body, ADMIN_GROUP_ID);

    context.log("GetRoles:", { userId: body.userId, roles: result.roles });

    return {
      status: 200,
      jsonBody: result,
    };
  } catch (error) {
    context.error("GetRoles error:", error.message);
    return {
      status: 200,
      jsonBody: { roles: [] },
    };
  }
}

// Register the Azure Function
app.http("getRoles", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/get-roles",
  handler: getRolesHandler,
});

// Debug endpoint to verify configuration (GET /api/auth/get-roles/debug)
app.http("getRolesDebug", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/get-roles/debug",
  handler: async (request, context) => {
    return {
      status: 200,
      jsonBody: {
        adminGroupIdSet: !!ADMIN_GROUP_ID,
        adminGroupIdLength: ADMIN_GROUP_ID ? ADMIN_GROUP_ID.length : 0,
        adminGroupIdPreview: ADMIN_GROUP_ID ? ADMIN_GROUP_ID.substring(0, 8) + "..." : null,
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    };
  },
});

// Export for testing
module.exports = { getRolesFromClaims, getRolesHandler, ADMIN_GROUP_ID };
