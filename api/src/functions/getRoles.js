import { app } from "@azure/functions";
import { createMSGraphClient } from "../lib/msgraph-client.js";

/**
 * Checks if "User assignment required" is enabled on the Enterprise App.
 * Uses Microsoft Graph API to verify the appRoleAssignmentRequired property.
 *
 * @returns {Promise<boolean>} True if assignment is required, false otherwise
 */
export async function isAssignmentRequired() {
  const swaAppId = process.env.AAD_CLIENT_ID;

  if (!swaAppId) {
    console.error("[getRoles] Missing AAD_CLIENT_ID environment variable");
    return false;
  }

  const client = createMSGraphClient();
  if (!client) {
    console.error(
      "[getRoles] Missing MS Graph credentials. Required: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET"
    );
    return false;
  }

  try {
    const servicePrincipal = await client.getServicePrincipal(swaAppId);

    if (!servicePrincipal) {
      console.error(`[getRoles] Service principal not found for appId: ${swaAppId}`);
      return false;
    }

    const isRequired = servicePrincipal.appRoleAssignmentRequired === true;

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
