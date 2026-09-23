import { describe, it, expect } from "vitest";
import { BASE_URL, signUp, authedFetch, randomEmail } from "./helpers";

describe("auth (real server, real Postgres)", () => {
  it("health check reports the database is reachable", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("signup creates a real, usable session", async () => {
    const { cookie } = await signUp();
    const me = await authedFetch("/api/auth/me", cookie);
    const data = await me.json();
    expect(data.user).not.toBeNull();
    expect(data.tenant).not.toBeNull();
    expect(data.role).toBe("OWNER");
  });

  it("rejects a duplicate signup email without revealing that it exists", async () => {
    const { email } = await signUp();
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Someone Else", email, password: "another-password-123", companyName: "Other Co" }),
    });
    expect(res.status).toBe(400);
  });

  it("login succeeds with the correct password and fails with the wrong one", async () => {
    const { email, password } = await signUp();

    const good = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(good.status).toBe(200);

    const bad = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    expect(bad.status).toBe(401);
  });

  it("logout revokes the session so it can no longer be used", async () => {
    const { cookie } = await signUp();

    const beforeLogout = await authedFetch("/api/auth/me", cookie);
    expect((await beforeLogout.json()).user).not.toBeNull();

    await authedFetch("/api/auth/logout", cookie, { method: "POST" });

    const afterLogout = await authedFetch("/api/auth/me", cookie);
    expect((await afterLogout.json()).user).toBeNull();
  });

  it("protected dashboard routes redirect to /login without a session", async () => {
    const res = await fetch(`${BASE_URL}/keywords`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("forgot-password gives an identical response whether or not the email exists", async () => {
    const { email } = await signUp();

    const realEmail = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const fakeEmail = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: randomEmail("nobody") }),
    });

    expect(realEmail.status).toBe(fakeEmail.status);
    expect(await realEmail.json()).toEqual(await fakeEmail.json());
  });
});
