/**
 * Microsoft Graph API Client
 * Wrapper around @microsoft/microsoft-graph-client for accessing Microsoft 365 data
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

export class MSGraphClient {
  #client;

  /**
   * @param {Object} config
   * @param {string} config.tenantId - Azure AD tenant ID
   * @param {string} config.clientId - App registration client ID
   * @param {string} config.clientSecret - App registration client secret
   */
  constructor({ tenantId, clientId, clientSecret }) {
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("MSGraphClient requires tenantId, clientId, and clientSecret");
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });

    this.#client = Client.initWithMiddleware({ authProvider });
  }

  /**
   * Get a service principal by app ID
   * @param {string} appId - Application (client) ID
   * @param {string[]} [select] - Fields to return
   * @returns {Object|null} Service principal or null if not found
   */
  async getServicePrincipal(appId, select = ["appRoleAssignmentRequired"]) {
    try {
      const response = await this.#client
        .api("/servicePrincipals")
        .filter(`appId eq '${appId}'`)
        .select(select)
        .get();

      if (!response.value || response.value.length === 0) {
        return null;
      }

      return response.value[0];
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}

/**
 * Creates an MSGraphClient from environment variables
 * @returns {MSGraphClient|null} Client instance or null if credentials missing
 */
export function createMSGraphClient() {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return new MSGraphClient({ tenantId, clientId, clientSecret });
}
