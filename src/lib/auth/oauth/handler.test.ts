import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeOAuthState } from "./state";
import type { OAuthProviderAdapter } from "./types";

const mocks = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
  };
  const createSession = vi.fn(async (_userId: string, _meta: unknown, response: Response & {
    cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void };
  }) => {
    response.cookies.set("rankly_session", "test-session-token", { path: "/" });
  });
  return {
    cookieStore,
    createSession,
    prisma: {
      oAuthAccount: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      membership: { findFirst: vi.fn() },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mocks.cookieStore,
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
  isSecureCookie: () => true,
}));

import { handleOAuthCallback, handleOAuthStart } from "./handler";

const APP_URL = "https://rankly.example.com";
const STATE = "a".repeat(64);
const NONCE = "b".repeat(43);
const CODE_VERIFIER = "c".repeat(43);
const COOKIE_NAME = "__Host-rankly_oauth_state_MICROSOFT";

function callbackRequest(query = `state=${STATE}&code=authorization-code`) {
  return new NextRequest(`${APP_URL}/api/auth/oauth/microsoft/callback?${query}`, {
    headers: {
      "x-forwarded-proto": "https",
      "user-agent": "vitest",
    },
  });
}

function configuredAdapter(overrides: Partial<OAuthProviderAdapter> = {}): OAuthProviderAdapter {
  return {
    name: "MICROSOFT",
    isConfigured: async () => true,
    getAuthorizationUrl: async () => "https://login.microsoftonline.com/authorize",
    exchangeCodeForUser: async () => ({
      providerUserId: "provider-user-1",
      email: "user@example.com",
      name: "Test User",
      emailVerified: true,
    }),
    ...overrides,
  };
}

describe("handleOAuthCallback", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", APP_URL);
    vi.stubEnv("MICROSOFT_REDIRECT_URI", `${APP_URL}/api/auth/oauth/microsoft/callback`);
    vi.stubEnv("NODE_ENV", "production");

    mocks.cookieStore.get.mockReturnValue({
      value: encodeOAuthState({
        state: STATE,
        nonce: NONCE,
        codeVerifier: CODE_VERIFIER,
        next: null,
        createdAt: Date.now(),
      }),
    });
    mocks.cookieStore.set.mockReset();
    mocks.createSession.mockClear();
    mocks.prisma.oAuthAccount.findUnique.mockReset().mockResolvedValue({ userId: "user-1" });
    mocks.prisma.user.findUnique.mockReset().mockResolvedValue({ isSuperAdmin: false });
    mocks.prisma.membership.findFirst.mockReset().mockResolvedValue({ id: "membership-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates state/PKCE, exchanges the code, and creates a session", async () => {
    const exchangeCodeForUser = vi.fn(async () => ({
      providerUserId: "provider-user-1",
      email: "user@example.com",
      name: "Test User",
      emailVerified: true,
    }));
    const adapter = configuredAdapter({ exchangeCodeForUser });

    const response = await handleOAuthCallback(callbackRequest(), adapter);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${APP_URL}/keywords`);
    expect(exchangeCodeForUser).toHaveBeenCalledWith(
      "authorization-code",
      `${APP_URL}/api/auth/oauth/microsoft/callback`,
      { codeVerifier: CODE_VERIFIER, nonce: NONCE },
    );
    expect(mocks.createSession).toHaveBeenCalledWith(
      "user-1",
      { ipAddress: expect.any(String), userAgent: "vitest" },
      response,
      expect.any(NextRequest),
    );
    expect(response.cookies.get("rankly_session")?.value).toBe("test-session-token");
    // The one-time state cookie is consumed even on the success path.
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      COOKIE_NAME,
      "",
      expect.objectContaining({ maxAge: 0, httpOnly: true, secure: true }),
    );
  });

  it("rejects a mismatched state before exchanging the code", async () => {
    const exchangeCodeForUser = vi.fn();
    const adapter = configuredAdapter({ exchangeCodeForUser });

    const response = await handleOAuthCallback(
      callbackRequest(`state=${"z".repeat(64)}&code=authorization-code`),
      adapter,
    );

    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=oauth_state`);
    expect(exchangeCodeForUser).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("does not create a session when the provider exchange fails", async () => {
    const adapter = configuredAdapter({
      exchangeCodeForUser: async () => {
        throw new Error("provider refused");
      },
    });

    const response = await handleOAuthCallback(callbackRequest(), adapter);

    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=oauth_failed`);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("keeps SSO disabled cleanly when the adapter is not configured", async () => {
    const adapter = configuredAdapter({
      isConfigured: async () => false,
      exchangeCodeForUser: vi.fn(),
    });

    const response = await handleOAuthCallback(callbackRequest(), adapter);

    expect(response.headers.get("location")).toBe(
      `${APP_URL}/login?error=oauth_not_configured`,
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

describe("handleOAuthStart", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", APP_URL);
    vi.stubEnv("NODE_ENV", "production");
    mocks.cookieStore.set.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to the provider when the configured callback is valid", async () => {
    vi.stubEnv("MICROSOFT_REDIRECT_URI", `${APP_URL}/api/auth/callback/microsoft`);
    const getAuthorizationUrl = vi.fn(async () => "https://login.microsoftonline.com/authorize");

    const response = await handleOAuthStart(
      new NextRequest(`${APP_URL}/api/auth/oauth/microsoft/start`),
      configuredAdapter({ getAuthorizationUrl }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://login.microsoftonline.com/authorize");
    expect(getAuthorizationUrl).toHaveBeenCalledWith(
      expect.any(String),
      `${APP_URL}/api/auth/callback/microsoft`,
      expect.objectContaining({
        nonce: expect.any(String),
        codeChallenge: expect.any(String),
      }),
    );
    // State, nonce and the PKCE verifier are kept in an HttpOnly one-time cookie.
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 600,
      }),
    );
  });

  it("reports a configuration error instead of claiming SSO is disabled", async () => {
    vi.stubEnv("MICROSOFT_REDIRECT_URI", `${APP_URL}/api/auth/callback/azure`);

    const response = await handleOAuthStart(
      new NextRequest(`${APP_URL}/api/auth/oauth/microsoft/start`),
      configuredAdapter(),
    );

    expect(response.headers.get("location")).toBe(
      `${APP_URL}/login?error=oauth_configuration_error`,
    );
  });
});
