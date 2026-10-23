/**
 * Safe, internal OAuth failure codes. These are mapped to user-facing messages
 * at the edge (the login page); provider responses, tokens and secret values
 * must never be forwarded to the browser.
 */
export type OAuthErrorCode =
  | "not_configured"
  | "configuration_error"
  | "cancelled"
  | "state_mismatch"
  | "expired"
  | "token_exchange_failed"
  | "invalid_token"
  | "email_missing"
  | "email_unverified"
  | "account_conflict"
  | "provider_unavailable"
  | "server_error";

export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  /**
   * Optional non-sensitive diagnostic detail for server logs only. Never a
   * token, authorization code, client secret, email address or raw provider
   * payload.
   */
  readonly detail?: string;

  constructor(code: OAuthErrorCode, detail?: string) {
    super(code);
    this.name = "OAuthError";
    this.code = code;
    this.detail = detail;
  }
}

/** Maps an OAuth/authorization error returned by the provider to a safe code. */
export function oauthErrorCodeFromProvider(error: string | null): OAuthErrorCode {
  switch (error) {
    case "access_denied":
    case "consent_required":
    case "user_cancelled":
      return "cancelled";
    case "interaction_required":
    case "login_required":
      return "expired";
    case "temporarily_unavailable":
    case "server_error":
      return "provider_unavailable";
    case "invalid_scope":
    case "unauthorized_client":
    case "invalid_client":
    case "unsupported_response_type":
      return "not_configured";
    case "invalid_request":
    case "redirect_uri_mismatch":
      return "configuration_error";
    default:
      return "token_exchange_failed";
  }
}

/** The `error` query-string value the login page understands. */
export function loginErrorFor(code: OAuthErrorCode): string {
  switch (code) {
    case "not_configured":
      return "oauth_not_configured";
    case "configuration_error":
      return "oauth_configuration_error";
    case "cancelled":
      return "oauth_cancelled";
    case "state_mismatch":
      return "oauth_state";
    case "expired":
      return "oauth_expired";
    case "email_missing":
    case "email_unverified":
    case "account_conflict":
      return "oauth_account_conflict";
    case "provider_unavailable":
      return "oauth_unavailable";
    case "server_error":
      return "oauth_server_error";
    case "token_exchange_failed":
    case "invalid_token":
    default:
      return "oauth_failed";
  }
}
