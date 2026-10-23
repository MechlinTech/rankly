export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthUserInfo {
  providerUserId: string;
  email: string;
  name: string | null;
  /**
   * True when the provider has asserted that the user controls this email.
   * New users get emailVerified set, and existing users are only auto-linked
   * when this is true.
   */
  emailVerified: boolean;
}

export interface OAuthAuthorizationOptions {
  /** OIDC nonce to bind the ID token to this authorization request. */
  nonce?: string;
  /** PKCE S256 challenge. */
  codeChallenge?: string;
}

export interface OAuthExchangeOptions {
  /** PKCE code verifier generated with the challenge. */
  codeVerifier?: string;
  /** Nonce that must match the ID token's nonce claim. */
  nonce?: string;
}

export interface OAuthProviderAdapter {
  readonly name: "GOOGLE" | "MICROSOFT";
  isConfigured(): Promise<boolean>;
  getAuthorizationUrl(
    state: string,
    redirectUri: string,
    options?: OAuthAuthorizationOptions,
  ): Promise<string>;
  exchangeCodeForUser(
    code: string,
    redirectUri: string,
    options?: OAuthExchangeOptions,
  ): Promise<OAuthUserInfo>;
}
