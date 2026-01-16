/**
 * Authentication helpers for Azure Static Web Apps
 *
 * Azure SWA provides authentication info via headers:
 * - x-ms-client-principal: Base64 encoded JSON with user info and roles
 * - x-ms-client-principal-id: User ID
 * - x-ms-client-principal-name: User name
 *
 * The staticwebapp.config.json routes already require "admin" role,
 * but these functions provide defense-in-depth validation.
 */

const REQUIRED_ROLE = "admin";

/**
 * Parse the client principal from Azure SWA headers
 * @param {Request} request - Azure Functions request object
 * @returns {Object|null} Parsed client principal or null
 */
function getClientPrincipal(request) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) {
    return null;
  }

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

/**
 * Check if user has the required admin role
 * @param {Request} request - Azure Functions request object
 * @returns {boolean} True if user has admin role
 */
function hasAdminRole(request) {
  const principal = getClientPrincipal(request);
  if (!principal) {
    return false;
  }

  const roles = principal.userRoles || [];
  return roles.includes(REQUIRED_ROLE);
}

/**
 * Validate request has admin authentication
 * Returns error response if not authenticated, null if OK
 *
 * @param {Request} request - Azure Functions request object
 * @param {Object} context - Azure Functions context for logging
 * @returns {Object|null} Error response object or null if authenticated
 */
function requireAdmin(request, context) {
  // Allow local development to bypass auth
  const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";
  if (isLocal) {
    return null;
  }

  const principal = getClientPrincipal(request);

  if (!principal) {
    context.warn("Unauthorized access attempt - no client principal");
    return {
      status: 401,
      jsonBody: { error: "Authentication required" },
    };
  }

  if (!hasAdminRole(request)) {
    const userId = principal.userId || "unknown";
    context.warn(`Forbidden access attempt by user ${userId} - missing admin role`);
    return {
      status: 403,
      jsonBody: { error: "Admin role required" },
    };
  }

  return null;
}

/**
 * Get user info for logging purposes
 * @param {Request} request - Azure Functions request object
 * @returns {string} User identifier for logs
 */
function getUserForLogging(request) {
  const principal = getClientPrincipal(request);
  if (!principal) {
    return "anonymous";
  }
  return principal.userDetails || principal.userId || "unknown";
}

module.exports = {
  getClientPrincipal,
  hasAdminRole,
  requireAdmin,
  getUserForLogging,
};
