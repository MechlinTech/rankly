import { afterEach, describe, expect, it } from "vitest";
import { getAppUrl, type AppUrlRequest } from "./app-url";

const ORIGINAL_APP_URL = process.env.APP_URL;

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

function request(origin: string, headers: Record<string, string> = {}): AppUrlRequest {
  const url = new URL(origin);
  return {
    headers: new Headers(headers),
    nextUrl: { protocol: url.protocol, host: url.host, origin: url.origin },
  };
}

describe("getAppUrl", () => {
  it("uses APP_URL without a request context and strips trailing slashes", () => {
    process.env.APP_URL = "https://rankly.mechlintech.com/";
    expect(getAppUrl()).toBe("https://rankly.mechlintech.com");
  });

  it("uses the request origin when APP_URL is unset", () => {
    delete process.env.APP_URL;
    expect(getAppUrl(request("http://localhost:3000/login"))).toBe("http://localhost:3000");
  });

  it("uses the public host actually used to send a verification email", () => {
    process.env.APP_URL = "https://ranklydev.mechlintech.com";
    const req = request("https://rankly.mechlintech.com/api/auth/verify-email/resend");
    expect(getAppUrl(req)).toBe("https://rankly.mechlintech.com");
  });

  it("uses x-forwarded-host when a reverse proxy forwards an internal address", () => {
    process.env.APP_URL = "https://ranklydev.mechlintech.com";
    const req = request("http://0.0.0.0:3000/api/auth/verify-email/resend", {
      "x-forwarded-host": "rankly.mechlintech.com",
      "x-forwarded-proto": "https",
    });
    expect(getAppUrl(req)).toBe("https://rankly.mechlintech.com");
  });

  it("keeps APP_URL rather than leaking an internal bind address", () => {
    process.env.APP_URL = "https://rankly.mechlintech.com";
    expect(getAppUrl(request("http://0.0.0.0:3000/login"))).toBe("https://rankly.mechlintech.com");
  });

  it("does not trust a Host header from an unrelated site", () => {
    process.env.APP_URL = "https://rankly.mechlintech.com";
    expect(getAppUrl(request("https://evil.example.net/api/auth/verify-email/resend"))).toBe(
      "https://rankly.mechlintech.com",
    );
  });

  it("does not confuse unrelated sites under a multi-part suffix", () => {
    process.env.APP_URL = "https://app.example.co.uk";
    expect(getAppUrl(request("https://evil.co.uk/login"))).toBe("https://app.example.co.uk");
  });

  it("allows a sibling public host when APP_URL is stale", () => {
    process.env.APP_URL = "https://ranklydev.mechlintech.com";
    expect(getAppUrl(request("https://www.rankly.mechlintech.com/login"))).toBe(
      "https://www.rankly.mechlintech.com",
    );
  });

  it("keeps the configured https scheme when the proxy request is http", () => {
    process.env.APP_URL = "https://ranklydev.mechlintech.com";
    const req = request("http://rankly.mechlintech.com/login", {
      "x-forwarded-host": "rankly.mechlintech.com",
    });
    expect(getAppUrl(req)).toBe("https://rankly.mechlintech.com");
  });
});
