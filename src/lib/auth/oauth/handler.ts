import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { createSession } from "@/lib/auth/session";
import { generateUniqueTenantSlug } from "@/lib/auth/tenant";
import type { OAuthProviderAdapter } from "./types";

const STATE_COOKIE_PREFIX = "rankly_oauth_state_";
const STATE_TTL_MS = 10 * 60 * 1000;

function redirectUriFor(req: NextRequest, provider: string): string {
  return new URL(`/api/auth/oauth/${provider}/callback`, req.nextUrl.origin).toString();
}

export async function handleOAuthStart(req: NextRequest, adapter: OAuthProviderAdapter) {
  if (!adapter.isConfigured()) {
    return NextResponse.json(
      { error: `${adapter.name} sign-in is not configured on this deployment yet.` },
      { status: 501 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = redirectUriFor(req, adapter.name.toLowerCase());
  const authUrl = adapter.getAuthorizationUrl(state, redirectUri);

  const cookieStore = await cookies();
  cookieStore.set(`${STATE_COOKIE_PREFIX}${adapter.name}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_MS / 1000,
  });

  return NextResponse.redirect(authUrl);
}

export async function handleOAuthCallback(req: NextRequest, adapter: OAuthProviderAdapter) {
  if (!adapter.isConfigured()) {
    return NextResponse.json(
      { error: `${adapter.name} sign-in is not configured on this deployment yet.` },
      { status: 501 }
    );
  }

  const cookieStore = await cookies();
  const stateCookieName = `${STATE_COOKIE_PREFIX}${adapter.name}`;
  const expectedState = cookieStore.get(stateCookieName)?.value;
  cookieStore.delete(stateCookieName);

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", req.nextUrl.origin));
  }

  let userInfo;
  try {
    const redirectUri = redirectUriFor(req, adapter.name.toLowerCase());
    userInfo = await adapter.exchangeCodeForUser(code, redirectUri);
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.nextUrl.origin));
  }

  const existingOAuthAccount = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: adapter.name, providerUserId: userInfo.providerUserId } },
    include: { user: true },
  });

  let userId: string;

  if (existingOAuthAccount) {
    userId = existingOAuthAccount.userId;
  } else {
    const existingUserByEmail = await prisma.user.findUnique({ where: { email: userInfo.email } });

    if (existingUserByEmail) {
      await prisma.oAuthAccount.create({
        data: { userId: existingUserByEmail.id, provider: adapter.name, providerUserId: userInfo.providerUserId },
      });
      userId = existingUserByEmail.id;
    } else {
      const slug = await generateUniqueTenantSlug(userInfo.name ?? userInfo.email.split("@")[0]);
      userId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            email: userInfo.email,
            name: userInfo.name,
            emailVerified: new Date(), // OAuth providers verify email ownership for us
          },
        });
        await tx.oAuthAccount.create({
          data: { userId: user.id, provider: adapter.name, providerUserId: userInfo.providerUserId },
        });
        const tenant = await tx.tenant.create({
          data: { name: userInfo.name ?? userInfo.email, slug, status: "TRIALING" },
        });
        await tx.membership.create({
          data: { tenantId: tenant.id, userId: user.id, role: "OWNER" },
        });
        await tx.auditLog.create({
          data: { tenantId: tenant.id, actorId: user.id, action: "tenant.created", target: tenant.id },
        });
        return user.id;
      });
    }
  }

  const res = NextResponse.redirect(new URL("/keywords", req.nextUrl.origin));
  await createSession(
    userId,
    {
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    },
    res,
    req,
  );
  return res;
}
