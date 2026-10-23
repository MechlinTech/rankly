"use client";

import { useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { OAuthButtons } from "@/components/oauth-buttons";
import { PasswordField } from "@/components/password-field";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_state: "That sign-in link expired or was invalid. Please try again.",
  oauth_failed: "Sign-in didn't go through. Please try again.",
  oauth_cancelled: "Sign-in was cancelled. You can try again or use your email and password.",
  oauth_expired: "Your sign-in session expired. Please try again.",
  oauth_not_configured: "Single sign-on isn't configured for this deployment. Use your email and password or contact your administrator.",
  oauth_configuration_error: "Single sign-on is enabled but its callback URL is misconfigured. Contact your administrator.",
  oauth_unavailable: "Single sign-on is temporarily unavailable. Please try again in a moment.",
  oauth_account_conflict: "We couldn't match this account safely. Try another sign-in method or contact support.",
  oauth_rate_limited: "Too many sign-in attempts. Please wait a few minutes and try again.",
  oauth_server_error: "Sign-in failed because of a server error. Please try again.",
  no_workspace: "Your account isn't attached to an active workspace. Contact support.",
};

export function LoginForm() {
  const params = useSearchParams();
  const nextParam = params.get("next");
  const authError = params.get("error");
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    authError ? AUTH_ERROR_MESSAGES[authError] ?? "Sign-in failed." : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.user) return;

        const isSuper = Boolean(data.isSuperAdmin ?? data.user?.isSuperAdmin);
        // A signed-in user without a workspace cannot enter the dashboard;
        // leave them on login instead of bouncing between /login and /keywords.
        if (!isSuper && !data.tenant) return;

        const safeNext =
          nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.includes("\\")
            ? nextParam
            : null;

        if (isSuper) {
          const dest = safeNext && (safeNext === "/admin" || safeNext.startsWith("/admin/"))
            ? safeNext
            : "/admin";
          window.location.assign(dest);
        } else {
          const isAdminRoute = safeNext === "/admin" || safeNext?.startsWith("/admin/");
          const dest = safeNext && !isAdminRoute ? safeNext : "/keywords";
          window.location.assign(dest);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [nextParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.formErrors?.[0] ?? "Something went wrong.");
        return;
      }

      const isSuperAdmin = Boolean(data?.isSuperAdmin ?? data?.user?.isSuperAdmin);
      const safeNext =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.includes("\\")
          ? nextParam
          : null;

      let destination = isSuperAdmin ? "/admin" : "/keywords";
      if (isSuperAdmin) {
        if (safeNext && (safeNext === "/admin" || safeNext.startsWith("/admin/"))) {
          destination = safeNext;
        }
      } else {
        const isAdminRoute = safeNext === "/admin" || safeNext?.startsWith("/admin/");
        if (safeNext && !isAdminRoute) {
          destination = safeNext;
        }
      }

      window.location.assign(destination);
      return;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Log in to Rankly</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Welcome back.</p>

        <div className="mt-6">
          <OAuthButtons next={nextParam} />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor={emailId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
            <Input id={emailId} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={passwordId} className="block text-xs font-medium text-slate-600 dark:text-slate-400">Password</label>
              <Link href="/forgot-password" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
                Forgot password?
              </Link>
            </div>
            <PasswordField
              id={passwordId}
              required
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-slate-900 hover:underline dark:text-white">
            Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
