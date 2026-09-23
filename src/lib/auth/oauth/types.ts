export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthUserInfo {
  providerUserId: string;
  email: string;
  name: string | null;
}

export interface OAuthProviderAdapter {
  readonly name: "GOOGLE" | "MICROSOFT";
  isConfigured(): boolean;
  getAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCodeForUser(code: string, redirectUri: string): Promise<OAuthUserInfo>;
}
