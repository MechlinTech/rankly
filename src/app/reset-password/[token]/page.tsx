"use client";

import { use, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input, Spinner } from "@/components/ui";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const passwordId = useId();

  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset-password/${token}`)
      .then((r) => r.json())
      .then((data) => setValid(!!data.valid))
      .catch(() => setValid(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Set a new password</h1>

        {valid === null && (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        )}

        {valid === false && (
          <div className="mt-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              This reset link is invalid or has expired.
            </p>
            <Link href="/forgot-password" className="mt-4 inline-block">
              <Button>Request a new link</Button>
            </Link>
          </div>
        )}

        {valid && done && (
          <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
            Password updated. Redirecting to login…
          </p>
        )}

        {valid && !done && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor={passwordId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                New password
              </label>
              <Input
                id={passwordId}
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-500">At least 10 characters.</p>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
