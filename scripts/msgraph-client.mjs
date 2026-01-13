/**
 * Microsoft Graph API Client (ESM)
 * For accessing Microsoft 365 user directory data
 * https://learn.microsoft.com/en-us/graph/overview
 */

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const AUTH_URL = 'https://login.microsoftonline.com';

export class MSGraphClient {
  #tenantId;
  #clientId;
  #clientSecret;
  #accessToken;
  #tokenExpiry;

  /**
   * @param {Object} config
   * @param {string} config.tenantId - Azure AD tenant ID
   * @param {string} config.clientId - App registration client ID
   * @param {string} config.clientSecret - App registration client secret
   */
  constructor({ tenantId, clientId, clientSecret }) {
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('MSGraphClient requires tenantId, clientId, and clientSecret');
    }
    this.#tenantId = tenantId;
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
  }

  /**
   * Authenticate using client credentials flow
   */
  async #authenticate() {
    // Return cached token if still valid (with 60s buffer)
    if (this.#accessToken && this.#tokenExpiry && Date.now() < this.#tokenExpiry - 60000) {
      return this.#accessToken;
    }

    const tokenUrl = `${AUTH_URL}/${this.#tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.#clientId,
        client_secret: this.#clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft Graph authentication failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    this.#accessToken = data.access_token;
    this.#tokenExpiry = Date.now() + (data.expires_in * 1000);
    return this.#accessToken;
  }

  /**
   * Make authenticated API request
   */
  async #request(path, options = {}) {
    const token = await this.#authenticate();
    const url = path.startsWith('http') ? path : `${GRAPH_BASE_URL}${path}`;

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(options.binary ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      // 404 for photos means no photo set
      if (response.status === 404 && path.includes('/photo')) {
        return null;
      }
      const error = await response.text();
      throw new Error(`Microsoft Graph API error: ${response.status} - ${error}`);
    }

    if (options.binary) {
      return response.arrayBuffer();
    }

    return response.json();
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
    const params = new URLSearchParams();

    if (options.filter) {
      params.append('$filter', options.filter);
    }
    if (options.select?.length) {
      params.append('$select', options.select.join(','));
    }
    if (options.orderBy) {
      params.append('$orderby', options.orderBy);
    }
    if (options.top) {
      params.append('$top', options.top.toString());
    }

    const query = params.toString();
    return this.#request(`/users${query ? `?${query}` : ''}`);
  }

  /**
   * Get members of a security group
   * @param {string} groupId - Group ID or name
   * @param {string[]} [select] - Fields to return
   */
  async getGroupMembers(groupId, select = []) {
    const params = new URLSearchParams();
    if (select.length) {
      params.append('$select', select.join(','));
    }
    const query = params.toString();
    return this.#request(`/groups/${groupId}/members${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single user
   * @param {string} userId - User ID or userPrincipalName
   * @param {string[]} [select] - Fields to return
   */
  async getUser(userId, select = []) {
    const params = new URLSearchParams();
    if (select.length) {
      params.append('$select', select.join(','));
    }
    const query = params.toString();
    return this.#request(`/users/${userId}${query ? `?${query}` : ''}`);
  }

  /**
   * Get user's photo as binary data
   * @param {string} userId - User ID or userPrincipalName
   * @param {string} [size] - Photo size (48x48, 64x64, 96x96, 120x120, 240x240, 360x360, 432x432, 504x504, 648x648)
   * @returns {ArrayBuffer|null} Photo data or null if no photo
   */
  async getUserPhoto(userId, size = '648x648') {
    try {
      return await this.#request(`/users/${userId}/photos/${size}/$value`, { binary: true });
    } catch (error) {
      // Try default photo endpoint if specific size fails
      if (size !== '648x648') {
        return this.#request(`/users/${userId}/photo/$value`, { binary: true });
      }
      return null;
    }
  }

  /**
   * Get user's group memberships
   * @param {string} userId - User ID or userPrincipalName
   */
  async getUserGroups(userId) {
    return this.#request(`/users/${userId}/memberOf`);
  }

  /**
   * List all groups
   * @param {Object} [options]
   * @param {string} [options.filter] - OData filter
   * @param {string[]} [options.select] - Fields to return
   */
  async listGroups(options = {}) {
    const params = new URLSearchParams();
    if (options.filter) {
      params.append('$filter', options.filter);
    }
    if (options.select?.length) {
      params.append('$select', options.select.join(','));
    }
    const query = params.toString();
    return this.#request(`/groups${query ? `?${query}` : ''}`);
  }

  /**
   * Fetch all pages of results
   * @param {Function} fetchFn - Function that returns paginated results
   * @yields {Object} Individual items
   */
  async *fetchAllPages(initialResponse) {
    let response = initialResponse;

    while (response) {
      for (const item of response.value || []) {
        yield item;
      }

      if (response['@odata.nextLink']) {
        response = await this.#request(response['@odata.nextLink']);
      } else {
        break;
      }
    }
  }
}

export default MSGraphClient;
