import type { OAuthProviderAdapter, OAuthUserInfo } from "./types";

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

  isConfigured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },

  getAuthorizationUrl(state: string, redirectUri: string) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
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
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
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
