import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateCustomEndpointUrl, isRestrictedHost, isPrivateIpv4 } from "./ssrf";
import { SsrfBlockedError } from "./errors";

describe("SSRF Protection & URL Validation", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("identifies private IPv4 addresses", () => {
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("172.16.5.10")).toBe(true);
    expect(isPrivateIpv4("172.31.255.255")).toBe(true);
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateIpv4("0.0.0.0")).toBe(true);

    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("1.1.1.1")).toBe(false);
    expect(isPrivateIpv4("104.244.42.1")).toBe(false);
  });

  it("identifies restricted hostnames and loopbacks", () => {
    expect(isRestrictedHost("localhost")).toBe(true);
    expect(isRestrictedHost("api.localhost")).toBe(true);
    expect(isRestrictedHost("localhost.localdomain")).toBe(true);
    expect(isRestrictedHost("metadata.google.internal")).toBe(true);
    expect(isRestrictedHost("instance-data")).toBe(true);
    expect(isRestrictedHost("::1")).toBe(true);
    expect(isRestrictedHost("0x7f000001")).toBe(true); // Hex IP
    expect(isRestrictedHost("2130706433")).toBe(true); // Decimal IP
    expect(isRestrictedHost("0177.0.0.1")).toBe(true); // Octal IP

    expect(isRestrictedHost("api.openai.com")).toBe(false);
    expect(isRestrictedHost("api.anthropic.com")).toBe(false);
    expect(isRestrictedHost("generativelanguage.googleapis.com")).toBe(false);
  });

  it("blocks private network and localhost endpoints in production", () => {
    expect(() => validateCustomEndpointUrl("https://localhost:8000/v1")).toThrow(SsrfBlockedError);
    expect(() => validateCustomEndpointUrl("https://127.0.0.1:11434/v1")).toThrow(SsrfBlockedError);
    expect(() => validateCustomEndpointUrl("https://192.168.1.50:8080/v1")).toThrow(SsrfBlockedError);
    expect(() => validateCustomEndpointUrl("https://10.0.1.20/v1")).toThrow(SsrfBlockedError);
    expect(() => validateCustomEndpointUrl("https://172.20.0.5/v1")).toThrow(SsrfBlockedError);
  });

  it("blocks cloud metadata access in all environments", () => {
    expect(() => validateCustomEndpointUrl("https://169.254.169.254/latest/meta-data")).toThrow(SsrfBlockedError);
    expect(() => validateCustomEndpointUrl("http://metadata.google.internal/computeMetadata/v1")).toThrow(SsrfBlockedError);

    vi.stubEnv("NODE_ENV", "development");
    expect(() => validateCustomEndpointUrl("http://169.254.169.254/latest/meta-data")).toThrow(SsrfBlockedError);
  });

  it("rejects URLs containing embedded credentials", () => {
    expect(() => validateCustomEndpointUrl("https://admin:secret@api.together.xyz/v1")).toThrow(
      "Custom endpoint URL must not contain embedded user credentials."
    );
  });

  it("requires HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateCustomEndpointUrl("http://api.together.xyz/v1")).toThrow(
      "HTTPS is required for custom AI provider endpoints in production."
    );
  });

  it("allows HTTP loopback in development / test environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    const url = validateCustomEndpointUrl("http://localhost:11434/v1");
    expect(url.hostname).toBe("localhost");
    expect(url.port).toBe("11434");
  });

  it("accepts valid public HTTPS endpoints in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const url = validateCustomEndpointUrl("https://api.together.xyz/v1");
    expect(url.hostname).toBe("api.together.xyz");
    expect(url.pathname).toBe("/v1");
  });
});
