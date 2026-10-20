import { afterAll, describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { BASE_URL, signUp, authedFetch, randomEmail } from "./helpers";

const PASSWORD_WHITESPACE_MESSAGE = "Password must not contain spaces.";

afterAll(async () => {
  await prisma.$disconnect();
});

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

  it("rejects a duplicate signup email with a clear duplicate-email error", async () => {
    const { email } = await signUp();
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Someone Else", email, password: "another-password-123", companyName: "Other Co" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data?.error?.formErrors).toContain(
      "An account with this email address already exists. Please log in or use a different email address."
    );
  });

  it("rejects a duplicate signup email regardless of case or whitespace", async () => {
    const { email } = await signUp();
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Someone Else",
        email: `  ${email.toUpperCase()}  `,
        password: "another-password-123",
        companyName: "Other Co",
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data?.error?.formErrors).toContain(
      "An account with this email address already exists. Please log in or use a different email address."
    );
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

  it("rejects any password containing whitespace during signup", async () => {
    for (const password of [" password12", "password12 ", "pass word1", "pass\tword1", "          "]) {
      const res = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Whitespace User",
          email: randomEmail("whitespace"),
          password,
          companyName: "Whitespace Co",
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(JSON.stringify(data.error)).toContain(PASSWORD_WHITESPACE_MESSAGE);
    }

    const email = randomEmail("valid-password");
    const signup = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Valid Password User",
        email,
        password: "valid-password-123",
        companyName: "Valid Password Co",
      }),
    });
    expect(signup.status).toBe(200);

    const login = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "valid-password-123" }),
    });
    expect(login.status).toBe(200);
  });

  it("rejects whitespace when resetting a password and accepts a valid replacement", async () => {
    const { email, password } = await signUp();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const token = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    for (const invalidPassword of [
      " new-password-123",
      "new-password-123 ",
      "new password 123",
      "new\tpassword 123",
    ]) {
      const res = await fetch(`${BASE_URL}/api/auth/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: invalidPassword }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe(PASSWORD_WHITESPACE_MESSAGE);
    }

    const reset = await fetch(`${BASE_URL}/api/auth/reset-password/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "new-password-123" }),
    });
    expect(reset.status).toBe(200);

    const oldLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "new-password-123" }),
    });
    expect(newLogin.status).toBe(200);
  });

  it("rejects whitespace when accepting an invite and creates the account with a valid password", async () => {
    const owner = await signUp();
    const ownerMe = await (await authedFetch("/api/auth/me", owner.cookie)).json();
    const inviteeEmail = randomEmail("invitee");
    const token = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await prisma.invitation.create({
      data: {
        tenantId: ownerMe.tenant.id,
        email: inviteeEmail,
        role: "MEMBER",
        token,
        invitedBy: ownerMe.user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    for (const invalidPassword of [
      " member-password-123",
      "member-password-123 ",
      "member password 123",
      "member\tpassword 123",
    ]) {
      const res = await fetch(`${BASE_URL}/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Invited Member", password: invalidPassword }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe(PASSWORD_WHITESPACE_MESSAGE);
    }

    const accept = await fetch(`${BASE_URL}/api/invite/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Invited Member", password: "member-password-123" }),
    });
    expect(accept.status).toBe(200);

    const login = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteeEmail, password: "member-password-123" }),
    });
    expect(login.status).toBe(200);
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
