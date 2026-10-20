"use client";

import { useEffect } from "react";

const SESSION_CHECK_INTERVAL_MS = 60 * 1000;

function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname === "/login") return;

  const next = `${pathname}${search}`;
  // replace() (rather than push) also removes the protected page from history,
  // so pressing Back cannot reveal it again from the browser's bfcache.
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Client-side session guard for authenticated surfaces.
 *
 * The server layouts already validate the session on every render. This guard
 * closes the remaining gaps that server rendering cannot see:
 * - Chrome restoring a tab from the back/forward cache (bfcache) after the
 *   session expired or was revoked, which skips a network request entirely.
 * - A tab left open past the session's expiry.
 *
 * It deliberately does nothing when the check cannot reach the network: a
 * transient outage should not log the user out.
 */
export function SessionGuard() {
  useEffect(() => {
    let active = true;
    let checking = false;
    let queued = false;

    async function verifySession() {
      // If a check is already in flight (e.g. the initial mount check) and an
      // event arrives, queue exactly one follow-up instead of dropping it. The
      // in-flight response may have been produced before the session ended.
      if (checking) {
        queued = true;
        return;
      }
      checking = true;
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!active) return;

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) redirectToLogin();
          return;
        }

        const data = await res.json().catch(() => null);
        if (active && !data?.user) redirectToLogin();
      } catch {
        // Network failure: leave the current page alone and retry on the next
        // visibility change or interval tick.
      } finally {
        checking = false;
        if (queued && active) {
          queued = false;
          void verifySession();
        }
      }
    }

    // Runs on the first mount and whenever the tab is restored from bfcache.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void verifySession();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void verifySession();
    }

    void verifySession();
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = window.setInterval(verifySession, SESSION_CHECK_INTERVAL_MS);

    return () => {
      active = false;
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
