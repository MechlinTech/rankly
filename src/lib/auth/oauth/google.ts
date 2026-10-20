import type { OAuthProviderAdapter, OAuthUserInfo } from "./types";
import { getIntegrationCredential } from "@/lib/admin/integration-credentials";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * Google OAuth 2.0 authorization-code adapter. Real implementation of the
 * protocol (not mocked) — but untested end-to-end since it requires a real
 * Google Cloud OAuth client (GOOGLE_CLIENT_ID/SECRET) to exercise. See
 * KNOWN_LIMITATIONS.md.
 */
export const googleOAuthAdapter: OAuthProviderAdapter = {
  name: "GOOGLE",

  async isConfigured() {
    const [clientId, clientSecret] = await Promise.all([
      getIntegrationCredential("GOOGLE_CLIENT_ID"),
      getIntegrationCredential("GOOGLE_CLIENT_SECRET"),
    ]);
    return !!(clientId && clientSecret);
  },

  async getAuthorizationUrl(state: string, redirectUri: string) {
    const clientId = await getIntegrationCredential("GOOGLE_CLIENT_ID");
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCodeForUser(code: string, redirectUri: string): Promise<OAuthUserInfo> {
    const [clientId, clientSecret] = await Promise.all([
      getIntegrationCredential("GOOGLE_CLIENT_ID"),
      getIntegrationCredential("GOOGLE_CLIENT_SECRET"),
    ]);
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials are not configured.");
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
      throw new Error("Google token exchange failed.");
    }
    const tokenData = await tokenRes.json();

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      throw new Error("Failed to fetch Google user info.");
    }
    const profile = await userRes.json();

    if (!profile.email) {
      throw new Error("Google account has no email.");
    }

    return {
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name ?? null,
    };
  },
};
