import type {
  OAuthAuthorizationOptions,
  OAuthExchangeOptions,
  OAuthProviderAdapter,
  OAuthUserInfo,
} from "./types";
import { getIntegrationCredential } from "@/lib/admin/integration-credentials";
import { OAuthError } from "./errors";
import {
  microsoftEndpoints,
  normalizeMicrosoftTenantId,
  validateMicrosoftIdToken,
  type MicrosoftIdTokenClaims,
} from "./microsoft-oidc";

const SCOPES = ["openid", "profile", "email", "User.Read"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface MicrosoftTokenResponse {
  access_token?: unknown;
  id_token?: unknown;
  token_type?: unknown;
  error?: unknown;
  error_description?: unknown;
}

interface MicrosoftGraphProfile {
  mail?: unknown;
  userPrincipalName?: unknown;
  displayName?: unknown;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 255 || !EMAIL.test(email)) return null;
  // Guest UPNs look like "user_domain.com#EXT#@tenant.onmicrosoft.com" and are
  // not deliverable mailbox addresses. Prefer a real mail claim from Graph.
  if (email.includes("#ext#")) return null;
  return email;
}

function safeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name ? name.slice(0, 200) : null;
}

async function fetchGraphProfile(accessToken: string): Promise<MicrosoftGraphProfile | null> {
  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName",
      {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as MicrosoftGraphProfile;
  } catch {
    return null;
  }
}

function resolveEmail(
  claims: MicrosoftIdTokenClaims,
  graphProfile: MicrosoftGraphProfile | null,
): string | null {
  return (
    normalizeEmail(claims.email) ??
    normalizeEmail(claims.preferred_username) ??
    normalizeEmail(graphProfile?.mail) ??
    normalizeEmail(graphProfile?.userPrincipalName)
  );
}

/**
 * Microsoft Entra ID / Microsoft 365 OpenID Connect adapter.
 *
 * Uses the authorization-code flow with state, nonce, PKCE S256 and full ID
 * token validation (signature, issuer, audience, tenant, nonce, expiry). The
 * access token is used only to read the signed-in user's mailbox address from
 * Microsoft Graph when the ID token does not contain a usable email.
 */
export const microsoftOAuthAdapter: OAuthProviderAdapter = {
  name: "MICROSOFT",

  async isConfigured() {
    const [clientId, clientSecret] = await Promise.all([
      getIntegrationCredential("MICROSOFT_CLIENT_ID"),
      getIntegrationCredential("MICROSOFT_CLIENT_SECRET"),
    ]);
    if (!clientId || !clientSecret || !UUID.test(clientId.trim())) return false;
    try {
      normalizeMicrosoftTenantId(await getIntegrationCredential("MICROSOFT_TENANT_ID"));
      return true;
    } catch {
      return false;
    }
  },

  async getAuthorizationUrl(
    state: string,
    redirectUri: string,
    options: OAuthAuthorizationOptions = {},
  ) {
    const [clientId, tenantId] = await Promise.all([
      getIntegrationCredential("MICROSOFT_CLIENT_ID"),
      getIntegrationCredential("MICROSOFT_TENANT_ID").then(normalizeMicrosoftTenantId),
    ]);
    if (!clientId) throw new OAuthError("not_configured", "MICROSOFT_CLIENT_ID is not configured");

    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
      prompt: "select_account",
    });
    if (options.nonce) params.set("nonce", options.nonce);
    if (options.codeChallenge) {
      params.set("code_challenge", options.codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    return `${microsoftEndpoints(tenantId).authorize}?${params.toString()}`;
  },

  async exchangeCodeForUser(
    code: string,
    redirectUri: string,
    options: OAuthExchangeOptions = {},
  ): Promise<OAuthUserInfo> {
    const [clientId, clientSecret, tenantId] = await Promise.all([
      getIntegrationCredential("MICROSOFT_CLIENT_ID"),
      getIntegrationCredential("MICROSOFT_CLIENT_SECRET"),
      getIntegrationCredential("MICROSOFT_TENANT_ID").then(normalizeMicrosoftTenantId),
    ]);
    if (!clientId || !clientSecret) {
      throw new OAuthError("not_configured", "Microsoft OAuth credentials are not configured");
    }
    if (!options.nonce || !options.codeVerifier) {
      throw new OAuthError("invalid_token", "Microsoft sign-in request was missing nonce or PKCE verifier");
    }

    const body = new URLSearchParams({
      client_id: clientId.trim(),
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
      code_verifier: options.codeVerifier,
    });

    let response: Response;
    try {
      response = await fetch(microsoftEndpoints(tenantId).token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new OAuthError("provider_unavailable", "Microsoft token endpoint was unreachable");
    }

    const tokenData = (await response.json().catch(() => null)) as MicrosoftTokenResponse | null;
    if (!response.ok || !tokenData) {
      const providerError = typeof tokenData?.error === "string" ? tokenData.error : undefined;
      // Never log tokenData.error_description: it can include request details.
      console.warn("[oauth:microsoft] Token exchange failed", {
        status: response.status,
        providerError: providerError ?? "unknown",
      });
      if (providerError === "invalid_grant" || providerError === "interaction_required") {
        throw new OAuthError("expired", "Microsoft authorization code was invalid or expired");
      }
      if (providerError === "invalid_client" || providerError === "unauthorized_client") {
        throw new OAuthError("not_configured", "Microsoft rejected the configured client credentials");
      }
      throw new OAuthError("token_exchange_failed", "Microsoft token exchange failed");
    }

    if (typeof tokenData.id_token !== "string") {
      throw new OAuthError("invalid_token", "Microsoft token response omitted the ID token");
    }

    const claims = await validateMicrosoftIdToken(tokenData.id_token, {
      clientId: clientId.trim(),
      nonce: options.nonce,
      tenant: tenantId,
    });

    // Explicitly unverified Microsoft accounts must not be linked to an
    // existing Rankly account by email.
    if (claims.email_verified === false || claims.email_verified === "false") {
      throw new OAuthError("email_unverified", "Microsoft reported an unverified email address");
    }

    let graphProfile: MicrosoftGraphProfile | null = null;
    let email = resolveEmail(claims, null);
    if (!email && typeof tokenData.access_token === "string") {
      graphProfile = await fetchGraphProfile(tokenData.access_token);
      email = resolveEmail(claims, graphProfile);
    }
    if (!email) {
      throw new OAuthError("email_missing", "Microsoft account has no usable email address");
    }

    const providerUserId =
      typeof claims.oid === "string" && claims.oid.length > 0
        ? claims.oid
        : typeof claims.sub === "string"
          ? claims.sub
          : null;
    if (!providerUserId) {
      throw new OAuthError("invalid_token", "Microsoft account has no stable user identifier");
    }

    return {
      providerUserId,
      email,
      name: safeName(claims.name) ?? safeName(graphProfile?.displayName),
      // Entra work/school accounts and Microsoft-verified consumer accounts
      // assert control of the address via the ID token or Graph profile.
      emailVerified: true,
    };
  },
};
