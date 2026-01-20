const { app } = require("@azure/functions");
const path = require("path");

// Admin group ID from API site config
let ADMIN_GROUP_ID = null;
let configLoadError = null;

try {
  const configPath = path.join(__dirname, "../../site-config.json");
  const siteConfig = require(configPath);
  ADMIN_GROUP_ID = siteConfig.adminGroupId;
} catch (error) {
  configLoadError = error.message;
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

// Debug endpoint to verify configuration
app.http("getRolesDebug", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/get-roles/debug",
  handler: async (request, context) => {
    return {
      status: 200,
      jsonBody: {
        adminGroupIdSet: !!ADMIN_GROUP_ID,
        configLoadError,
        dirname: __dirname,
      },
    };
  },
});

// Export for testing
module.exports = { getRolesFromClaims, getRolesHandler, ADMIN_GROUP_ID };
