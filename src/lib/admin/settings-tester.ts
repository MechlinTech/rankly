export interface TestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  details?: Record<string, unknown>;
}

/**
 * Mask secret keys for safe UI display (e.g. "osk_live_••••••••UTOF4" or "re_8Q••••••••NU4R").
 */
export function maskApiKey(key: string | undefined | null): string | null {
  if (!key || typeof key !== "string" || key.trim().length === 0) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  const prefixLen = trimmed.startsWith("osk_live_") ? 9 : trimmed.startsWith("re_") ? 5 : 4;
  const suffixLen = 4;
  const prefix = trimmed.slice(0, prefixLen);
  const suffix = trimmed.slice(-suffixLen);
  return `${prefix}••••••••${suffix}`;
}

export async function testOpenSerp(key: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const isStandardSerpApi = !key.startsWith("osk_") && key.length === 64;
    const testUrl = isStandardSerpApi
      ? `https://serpapi.com/account?api_key=${encodeURIComponent(key)}`
      : "https://api.openserp.org/v1/me";

    const res = await fetch(testUrl, {
      method: "GET",
      headers: isStandardSerpApi ? {} : { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (isStandardSerpApi) {
        return {
          success: true,
          message: `SerpApi connected successfully (${data.account_email ?? "Active"}).`,
          latencyMs,
          details: { plan: data.plan_name, searchesRemaining: data.total_searches_left },
        };
      }
      return {
        success: true,
        message: `OpenSERP connected successfully for ${data.email ?? "Active user"}.`,
        latencyMs,
        details: { email: data.email, tags: data.tags, id: data.id },
      };
    }

    const errData = await res.json().catch(() => ({}));
    const message = errData.message || errData.error || `HTTP ${res.status} ${res.statusText}`;
    return {
      success: false,
      message: `OpenSERP authentication failed: ${message}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection failed or timed out.",
      latencyMs: Date.now() - start,
    };
  }
}

export async function testResend(key: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.resend.com/api-keys", {
      method: "GET",
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const count = Array.isArray(data.data) ? data.data.length : 0;
      return {
        success: true,
        message: `Resend connected successfully (${count} active key${count === 1 ? "" : "s"} found).`,
        latencyMs,
        details: { keyCount: count },
      };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      message: `Resend error: ${errData.message || `HTTP ${res.status}`}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection timed out.",
      latencyMs: Date.now() - start,
    };
  }
}

export async function testAnthropic(key: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": key.trim(),
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const modelCount = Array.isArray(data.data) ? data.data.length : 0;
      return {
        success: true,
        message: `Anthropic Claude API connected (${modelCount} model${modelCount === 1 ? "" : "s"} available).`,
        latencyMs,
        details: { models: data.data?.slice(0, 3).map((m: { id: string }) => m.id) },
      };
    }

    const errData = await res.json().catch(() => ({}));
    const msg = errData.error?.message || `HTTP ${res.status}`;
    return {
      success: false,
      message: `Anthropic error: ${msg}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection failed.",
      latencyMs: Date.now() - start,
    };
  }
}

export async function testStripe(key: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const mode = data.livemode ? "Live Production" : "Test Sandbox";
      return {
        success: true,
        message: `Stripe connected successfully (${mode}).`,
        latencyMs,
        details: { livemode: data.livemode },
      };
    }

    const errData = await res.json().catch(() => ({}));
    const msg = errData.error?.message || `HTTP ${res.status}`;
    return {
      success: false,
      message: `Stripe error: ${msg}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection failed.",
      latencyMs: Date.now() - start,
    };
  }
}

export async function testDataForSeo(login: string, password: string): Promise<TestResult> {
  const start = Date.now();
  try {
    if (!login.trim() || !password.trim()) {
      return {
        success: false,
        message: "Enter both the DataForSEO API login and password.",
        latencyMs: Date.now() - start,
      };
    }
    const authHeader = `Basic ${Buffer.from(`${login.trim()}:${password.trim()}`).toString("base64")}`;

    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      method: "GET",
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    const data = await res.json().catch(() => ({}));
    const task = data.tasks?.[0];
    if (res.ok && data.status_code === 20000 && task?.status_code === 20000) {
      const resultObj = task.result?.[0];
      const balance = resultObj?.money?.balance;
      return {
        success: true,
        message: `DataForSEO connected. Account: ${resultObj?.login ?? login}${typeof balance === "number" ? `, Balance: $${balance.toFixed(2)}` : ""}`,
        latencyMs,
        details: { ...(typeof balance === "number" ? { balance } : {}) },
      };
    }

    return {
      success: false,
      message: `DataForSEO error: ${task?.status_message || data.status_message || `HTTP ${res.status} ${res.statusText}`}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection failed.",
      latencyMs: Date.now() - start,
    };
  }
}

export async function testGoogleOAuth(clientId: string): Promise<TestResult> {
  const start = Date.now();
  try {
    if (!clientId.includes(".apps.googleusercontent.com")) {
      return {
        success: false,
        message: "Invalid Client ID: Google Client IDs typically end with .apps.googleusercontent.com",
        latencyMs: Date.now() - start,
      };
    }

    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        success: true,
        message: "Google OpenID endpoint reachable and client ID format valid.",
        latencyMs,
      };
    }

    return {
      success: false,
      message: `Google OpenID check failed: HTTP ${res.status}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection failed.",
      latencyMs: Date.now() - start,
    };
  }
}

export async function testMicrosoftOAuth(clientId: string, tenantId?: string | null): Promise<TestResult> {
  const start = Date.now();
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(clientId.trim())) {
      return {
        success: false,
        message: "Invalid Client ID: Microsoft Application Client IDs must be a valid UUID format.",
        latencyMs: Date.now() - start,
      };
    }

    const tenant = tenantId?.trim() || "common";
    if (!/^(common|organizations|consumers|[0-9a-f-]{36}|[a-z0-9.-]+)$/i.test(tenant)) {
      return {
        success: false,
        message: "Invalid Microsoft tenant ID. Use common, organizations, consumers, a tenant GUID, or a verified domain.",
        latencyMs: Date.now() - start,
      };
    }

    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(8000) },
    );

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        success: true,
        message: "Microsoft Entra ID endpoint reachable and client ID UUID valid.",
        latencyMs,
      };
    }

    return {
      success: false,
      message: `Microsoft OpenID check failed: HTTP ${res.status}`,
      latencyMs,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection failed.",
      latencyMs: Date.now() - start,
    };
  }
}
