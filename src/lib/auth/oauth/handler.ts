import { getAppUrl } from "@/lib/app-url";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { createSession, isSecureCookie } from "@/lib/auth/session";
import { generateUniqueTenantSlug } from "@/lib/auth/tenant";
import { getClientIp, isRateLimited } from "@/lib/auth/rate-limit";
import type { OAuthProviderAdapter, OAuthUserInfo } from "./types";
import { OAuthError, loginErrorFor, oauthErrorCodeFromProvider } from "./errors";
import {
  OAUTH_STATE_TTL_MS,
  decodeOAuthState,
  encodeOAuthState,
  safeEqual,
  safeReturnPath,
} from "./state";
import { createCodeChallenge, createCodeVerifier } from "./pkce";
import { resolveOAuthRedirectUri, type OAuthProviderSlug } from "./redirect-uri";

const STATE_COOKIE_PREFIX = "rankly_oauth_state_";
const OAUTH_START_LIMIT = 30;
const OAUTH_CALLBACK_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function providerSlug(adapter: OAuthProviderAdapter): OAuthProviderSlug {
  return adapter.name === "GOOGLE" ? "google" : "microsoft";
}

/**
 * Resolves a stable callback URL. Prefer an explicit provider redirect URI,
 * then the canonical APP_URL, and only fall back to the request host in local
 * development. The value must be byte-identical between start and callback.
 */
function redirectUriFor(req: NextRequest, provider: OAuthProviderSlug): string {
  return resolveOAuthRedirectUri({
    provider,
    appUrl: process.env.APP_URL,
    override: process.env[`${provider.toUpperCase()}_REDIRECT_URI`],
    nodeEnv: process.env.NODE_ENV,
    requestOrigin: process.env.APP_URL?.trim() ? null : getAppUrl(req),
  });
}

function loginUrl(req: NextRequest, error: string, next: string | null = null): URL {
  let base = req.nextUrl.origin;
  try {
    base = getAppUrl(req);
  } catch {
    // Keep the error redirect on the request origin if APP_URL is malformed.
  }

  let url: URL;
  try {
    url = new URL("/login", base);
  } catch {
    url = new URL("/login", req.nextUrl.origin);
  }
  url.searchParams.set("error", error);
  if (next) url.searchParams.set("next", next);
  return url;
}

function stateCookieName(provider: string, secure: boolean): string {
  const base = `${STATE_COOKIE_PREFIX}${provider}`;
  // __Host- prevents a sibling subdomain from injecting a state cookie.
  return secure ? `__Host-${base}` : base;
}

function logOAuthFailure(adapter: OAuthProviderAdapter, error: unknown): void {
  if (error instanceof OAuthError) {
    console.warn("[oauth] Sign-in failed", {
      provider: adapter.name,
      code: error.code,
      detail: error.detail,
    });
    return;
  }
  console.error("[oauth] Unexpected sign-in failure", {
    provider: adapter.name,
    name: error instanceof Error ? error.name : "UnknownError",
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002")
  );
}

async function linkExistingUser(
  adapter: OAuthProviderAdapter,
  user: { id: string; emailVerified: Date | null; name: string | null },
  userInfo: OAuthUserInfo,
): Promise<void> {
  if (!userInfo.emailVerified) {
    throw new OAuthError("email_unverified", "Provider did not verify the email address");
  }

  await prisma.$transaction(async (tx) => {
    await tx.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: adapter.name,
        providerUserId: userInfo.providerUserId,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        // A verified provider sign-in proves control of the address.
        emailVerified: user.emailVerified ?? new Date(),
        name: user.name ?? userInfo.name,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "auth.oauth_account_linked",
        target: adapter.name,
        metadata: { provider: adapter.name },
      },
    });
  });
}

async function createOAuthUser(
  adapter: OAuthProviderAdapter,
  userInfo: OAuthUserInfo,
): Promise<string> {
  if (!userInfo.emailVerified) {
    throw new OAuthError("email_unverified", "Provider did not verify the email address");
  }

  const slug = await generateUniqueTenantSlug(userInfo.name ?? userInfo.email.split("@")[0]);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: userInfo.email,
        name: userInfo.name,
        emailVerified: new Date(),
      },
    });
    await tx.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: adapter.name,
        providerUserId: userInfo.providerUserId,
      },
    });
    const tenant = await tx.tenant.create({
      data: {
        name: userInfo.name ?? userInfo.email,
        slug,
        status: "TRIALING",
      },
    });
    await tx.membership.create({
      data: { tenantId: tenant.id, userId: user.id, role: "OWNER" },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: user.id,
        action: "tenant.created",
        target: tenant.id,
      },
    });
    return user.id;
  });
}

/**
 * Resolves an OAuth identity to a Rankly user:
 *  - an existing provider link always wins;
 *  - otherwise a verified provider email is linked to the matching account;
 *  - otherwise a new user + trial workspace is created atomically.
 * A unique-constraint race (two tabs/callbacks at once) is retried once
 * against the now-existing row instead of producing a duplicate account.
 */
