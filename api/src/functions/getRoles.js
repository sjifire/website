import { app } from "@azure/functions";

/**
 * Cache for the "User assignment required" check.
 * We cache this to avoid hitting Graph API on every auth.
 */
let assignmentRequiredCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Gets an access token for Microsoft Graph API.
 */
async function getGraphToken(tenantId, clientId, clientSecret) {
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Checks if "User assignment required" is enabled on the Enterprise App.
 * Uses Microsoft Graph API to verify the appRoleAssignmentRequired property.
 *
 * @param {object} context - Azure Functions context for logging
 * @returns {Promise<boolean>} True if assignment is required, false otherwise
 */
export async function isAssignmentRequired(context) {
  const now = Date.now();

  // Return cached result if still valid
  if (assignmentRequiredCache !== null && now < cacheExpiry) {
    return assignmentRequiredCache;
  }

  // Use MS Graph credentials (same app registration as personnel sync)
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const graphClientId = process.env.MS_GRAPH_CLIENT_ID;
  const graphClientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  // The app ID of the SWA auth app (the one we're checking)
  const swaAppId = process.env.AAD_CLIENT_ID;

  if (!tenantId || !graphClientId || !graphClientSecret || !swaAppId) {
    context.error(
      "Missing credentials for Graph API check. Required: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, AAD_CLIENT_ID"
    );
    // Fail closed - deny access if we can't verify
    return false;
  }

  try {
    const token = await getGraphToken(tenantId, graphClientId, graphClientSecret);

    // Query the service principal by appId to get appRoleAssignmentRequired
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${swaAppId}'&$select=appRoleAssignmentRequired`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Graph API request failed: ${response.status}`);
    }

    const { value } = await response.json();

    if (!value || value.length === 0) {
      context.error(`Service principal not found for appId: ${swaAppId}`);
      return false;
    }

    const isRequired = value[0].appRoleAssignmentRequired === true;

    // Cache the result
    assignmentRequiredCache = isRequired;
    cacheExpiry = now + CACHE_TTL_MS;

    if (!isRequired) {
      context.error(
        "SECURITY: 'User assignment required' is NOT enabled on the Enterprise App! " +
          "Any user in the tenant can access /admin. " +
          "Enable it in Azure Portal > Entra ID > Enterprise Apps > Properties."
      );
    } else {
      context.log("Verified: User assignment required is enabled");
    }

    return isRequired;
  } catch (error) {
    context.error("Failed to verify assignment required setting:", error.message);
    // Fail closed - deny access if we can't verify
    return false;
  }
}

/**
 * Clears the cache (useful for testing).
 */
export function clearCache() {
  assignmentRequiredCache = null;
  cacheExpiry = 0;
}

/**
 * Azure Function handler for role assignment.
 * Called by Azure Static Web Apps during authentication.
 *
 * SECURITY MODEL:
 * 1. Verifies "User assignment required" is enabled on the Enterprise App
 * 2. If not enabled (or can't verify), denies access (returns no roles)
 * 3. If enabled, grants admin role (assigned users already passed Azure AD check)
 */
export async function getRolesHandler(request, context) {
  try {
    // Verify that "User assignment required" is enabled
    const isRequired = await isAssignmentRequired(context);

    if (!isRequired) {
      context.warn("Access denied - cannot verify User assignment required setting");
      return {
        status: 200,
        jsonBody: { roles: [] },
      };
    }

    // User assignment is required and user passed Azure AD auth,
    // so they must be assigned to the app - grant admin access
    const body = await request.json();
    context.log("GetRoles: Granting admin role", { userId: body.userId });

    return {
      status: 200,
      jsonBody: { roles: ["admin"] },
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
