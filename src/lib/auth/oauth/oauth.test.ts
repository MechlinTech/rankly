import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import {
  createCodeChallenge,
  createCodeVerifier,
} from "./pkce";
import {
  decodeOAuthState,
  encodeOAuthState,
  safeEqual,
  safeReturnPath,
} from "./state";
import {
  normalizeMicrosoftTenantId,
  validateMicrosoftIdToken,
} from "./microsoft-oidc";
import { OAuthError } from "./errors";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signIdToken(claims: Record<string, unknown>, kid = "test-key"): string {
  const header = base64urlJson({ alg: "RS256", typ: "JWT", kid });
  const payload = base64urlJson(claims);
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`, "ascii"), privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

function stubMicrosoftFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(".well-known/openid-configuration")) {
        const tenant = url.split("/")[3];
        return new Response(
          JSON.stringify({
            issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
            jwks_uri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
            authorization_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
            token_endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ keys: [{ ...publicJwk, kid: "test-key", use: "sig", alg: "RS256" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PKCE", () => {
  it("matches the RFC 7636 S256 test vector", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(createCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates a URL-safe verifier of the required length", () => {
    const verifier = createCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("OAuth state cookie", () => {
  const payload = {
    state: "a".repeat(64),
    nonce: "b".repeat(43),
    codeVerifier: "c".repeat(43),
    next: "/keywords?tab=1",
    createdAt: Date.now(),
  };

  it("round-trips a valid payload", () => {
    expect(decodeOAuthState(encodeOAuthState(payload))).toEqual(payload);
  });

  it("rejects malformed or truncated cookie values", () => {
    expect(decodeOAuthState(undefined)).toBeNull();
    expect(decodeOAuthState("not-base64-json")).toBeNull();
    expect(decodeOAuthState(Buffer.from("{}").toString("base64url"))).toBeNull();
  });

  it("compares state values without accepting a prefix", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("safeReturnPath", () => {
  it("accepts same-origin absolute paths", () => {
    expect(safeReturnPath("/keywords")).toBe("/keywords");
    expect(safeReturnPath("/audit?project=1#top")).toBe("/audit?project=1#top");
  });

  it("rejects protocol-relative, backslash and control-character redirects", () => {
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("/\\evil.example")).toBeNull();
    expect(safeReturnPath("https://evil.example")).toBeNull();
    expect(safeReturnPath("/keywords\nLocation: https://evil.example")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});

describe("Microsoft tenant configuration", () => {
  it("defaults to common and accepts tenant ids/domains", () => {
    expect(normalizeMicrosoftTenantId(undefined)).toBe("common");
    expect(normalizeMicrosoftTenantId("organizations")).toBe("organizations");
    expect(normalizeMicrosoftTenantId("11111111-2222-3333-4444-555555555555")).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(normalizeMicrosoftTenantId("contoso.onmicrosoft.com")).toBe("contoso.onmicrosoft.com");
  });

  it("rejects values that could alter the Entra endpoint", () => {
    expect(() => normalizeMicrosoftTenantId("common/../evil")).toThrow(OAuthError);
    expect(() => normalizeMicrosoftTenantId("https://evil.example")).toThrow(OAuthError);
    expect(() => normalizeMicrosoftTenantId("evil.example/path")).toThrow(OAuthError);
  });
});

describe("Microsoft ID token validation", () => {
  const clientId = "11111111-1111-1111-1111-111111111111";

  function claimsFor(tenantId: string, overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      aud: clientId,
      exp: now + 300,
      nbf: now - 10,
      iat: now - 10,
      nonce: "expected-nonce",
      tid: tenantId,
      oid: "22222222-2222-2222-2222-222222222222",
      sub: "subject",
      azp: clientId,
      email: "user@example.com",
      email_verified: true,
      name: "Test User",
      ...overrides,
    };
  }

  it("accepts a correctly signed token with matching audience, nonce and issuer", async () => {
    stubMicrosoftFetch();
    const tenantId = randomUUID();
    const token = signIdToken(claimsFor(tenantId));

    const claims = await validateMicrosoftIdToken(token, {
      clientId,
      nonce: "expected-nonce",
      tenant: tenantId,
    });

    expect(claims.oid).toBe("22222222-2222-2222-2222-222222222222");
    expect(claims.tid).toBe(tenantId);
  });

  it("rejects a nonce that does not match the authorization request", async () => {
    stubMicrosoftFetch();
    const tenantId = randomUUID();
    const token = signIdToken(claimsFor(tenantId, { nonce: "attacker-nonce" }));

    await expect(
      validateMicrosoftIdToken(token, { clientId, nonce: "expected-nonce", tenant: tenantId }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a token issued for a different client/audience", async () => {
    stubMicrosoftFetch();
    const tenantId = randomUUID();
    const token = signIdToken(
      claimsFor(tenantId, { aud: "33333333-3333-3333-3333-333333333333" }),
    );

    await expect(
      validateMicrosoftIdToken(token, { clientId, nonce: "expected-nonce", tenant: tenantId }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects an expired token", async () => {
    stubMicrosoftFetch();
    const tenantId = randomUUID();
    const token = signIdToken(
      claimsFor(tenantId, { exp: Math.floor(Date.now() / 1000) - 3600 }),
    );

    await expect(
      validateMicrosoftIdToken(token, { clientId, nonce: "expected-nonce", tenant: tenantId }),
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("rejects an unexpected issuer", async () => {
    stubMicrosoftFetch();
    const tenantId = randomUUID();
    const token = signIdToken(
      claimsFor(tenantId, { iss: "https://login.microsoftonline.com/attacker/v2.0" }),
    );

    await expect(
      validateMicrosoftIdToken(token, { clientId, nonce: "expected-nonce", tenant: tenantId }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a token signed by an unpublished key", async () => {
    stubMicrosoftFetch();
    const tenantId = randomUUID();
    const token = signIdToken(claimsFor(tenantId), "unknown-kid");

    await expect(
      validateMicrosoftIdToken(token, { clientId, nonce: "expected-nonce", tenant: tenantId }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });
});
