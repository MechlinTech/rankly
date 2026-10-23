import { createPublicKey, verify as verifySignature } from "node:crypto";
import { OAuthError } from "./errors";

const MICROSOFT_LOGIN_HOST = "login.microsoftonline.com";
const METADATA_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_TOKEN_LENGTH = 20_000;

export const MICROSOFT_DEFAULT_TENANT = "common";

export interface MicrosoftOpenIdMetadata {
  issuer: string;
  jwks_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
}

export interface MicrosoftIdTokenClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  tid?: string;
  oid?: string;
  sub?: string;
  azp?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  email_verified?: boolean | string;
  [key: string]: unknown;
}

interface Jwk {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const metadataCache = new Map<string, CacheEntry<MicrosoftOpenIdMetadata>>();
const jwksCache = new Map<string, CacheEntry<Jwk[]>>();

/**
 * Microsoft accepts `common`, `organizations`, `consumers`, a tenant GUID or a
 * verified tenant domain. Restrict the configured value to those shapes so it
 * can never alter the request host/path of an Entra endpoint.
 */
export function normalizeMicrosoftTenantId(value: string | null | undefined): string {
  const tenant = value?.trim();
  if (!tenant) return MICROSOFT_DEFAULT_TENANT;
  if (["common", "organizations", "consumers"].includes(tenant.toLowerCase())) {
    return tenant.toLowerCase();
  }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(tenant)) return tenant.toLowerCase();

  // Verified tenant domains (e.g. contoso.onmicrosoft.com). No scheme, slash,
  // port or query is permitted.
  if (/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(tenant)) {
    return tenant.toLowerCase();
  }

  throw new OAuthError("not_configured", "MICROSOFT_TENANT_ID has an invalid format");
}

