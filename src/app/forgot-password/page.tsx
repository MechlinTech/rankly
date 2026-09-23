"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show the same confirmation, whether or not the email exists.
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Reset your password</h1>

        {submitted ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link to it.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor={emailId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
              <Input id={emailId} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link href="/login" className="font-medium text-slate-900 hover:underline dark:text-white">
            Back to login
          </Link>
        </p>
      </Card>
    </div>
  );
}
