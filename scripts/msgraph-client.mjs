/**
 * Microsoft Graph API Client (ESM)
 * Wrapper around @microsoft/microsoft-graph-client for accessing Microsoft 365 data
 * https://learn.microsoft.com/en-us/graph/overview
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

    // Create credential using Azure Identity
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    // Create auth provider for Graph client
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });

    // Initialize Graph client
    this.#client = Client.initWithMiddleware({
      authProvider,
    });
  }

  /**
   * List users with optional filters
   * @param {Object} [options]
   * @param {string} [options.filter] - OData filter (e.g., "department eq 'Fire'")
   * @param {string[]} [options.select] - Fields to return
   * @param {string} [options.orderBy] - Sort field
   * @param {number} [options.top] - Max results per page
   */
  async listUsers(options = {}) {
    let request = this.#client.api("/users");

    if (options.filter) request = request.filter(options.filter);
    if (options.select?.length) request = request.select(options.select);
    if (options.orderBy) request = request.orderby(options.orderBy);
    if (options.top) request = request.top(options.top);

    return request.get();
  }

  /**
   * Get members of a security group
   * @param {string} groupId - Group ID or name
   * @param {string[]} [select] - Fields to return
   */
  async getGroupMembers(groupId, select = []) {
    let request = this.#client.api(`/groups/${groupId}/members`);
    if (select.length) request = request.select(select);
    return request.get();
  }

  /**
   * Get a single user
   * @param {string} userId - User ID or userPrincipalName
   * @param {string[]} [select] - Fields to return
   */
  async getUser(userId, select = []) {
    let request = this.#client.api(`/users/${userId}`);
    if (select.length) request = request.select(select);
    return request.get();
  }

  /**
   * Get user's photo as binary data
   * @param {string} userId - User ID or userPrincipalName
   * @param {string} [size] - Photo size (48x48, 64x64, 96x96, 120x120, 240x240, 360x360, 432x432, 504x504, 648x648)
   * @returns {ArrayBuffer|null} Photo data or null if no photo
   */
  async getUserPhoto(userId, size = "648x648") {
    try {
      const response = await this.#client
        .api(`/users/${userId}/photos/${size}/$value`)
        .get();
      return response;
    } catch (error) {
      // Try default photo endpoint if specific size fails
      if (size !== "648x648" && error.statusCode !== 404) {
        try {
          return await this.#client.api(`/users/${userId}/photo/$value`).get();
        } catch {
          return null;
        }
      }
      // 404 means no photo
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get user's group memberships
   * @param {string} userId - User ID or userPrincipalName
   */
  async getUserGroups(userId) {
    return this.#client.api(`/users/${userId}/memberOf`).get();
  }

  /**
   * List all groups
   * @param {Object} [options]
   * @param {string} [options.filter] - OData filter
   * @param {string[]} [options.select] - Fields to return
   */
  async listGroups(options = {}) {
    let request = this.#client.api("/groups");
    if (options.filter) request = request.filter(options.filter);
    if (options.select?.length) request = request.select(options.select);
    return request.get();
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

  /**
   * Fetch all pages of results
   * @param {Object} initialResponse - Response from initial API call
   * @yields {Object} Individual items
   */
  async *fetchAllPages(initialResponse) {
    let response = initialResponse;

    while (response) {
      for (const item of response.value || []) {
        yield item;
      }

      if (response["@odata.nextLink"]) {
        response = await this.#client.api(response["@odata.nextLink"]).get();
      } else {
        break;
      }
    }
  }
}

export default MSGraphClient;
