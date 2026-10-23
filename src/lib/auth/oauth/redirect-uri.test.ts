import { describe, expect, it } from "vitest";
import {
  legacyCallbackPath,
  oauthCallbackPath,
  resolveOAuthRedirectUri,
} from "./redirect-uri";

const APP_URL = "https://rankly.example.com";

function expectConfigurationError(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code: "configuration_error" });
    return;
  }
  throw new Error("Expected resolveOAuthRedirectUri to reject the configuration");
}

describe("OAuth callback path", () => {
  it("uses the canonical /api/auth/oauth/<provider>/callback route", () => {
    expect(oauthCallbackPath("google")).toBe("/api/auth/oauth/google/callback");
    expect(oauthCallbackPath("microsoft")).toBe("/api/auth/oauth/microsoft/callback");
    expect(legacyCallbackPath("microsoft")).toBe("/api/auth/callback/microsoft");
  });
});

describe("resolveOAuthRedirectUri", () => {
  it("derives the callback from APP_URL", () => {
    expect(
      resolveOAuthRedirectUri({
        provider: "microsoft",
        appUrl: `${APP_URL}/`,
        nodeEnv: "production",
      }),
    ).toBe(`${APP_URL}/api/auth/oauth/microsoft/callback`);
  });

  it("accepts an explicit canonical override", () => {
    expect(
      resolveOAuthRedirectUri({
        provider: "google",
        appUrl: APP_URL,
        override: `${APP_URL}/api/auth/oauth/google/callback`,
        nodeEnv: "production",
      }),
    ).toBe(`${APP_URL}/api/auth/oauth/google/callback`);
  });

  it("accepts the legacy alias path used by older app registrations", () => {
    expect(
      resolveOAuthRedirectUri({
        provider: "microsoft",
        appUrl: APP_URL,
        override: `${APP_URL}/api/auth/callback/microsoft`,
        nodeEnv: "production",
      }),
    ).toBe(`${APP_URL}/api/auth/callback/microsoft`);
  });

  it("rejects an override that points at a route the app does not serve", () => {
    expectConfigurationError(() =>
      resolveOAuthRedirectUri({
        provider: "microsoft",
        appUrl: APP_URL,
        // This is the class of misconfiguration that produced the reported
        // "not configured" error: a callback path with no matching route.
        override: `${APP_URL}/api/auth/callback/azure`,
        nodeEnv: "production",
      }),
    );
  });

  it("rejects callback URLs with a query string, hash, or credentials", () => {
    for (const override of [
      `${APP_URL}/api/auth/oauth/microsoft/callback?tenant=common`,
      `${APP_URL}/api/auth/oauth/microsoft/callback#fragment`,
      `https://user:pass@rankly.example.com/api/auth/oauth/microsoft/callback`,
    ]) {
      expectConfigurationError(() =>
        resolveOAuthRedirectUri({ provider: "microsoft", override, nodeEnv: "production" }),
      );
    }
  });

  it("requires HTTPS outside local development", () => {
    expectConfigurationError(() =>
      resolveOAuthRedirectUri({
        provider: "microsoft",
        override: "http://rankly.example.com/api/auth/oauth/microsoft/callback",
        nodeEnv: "production",
      }),
    );

    expect(
      resolveOAuthRedirectUri({
        provider: "microsoft",
        override: "http://localhost:3000/api/auth/oauth/microsoft/callback",
        nodeEnv: "development",
      }),
    ).toBe("http://localhost:3000/api/auth/oauth/microsoft/callback");
  });

  it("falls back to the request origin only in non-production", () => {
    expect(
      resolveOAuthRedirectUri({
        provider: "google",
        nodeEnv: "development",
        requestOrigin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000/api/auth/oauth/google/callback");

    expectConfigurationError(() =>
      resolveOAuthRedirectUri({
        provider: "google",
        nodeEnv: "production",
        requestOrigin: "https://rankly.example.com",
      }),
    );
  });

  it("fails closed when APP_URL is malformed", () => {
    expectConfigurationError(() =>
      resolveOAuthRedirectUri({
        provider: "google",
        appUrl: "not a url",
        nodeEnv: "production",
      }),
    );
  });
});
