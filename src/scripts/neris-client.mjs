/**
 * NERIS API Client (ESM)
 * National Emergency Response Information System
 * https://neris.fsri.org/technical-reference
 */

const DEFAULT_BASE_URL = 'https://api.neris.fsri.org/v1';
const TEST_BASE_URL = 'https://api-test.neris.fsri.org/v1';

export class NerisClient {
  #baseUrl;
  #clientId;
  #clientSecret;
  #accessToken;
  #tokenExpiry;

  /**
   * @param {Object} config
   * @param {string} config.clientId - OAuth2 client ID
   * @param {string} config.clientSecret - OAuth2 client secret
   * @param {string} [config.baseUrl] - API base URL (defaults to production)
   * @param {boolean} [config.useTestApi] - Use test API instead of production
   */
  constructor({ clientId, clientSecret, baseUrl, useTestApi = false }) {
    if (!clientId || !clientSecret) {
      throw new Error('NERIS API requires clientId and clientSecret');
    }
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#baseUrl = baseUrl || (useTestApi ? TEST_BASE_URL : DEFAULT_BASE_URL);
  }

  /**
   * Authenticate and get access token
   */
  async #authenticate() {
    // Return cached token if still valid (with 60s buffer)
    if (this.#accessToken && this.#tokenExpiry && Date.now() < this.#tokenExpiry - 60000) {
      return this.#accessToken;
    }

    const response = await fetch(`${this.#baseUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.#clientId,
        client_secret: this.#clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NERIS authentication failed: ${response.status} - ${error}`);
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
    const url = new URL(path, this.#baseUrl);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NERIS API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get entity (fire department) information
   * @param {string} nerisId - Entity NERIS ID (e.g., "FD24027240")
   */
  async getEntity(nerisId) {
    return this.#request(`/entity/${nerisId}`);
  }

  /**
   * List entities with optional filters
   * @param {Object} [filters]
   * @param {string} [filters.name] - Name substring search
   * @param {string} [filters.state] - Two-character state code
   * @param {string} [filters.entityClass] - FIRE_DEPARTMENT, FIRE_MARSHAL, etc.
   * @param {number} [filters.pageSize] - Results per page (1-100)
   * @param {number} [filters.pageNumber] - Page number
   */
  async listEntities(filters = {}) {
    return this.#request('/entity', {
      params: {
        name: filters.name,
        state: filters.state,
        entity_class: filters.entityClass,
        page_size: filters.pageSize,
        page_number: filters.pageNumber,
      },
    });
  }

  /**
   * List incidents with filters
   * @param {Object} [filters]
   * @param {string} [filters.entityId] - Filter by entity NERIS ID
   * @param {string} [filters.incidentTypes] - Filter by incident type/subtype
   * @param {string} [filters.callCreateStart] - Start date (ISO 8601)
   * @param {string} [filters.callCreateEnd] - End date (ISO 8601)
   * @param {string} [filters.status] - Incident status
   * @param {string} [filters.state] - Two-character state code
   * @param {string} [filters.sortBy] - Field to sort by (default: call_create)
   * @param {string} [filters.sortDirection] - ASCENDING or DESCENDING
   * @param {number} [filters.pageSize] - Results per page (1-100, default: 10)
   * @param {string} [filters.cursor] - Pagination cursor
   */
  async listIncidents(filters = {}) {
    return this.#request('/incident', {
      params: {
        neris_id_entity: filters.entityId,
        incident_types: filters.incidentTypes,
        call_create_start: filters.callCreateStart,
        call_create_end: filters.callCreateEnd,
        status: filters.status,
        state: filters.state,
        sort_by: filters.sortBy,
        sort_direction: filters.sortDirection,
        page_size: filters.pageSize,
        cursor: filters.cursor,
      },
    });
  }

  /**
   * Get a single incident
   * @param {string} entityId - Entity NERIS ID
   * @param {string} incidentId - Incident NERIS ID
   */
  async getIncident(entityId, incidentId) {
    return this.#request(`/incident/${entityId}/${incidentId}`);
  }

  /**
   * Get incident history
   * @param {string} entityId - Entity NERIS ID
   * @param {string} incidentId - Incident NERIS ID
   */
  async getIncidentHistory(entityId, incidentId) {
    return this.#request(`/incident/${entityId}/${incidentId}/history`);
  }

  /**
   * Fetch all incidents with pagination
   * @param {Object} filters - Same filters as listIncidents
   * @yields {Object} Individual incident objects
   */
  async *fetchAllIncidents(filters = {}) {
    let cursor = null;
    const pageSize = filters.pageSize || 100;

    do {
      const response = await this.listIncidents({
        ...filters,
        pageSize,
        cursor,
      });

      for (const incident of response.data || []) {
        yield incident;
      }

      cursor = response.next_cursor;
    } while (cursor);
  }
}

export default NerisClient;
