import { timingSafeEqual } from "node:crypto";

export interface OAuthStatePayload {
  /** Random CSRF state echoed back by the provider. */
  state: string;
  /** OIDC nonce that must be present in the validated ID token. */
  nonce: string;
  /** PKCE code verifier used during the token exchange. */
  codeVerifier: string;
  /** Safe, same-origin path to return to after sign-in. */
  next: string | null;
  /** Unix epoch milliseconds; lets a stale cookie fail closed. */
  createdAt: number;
}

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Encodes the short-lived state cookie value. It is HttpOnly and never sent by the client app. */
export function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeOAuthState(value: string | undefined | null): OAuthStatePayload | null {
  if (!value || value.length > 4096) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<OAuthStatePayload>;
    if (typeof candidate.state !== "string" || candidate.state.length < 16) return null;
    if (typeof candidate.nonce !== "string" || candidate.nonce.length < 16) return null;
    if (typeof candidate.codeVerifier !== "string" || candidate.codeVerifier.length < 32) return null;
    if (typeof candidate.createdAt !== "number" || !Number.isFinite(candidate.createdAt)) return null;
    if (candidate.next !== null && typeof candidate.next !== "string") return null;
    return {
      state: candidate.state,
      nonce: candidate.nonce,
      codeVerifier: candidate.codeVerifier,
      next: candidate.next ?? null,
      createdAt: candidate.createdAt,
    };
  } catch {
    return null;
  }
}

/** Constant-time string comparison that does not throw on length mismatch. */
export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Only allow same-origin, absolute paths as a post-login destination.
 * Rejects protocol-relative (`//evil.example`), backslash and control-character
 * variants that browsers might treat as an authority change.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  try {
    const parsed = new URL(value, "http://rankly.invalid");
    if (parsed.origin !== "http://rankly.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
