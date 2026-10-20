import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "./constants";
import { getCurrentUser } from "./session";
import { getActiveMembershipForUser } from "./tenant";

export type AuthenticatedDestination = "/admin" | "/keywords";

export type SessionRestoreState =
  | { status: "anonymous"; hadSessionCookie: boolean }
  | { status: "authenticated"; destination: AuthenticatedDestination }
  | { status: "no-workspace" };

/**
 * Resolves the session on a server request so public pages never render before
 * we know whether the browser already has a signed-in user.
 *
 * There is no separate refresh-token flow in this app: sessions are DB-backed
 * and last until their cookie/row expiry. A cookie that no longer resolves to
 * an active session is treated as expired and sent to the login page.
 */
export async function getSessionRestoreState(): Promise<SessionRestoreState> {
  const cookieStore = await cookies();
  const hadSessionCookie = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  const user = await getCurrentUser();
  if (!user) {
    return { status: "anonymous", hadSessionCookie };
  }

  if (user.isSuperAdmin) {
    return { status: "authenticated", destination: "/admin" };
  }

  const membership = await getActiveMembershipForUser(user.id);
  if (!membership) {
    return { status: "no-workspace" };
  }

  return { status: "authenticated", destination: "/keywords" };
}
