import { BASE_URL } from "./config";

export { BASE_URL };

export function randomEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@integration-test.local`;
}

function extractSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/rankly_session=[^;]+/);
  return match ? match[0] : null;
}

export interface SignedUpUser {
  email: string;
  password: string;
  cookie: string;
}

export async function signUp(overrides: Partial<{ name: string; companyName: string; password: string }> = {}): Promise<SignedUpUser> {
  const email = randomEmail("user");
  const password = overrides.password ?? "integration-test-password-123";
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: overrides.name ?? "Integration Test User",
      email,
      password,
      companyName: overrides.companyName ?? `Integration Test Co ${Date.now()}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Signup failed: ${res.status} ${await res.text()}`);
  }
  const cookie = extractSessionCookie(res);
  if (!cookie) throw new Error("Signup did not set a session cookie.");
  return { email, password, cookie };
}

export async function authedFetch(path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });
}
