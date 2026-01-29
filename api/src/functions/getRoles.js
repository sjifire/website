import { app } from "@azure/functions";

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
    const errorText = await response.text();
    console.error(`[getRoles] Token request failed: ${response.status}`, errorText);
    throw new Error(`Token request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Checks if "User assignment required" is enabled on the Enterprise App.
 * Uses Microsoft Graph API to verify the appRoleAssignmentRequired property.
 *
 * @returns {Promise<boolean>} True if assignment is required, false otherwise
 */
export async function isAssignmentRequired() {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const graphClientId = process.env.MS_GRAPH_CLIENT_ID;
  const graphClientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const swaAppId = process.env.AAD_CLIENT_ID;

  if (!tenantId || !graphClientId || !graphClientSecret || !swaAppId) {
    console.error(
      "[getRoles] Missing credentials for Graph API check. Required: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, AAD_CLIENT_ID"
    );
    return false;
  }

  try {
    const token = await getGraphToken(tenantId, graphClientId, graphClientSecret);

    const graphUrl = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${swaAppId}'&$select=appRoleAssignmentRequired`;

    const response = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[getRoles] Graph API request failed: ${response.status}`, errorText);
      throw new Error(`Graph API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const { value } = data;

    if (!value || value.length === 0) {
      console.error(`[getRoles] Service principal not found for appId: ${swaAppId}`);
      return false;
    }

    const isRequired = value[0].appRoleAssignmentRequired === true;

    if (!isRequired) {
      console.error(
        "[getRoles] SECURITY: 'User assignment required' is NOT enabled on the Enterprise App! " +
          "Any user in the tenant can access /admin. " +
          "Enable it in Azure Portal > Entra ID > Enterprise Apps > Properties."
      );
    }

    return isRequired;
  } catch (error) {
    console.error("[getRoles] Failed to verify assignment required setting:", error.message);
    return false;
  }
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
export async function getRolesHandler(request) {
  try {
    const isRequired = await isAssignmentRequired();

    if (!isRequired) {
      return {
        status: 200,
        jsonBody: { roles: [] },
      };
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Body parsing is optional - userId is just for logging
    }

    console.log("[getRoles] Granting admin role to user:", body.userId || "unknown");

    return {
      status: 200,
      jsonBody: { roles: ["admin"] },
    };
  } catch (error) {
    console.error("[getRoles] Error:", error.message);
    return {
      status: 200,
      jsonBody: { roles: [] },
    };
  }
}

app.http("getRoles", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/get-roles",
  handler: getRolesHandler,
});
