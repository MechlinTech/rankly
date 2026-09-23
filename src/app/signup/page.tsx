"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { OAuthButtons } from "@/components/oauth-buttons";

export default function SignupPage() {
  const nameId = useId();
  const companyNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error?.formErrors?.[0] ?? data?.error?.fieldErrors ?? "Something went wrong.";
        setError(typeof message === "string" ? message : "Please check your details and try again.");
        return;
      }
      window.location.assign("/keywords");
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
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Create your workspace</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Start your free trial.</p>

        <div className="mt-6">
          <OAuthButtons />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Your name</label>
            <Input id={nameId} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label htmlFor={companyNameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Company name</label>
            <Input id={companyNameId} required value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" />
          </div>
          <div>
            <label htmlFor={emailId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
            <Input id={emailId} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label htmlFor={passwordId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Password</label>
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
          <Button type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-slate-900 hover:underline dark:text-white">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
