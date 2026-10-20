import type { OAuthProviderAdapter, OAuthUserInfo } from "./types";
import { getIntegrationCredential } from "@/lib/admin/integration-credentials";

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const USERINFO_URL = "https://graph.microsoft.com/oidc/userinfo";

/**
 * Microsoft (Azure AD / Entra ID, multi-tenant "common" endpoint) OAuth 2.0
 * authorization-code adapter for Microsoft 365 / Outlook sign-in. Real
 * implementation of the protocol — untested end-to-end since it requires a
 * real Azure App Registration (MICROSOFT_CLIENT_ID/SECRET). See
 * KNOWN_LIMITATIONS.md.
 */
export const microsoftOAuthAdapter: OAuthProviderAdapter = {
  name: "MICROSOFT",

  async isConfigured() {
    const [clientId, clientSecret] = await Promise.all([
      getIntegrationCredential("MICROSOFT_CLIENT_ID"),
      getIntegrationCredential("MICROSOFT_CLIENT_SECRET"),
    ]);
    return !!(clientId && clientSecret);
  },

  async getAuthorizationUrl(state: string, redirectUri: string) {
    const clientId = await getIntegrationCredential("MICROSOFT_CLIENT_ID");
    if (!clientId) throw new Error("MICROSOFT_CLIENT_ID is not configured.");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile User.Read",
      state,
      response_mode: "query",
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForUser(code: string, redirectUri: string): Promise<OAuthUserInfo> {
    const [clientId, clientSecret] = await Promise.all([
      getIntegrationCredential("MICROSOFT_CLIENT_ID"),
      getIntegrationCredential("MICROSOFT_CLIENT_SECRET"),
    ]);
    if (!clientId || !clientSecret) throw new Error("Microsoft OAuth credentials are not configured.");
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error("Microsoft token exchange failed.");
    }
    const tokenData = await tokenRes.json();

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      throw new Error("Failed to fetch Microsoft user info.");
    }
    const profile = await userRes.json();

    const email = profile.email ?? profile.preferred_username;
    if (!email) {
      throw new Error("Microsoft account has no email.");
    }

    return {
      providerUserId: profile.sub,
      email,
      name: profile.name ?? null,
    };
  },
};
