import { randomBytes, createHash } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "./constants";

export { SESSION_COOKIE_NAME };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function isSecureCookie(req?: NextRequest): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (req && req.nextUrl.protocol === "http:") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Creates a session row and sets the session cookie on the response.
 * The raw token is only ever held by the client; the DB stores a hash of it,
 * so a database read alone can never be used to impersonate a session.
 *
 * Pass the outgoing `NextResponse` so Set-Cookie is attached to the body
 * that actually gets returned (a later `NextResponse.json()` would drop it).
 */
export async function createSession(
  userId: string,
  meta: SessionMetadata = {},
  response?: NextResponse,
  req?: NextRequest,
): Promise<void> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  const options = {
    httpOnly: true,
    secure: isSecureCookie(req),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };

  if (response) {
    response.cookies.set(SESSION_COOKIE_NAME, token, options);
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, options);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }
  return session;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
