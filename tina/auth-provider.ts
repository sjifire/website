import { LocalAuthProvider } from "tinacms";

/**
 * Custom auth provider for production deployments with Azure AD.
 * Azure AD handles authentication at the platform level (via staticwebapp.config.json),
 * so this provider auto-authenticates and skips the "enter edit mode" dialog.
 */
export class AzureADAuthProvider extends LocalAuthProvider {
  async authenticate() {
    return true;
  }

  async isAuthenticated() {
    return true;
  }

  async isAuthorized() {
    return true;
  }

  getUser() {
    return true;
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