export function microsoftEndpoints(tenant: string) {
  const encodedTenant = encodeURIComponent(tenant);
  return {
    authorize: `https://${MICROSOFT_LOGIN_HOST}/${encodedTenant}/oauth2/v2.0/authorize`,
    token: `https://${MICROSOFT_LOGIN_HOST}/${encodedTenant}/oauth2/v2.0/token`,
    metadata: `https://${MICROSOFT_LOGIN_HOST}/${encodedTenant}/v2.0/.well-known/openid-configuration`,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new OAuthError("provider_unavailable", "Microsoft OpenID endpoint was unreachable");
  }
  if (!response.ok) {
    throw new OAuthError("provider_unavailable", `Microsoft OpenID endpoint returned HTTP ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new OAuthError("provider_unavailable", "Microsoft OpenID endpoint returned invalid JSON");
  }
}

function isAllowedMicrosoftUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === MICROSOFT_LOGIN_HOST;
  } catch {
    return false;
  }
}

export async function getMicrosoftOpenIdMetadata(tenant: string): Promise<MicrosoftOpenIdMetadata> {
  const cached = metadataCache.get(tenant);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const raw = await fetchJson<Partial<MicrosoftOpenIdMetadata>>(microsoftEndpoints(tenant).metadata);
  if (
    typeof raw.issuer !== "string" ||
    typeof raw.jwks_uri !== "string" ||
    typeof raw.authorization_endpoint !== "string" ||
    typeof raw.token_endpoint !== "string" ||
    !isAllowedMicrosoftUrl(raw.jwks_uri) ||
    !isAllowedMicrosoftUrl(raw.authorization_endpoint) ||
    !isAllowedMicrosoftUrl(raw.token_endpoint)
  ) {
    throw new OAuthError("provider_unavailable", "Microsoft OpenID metadata was incomplete or untrusted");
  }

  const metadata = raw as MicrosoftOpenIdMetadata;
  metadataCache.set(tenant, { value: metadata, expiresAt: Date.now() + METADATA_TTL_MS });
  return metadata;
}

async function getSigningKeys(jwksUri: string, forceRefresh = false): Promise<Jwk[]> {
  const cached = jwksCache.get(jwksUri);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const raw = await fetchJson<{ keys?: unknown }>(jwksUri);
  if (!Array.isArray(raw.keys)) {
    throw new OAuthError("provider_unavailable", "Microsoft JWKS response had no keys");
  }
  const keys = raw.keys.filter((key): key is Jwk => {
    if (!key || typeof key !== "object") return false;
    const candidate = key as Jwk;
    return candidate.kty === "RSA" && typeof candidate.n === "string" && typeof candidate.e === "string";
  });
  if (keys.length === 0) {
    throw new OAuthError("provider_unavailable", "Microsoft JWKS response had no usable RSA keys");
  }

  jwksCache.set(jwksUri, { value: keys, expiresAt: Date.now() + JWKS_TTL_MS });
  return keys;
}

function decodeJwtJson(part: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new OAuthError("invalid_token", `Microsoft ID token ${label} was invalid`);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function issuerIsValid(
  issuer: string,
  tenantId: string,
  configuredTenant: string,
  metadata: MicrosoftOpenIdMetadata,
): boolean {
  if (isUuid(configuredTenant) && configuredTenant.toLowerCase() !== tenantId.toLowerCase()) {
    return false;
  }

  const expectedIssuers = new Set<string>();
  if (metadata.issuer) {
    expectedIssuers.add(metadata.issuer.replace(/\{tenantid\}/gi, tenantId));
  }
  if (["common", "organizations", "consumers"].includes(configuredTenant)) {
    expectedIssuers.add(`https://${MICROSOFT_LOGIN_HOST}/${tenantId}/v2.0`);
  }
  return expectedIssuers.has(issuer);
}

/**
 * Validates a Microsoft Entra ID / Microsoft 365 ID token:
 * RS256 signature against Entra's published JWKS, issuer, audience, nonce,
 * tenant, and issued/expiry timestamps. All failures are intentionally
 * collapsed into an OAuthError without exposing token contents.
 */
export async function validateMicrosoftIdToken(
  idToken: string,
  options: { clientId: string; nonce: string; tenant: string },
): Promise<MicrosoftIdTokenClaims> {
  if (!idToken || idToken.length > MAX_TOKEN_LENGTH) {
    throw new OAuthError("invalid_token", "Microsoft ID token was missing or too large");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new OAuthError("invalid_token", "Microsoft ID token was not a compact JWT");
  }

  const header = decodeJwtJson(parts[0], "header") as JwtHeader;
  if (header.alg !== "RS256") {
    throw new OAuthError("invalid_token", "Microsoft ID token used an unexpected signing algorithm");
  }
  if (!header.kid) {
    throw new OAuthError("invalid_token", "Microsoft ID token had no signing key id");
  }

  const claims = decodeJwtJson(parts[1], "payload") as MicrosoftIdTokenClaims;

  const metadata = await getMicrosoftOpenIdMetadata(options.tenant);
  let keys = await getSigningKeys(metadata.jwks_uri);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // Entra rotates signing keys; refresh once when an unknown kid appears.
    keys = await getSigningKeys(metadata.jwks_uri, true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) {
    throw new OAuthError("invalid_token", "Microsoft ID token signing key was not published");
  }

  let validSignature = false;
  try {
    const publicKey = createPublicKey({
      key: { kty: "RSA", n: jwk.n!, e: jwk.e! },
      format: "jwk",
    });
    validSignature = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "ascii"),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    throw new OAuthError("invalid_token", "Microsoft ID token signature was invalid");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now - CLOCK_SKEW_SECONDS) {
    throw new OAuthError("expired", "Microsoft ID token has expired");
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + CLOCK_SKEW_SECONDS) {
    throw new OAuthError("invalid_token", "Microsoft ID token is not valid yet");
  }
  if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS) {
    throw new OAuthError("invalid_token", "Microsoft ID token was issued in the future");
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(options.clientId)) {
    throw new OAuthError("invalid_token", "Microsoft ID token audience did not match the client id");
  }
  if (typeof claims.azp === "string" && claims.azp !== options.clientId) {
    throw new OAuthError("invalid_token", "Microsoft ID token authorized party did not match the client id");
  }
  if (typeof claims.nonce !== "string" || claims.nonce !== options.nonce) {
    throw new OAuthError("invalid_token", "Microsoft ID token nonce did not match this sign-in request");
  }

  if (typeof claims.tid !== "string" || !isUuid(claims.tid)) {
    throw new OAuthError("invalid_token", "Microsoft ID token had no tenant id");
  }
  if (typeof claims.iss !== "string" || !issuerIsValid(claims.iss, claims.tid, options.tenant, metadata)) {
    throw new OAuthError("invalid_token", "Microsoft ID token issuer was not trusted for this tenant");
  }
  if (typeof claims.sub !== "string" && typeof claims.oid !== "string") {
    throw new OAuthError("invalid_token", "Microsoft ID token had no stable user identifier");
  }

  return claims;
}
