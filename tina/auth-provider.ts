import { LocalAuthProvider } from "tinacms";

interface AzureClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

interface AzureAuthResponse {
  clientPrincipal: AzureClientPrincipal | null;
}

/**
 * Custom auth provider for production deployments with Azure AD.
 * Azure AD handles authentication at the platform level (via staticwebapp.config.json).
 * This provider validates authentication by checking the /.auth/me endpoint.
 */
export class AzureADAuthProvider extends LocalAuthProvider {
  private cachedPrincipal: AzureClientPrincipal | null = null;
  private authChecked = false;

  /**
   * Fetch the Azure AD client principal from /.auth/me
   * Returns null if not authenticated or Azure AD is not configured
   */
  private async getClientPrincipal(): Promise<AzureClientPrincipal | null> {
    if (this.authChecked) {
      return this.cachedPrincipal;
    }

    try {
      const response = await fetch("/.auth/me");
      if (!response.ok) {
        console.warn("Azure AD auth check failed:", response.status);
        this.authChecked = true;
        return null;
      }

      const data: AzureAuthResponse = await response.json();
      this.cachedPrincipal = data.clientPrincipal;
      this.authChecked = true;
      return this.cachedPrincipal;
    } catch (error) {
      console.warn("Azure AD auth check error:", error);
      this.authChecked = true;
      return null;
    }
  }

  async authenticate() {
    const principal = await this.getClientPrincipal();
    if (!principal) {
      // Redirect to login if not authenticated
      window.location.href =
        "/.auth/login/aad?post_login_redirect_uri=" +
        encodeURIComponent(window.location.pathname);
      return false;
    }
    return true;
  }

  async isAuthenticated() {
    const principal = await this.getClientPrincipal();
    return principal !== null;
  }

  async isAuthorized() {
    const principal = await this.getClientPrincipal();
    return principal !== null;
  }

  getUser() {
    // Return cached principal or authChecked status for backwards compatibility
    return this.cachedPrincipal || this.authChecked;
  }

  async logout() {
    window.location.href = "/.auth/logout";
  }
}

/**
 * Factory function to get the appropriate auth provider based on environment.
 * - Local dev (TINA_PUBLIC_IS_LOCAL=true): LocalAuthProvider with edit mode dialog
 * - Production/local-prod: AzureADAuthProvider that auto-authenticates
 */
export function createAuthProvider(isLocal: boolean) {
  return isLocal ? new LocalAuthProvider() : new AzureADAuthProvider();
}

