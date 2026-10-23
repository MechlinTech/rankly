import { describe, expect, it } from "vitest";
import { loginErrorFor, oauthErrorCodeFromProvider } from "./errors";

describe("OAuth provider error mapping", () => {
  it("treats cancellation as a normal user cancellation", () => {
    expect(oauthErrorCodeFromProvider("access_denied")).toBe("cancelled");
    expect(loginErrorFor("cancelled")).toBe("oauth_cancelled");
  });

  it("distinguishes a missing integration from a broken callback configuration", () => {
    expect(oauthErrorCodeFromProvider("unauthorized_client")).toBe("not_configured");
    expect(loginErrorFor("not_configured")).toBe("oauth_not_configured");

    expect(oauthErrorCodeFromProvider("redirect_uri_mismatch")).toBe("configuration_error");
    expect(oauthErrorCodeFromProvider("invalid_request")).toBe("configuration_error");
    expect(loginErrorFor("configuration_error")).toBe("oauth_configuration_error");
  });

  it("maps transient provider failures to a retryable message", () => {
    expect(oauthErrorCodeFromProvider("temporarily_unavailable")).toBe("provider_unavailable");
    expect(loginErrorFor("provider_unavailable")).toBe("oauth_unavailable");
  });
});