async function resolveOAuthUser(
  adapter: OAuthProviderAdapter,
  userInfo: OAuthUserInfo,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const linked = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: adapter.name,
          providerUserId: userInfo.providerUserId,
        },
      },
      select: { userId: true },
    });
    if (linked) return linked.userId;

    const existingUser = await prisma.user.findUnique({
      where: { email: userInfo.email },
      select: { id: true, emailVerified: true, name: true },
    });
    if (existingUser) {
      try {
        await linkExistingUser(adapter, existingUser, userInfo);
        return existingUser.id;
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }

    try {
      return await createOAuthUser(adapter, userInfo);
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new OAuthError("account_conflict", "Could not resolve or create the OAuth account");
}

function destinationFor(isSuperAdmin: boolean, next: string | null): string {
  if (isSuperAdmin) {
    return next && (next === "/admin" || next.startsWith("/admin/")) ? next : "/admin";
  }
  const isAdminRoute = next === "/admin" || next?.startsWith("/admin/");
  return next && !isAdminRoute ? next : "/keywords";
}

export async function handleOAuthStart(req: NextRequest, adapter: OAuthProviderAdapter) {
  const ip = getClientIp(req);
  if (isRateLimited(`oauth-start:${adapter.name}:${ip}`, OAUTH_START_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.redirect(loginUrl(req, "oauth_rate_limited"), 303);
  }

  try {
    if (!(await adapter.isConfigured())) {
      return NextResponse.redirect(loginUrl(req, "oauth_not_configured"), 303);
    }

    const state = randomBytes(32).toString("hex");
    const nonce = randomBytes(32).toString("base64url");
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const next = safeReturnPath(req.nextUrl.searchParams.get("next"));
    const redirectUri = redirectUriFor(req, providerSlug(adapter));

    const authUrl = await adapter.getAuthorizationUrl(state, redirectUri, {
      nonce,
      codeChallenge,
    });

    const secure = isSecureCookie(req);
    const cookieStore = await cookies();
    cookieStore.set(
      stateCookieName(adapter.name, secure),
      encodeOAuthState({
        state,
        nonce,
        codeVerifier,
        next,
        createdAt: Date.now(),
      }),
      {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: OAUTH_STATE_TTL_MS / 1000,
        priority: "high",
      },
    );

    return NextResponse.redirect(authUrl);
  } catch (error) {
    logOAuthFailure(adapter, error);
    const code = error instanceof OAuthError ? loginErrorFor(error.code) : "oauth_server_error";
    return NextResponse.redirect(loginUrl(req, code), 303);
  }
}

export async function handleOAuthCallback(req: NextRequest, adapter: OAuthProviderAdapter) {
  const ip = getClientIp(req);
  if (isRateLimited(`oauth-callback:${adapter.name}:${ip}`, OAUTH_CALLBACK_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.redirect(loginUrl(req, "oauth_rate_limited"), 303);
  }

  const secure = isSecureCookie(req);
  const cookieName = stateCookieName(adapter.name, secure);
  const cookieStore = await cookies();
  const rawState = cookieStore.get(cookieName)?.value;
  // Always consume the one-time cookie, including on cancellation/error paths.
  // Re-set it with the original attributes (rather than delete()) so a __Host-
  // cookie is also removed correctly by browsers.
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const statePayload = decodeOAuthState(rawState);
  const next = statePayload?.next ?? null;
  const url = req.nextUrl;

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const code = oauthErrorCodeFromProvider(providerError);
    // Expected cancellations are not server errors and carry no sensitive data.
    if (code !== "cancelled") {
      console.warn("[oauth] Provider returned an authorization error", {
        provider: adapter.name,
        error: providerError,
      });
    }
    return NextResponse.redirect(loginUrl(req, loginErrorFor(code), next), 303);
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code || !returnedState || !statePayload) {
    return NextResponse.redirect(loginUrl(req, "oauth_state", next), 303);
  }
  if (
    !Number.isFinite(statePayload.createdAt) ||
    Date.now() - statePayload.createdAt > OAUTH_STATE_TTL_MS ||
    statePayload.createdAt > Date.now() + 60_000
  ) {
    return NextResponse.redirect(loginUrl(req, "oauth_expired", next), 303);
  }
  if (!safeEqual(returnedState, statePayload.state)) {
    return NextResponse.redirect(loginUrl(req, "oauth_state", next), 303);
  }

  let userInfo: OAuthUserInfo;
  try {
    if (!(await adapter.isConfigured())) {
      return NextResponse.redirect(loginUrl(req, "oauth_not_configured", next), 303);
    }
    userInfo = await adapter.exchangeCodeForUser(code, redirectUriFor(req, providerSlug(adapter)), {
      codeVerifier: statePayload.codeVerifier,
      nonce: statePayload.nonce,
    });
  } catch (error) {
    logOAuthFailure(adapter, error);
    const errorCode = error instanceof OAuthError ? loginErrorFor(error.code) : "oauth_failed";
    return NextResponse.redirect(loginUrl(req, errorCode, next), 303);
  }

  try {
    const userId = await resolveOAuthUser(adapter, userInfo);
    const [targetUser, membership] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true },
      }),
      prisma.membership.findFirst({
        where: { userId, isActive: true },
        select: { id: true },
      }),
    ]);

    if (!targetUser) {
      return NextResponse.redirect(loginUrl(req, "oauth_failed", next), 303);
    }
    if (!targetUser.isSuperAdmin && !membership) {
      return NextResponse.redirect(loginUrl(req, "no_workspace", next), 303);
    }

    const destination = destinationFor(targetUser.isSuperAdmin, next);
    const response = NextResponse.redirect(new URL(destination, getAppUrl(req)));
    await createSession(
      userId,
      {
        ipAddress: ip,
        userAgent: req.headers.get("user-agent"),
      },
      response,
      req,
    );
    return response;
  } catch (error) {
    logOAuthFailure(adapter, error);
    const code = error instanceof OAuthError ? loginErrorFor(error.code) : "oauth_server_error";
    return NextResponse.redirect(loginUrl(req, code, next), 303);
  }
}
