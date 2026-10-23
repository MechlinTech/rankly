import { OAuthError } from "./errors";

export type OAuthProviderSlug = "google" | "microsoft";

/**
 * Canonical callback path for a provider. Keep this in sync with the route
 * handlers under src/app/api/auth/oauth/<provider>/callback.
 */
export function oauthCallbackPath(provider: OAuthProviderSlug): string {
  return `/api/auth/oauth/${provider}/callback`;
}

/**
 * Path used by older deployments (and by provider app registrations created
 * before the /api/auth/oauth/* routes existed). It is an alias of the canonical
 * callback and must stay in sync with src/app/api/auth/callback/<provider>.
 */
export function legacyCallbackPath(provider: OAuthProviderSlug): string {
  return `/api/auth/callback/${provider}`;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function buildFromOrigin(
  callbackPath: string,
  origin: string,
  label: string,
  nodeEnv: string | undefined,
): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new OAuthError("configuration_error", `${label} is not a valid absolute URL`);
  }
  if (url.protocol !== "https:" && !(nodeEnv !== "production" && isLocalHostname(url.hostname))) {
    throw new OAuthError("configuration_error", `${label} must use HTTPS in production`);
  }
  return new URL(callbackPath, url.origin).toString();
}

export interface OAuthRedirectUriOptions {
  provider: OAuthProviderSlug;
  /** Canonical APP_URL, if configured. */
  appUrl?: string | null;
  /** Optional <PROVIDER>_REDIRECT_URI override. */
  override?: string | null;
  /** Runtime environment, normally process.env.NODE_ENV. */
  nodeEnv?: string;
  /** Best-effort request origin, used only in non-production when APP_URL is unset. */
  requestOrigin?: string | null;
}

/**
 * Resolves the exact callback URL sent to the identity provider.
 *
 * The same value must be produced on /start and /callback, so the resolution
 * is deliberately independent of the incoming request whenever APP_URL or an
 * explicit override is available. An override must point at a callback path
 * this app actually serves (canonical or legacy alias); anything else fails
 * closed instead of sending users to a dead URL.
 */
export function resolveOAuthRedirectUri(options: OAuthRedirectUriOptions): string {
  const { provider } = options;
  const callbackPath = oauthCallbackPath(provider);
  const legacyPath = legacyCallbackPath(provider);
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const override = options.override?.trim();
  const canonical = options.appUrl?.trim();

  if (override) {
    let url: URL;
    try {
      url = new URL(override);
    } catch {
      throw new OAuthError("configuration_error", `${provider}_REDIRECT_URI is not a valid absolute URL`);
    }

    if (url.username || url.password || url.search || url.hash) {
      throw new OAuthError(
        "configuration_error",
        `${provider}_REDIRECT_URI must not contain credentials, a query string, or a hash`,
      );
    }
    if (url.pathname !== callbackPath && url.pathname !== legacyPath) {
      throw new OAuthError(
        "configuration_error",
        `${provider}_REDIRECT_URI must use ${callbackPath} (or the legacy ${legacyPath})`,
      );
    }
    if (url.protocol !== "https:" && !(nodeEnv !== "production" && isLocalHostname(url.hostname))) {
      throw new OAuthError("configuration_error", `${provider}_REDIRECT_URI must use HTTPS in production`);
    }
    return url.toString();
  }

  if (canonical) {
    return buildFromOrigin(callbackPath, canonical, "APP_URL", nodeEnv);
  }

  if (nodeEnv === "production") {
    throw new OAuthError("configuration_error", "APP_URL must be set in production for OAuth callbacks");
  }
  if (!options.requestOrigin) {
    throw new OAuthError("configuration_error", "Could not determine the OAuth callback origin");
  }
  return buildFromOrigin(callbackPath, options.requestOrigin, "Request origin", nodeEnv);
}
