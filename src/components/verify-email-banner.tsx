"use client";

import { useState } from "react";

export function VerifyEmailBanner() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  async function resend() {
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.emailSent !== false) {
        setStatus("sent");
        if (data?.verifyUrl) setVerifyUrl(data.verifyUrl);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      role="status"
      className="mb-8 rounded-xl border border-amber-200/90 bg-amber-50/70 p-4 shadow-sm backdrop-blur-sm dark:border-amber-900/60 dark:bg-amber-950/40"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Please verify your email address.
            </h3>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              Check your inbox for the confirmation link to secure your account.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {status === "sent" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100/90 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Check your inbox.</span>
              </span>
              {verifyUrl && (
                <a
                  href={verifyUrl}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
                >
                  <span>(Direct link)</span>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              {status === "error" && (
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  Couldn&apos;t send. Try again.
                </span>
              )}
              <button
                type="button"
                onClick={resend}
                disabled={status === "sending"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/80 bg-white px-3.5 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition hover:bg-amber-100/60 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/70"
              >
                {status === "sending" ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin text-amber-700 dark:text-amber-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Sending…</span>
                  </>
                ) : (
                  <span>Resend verification email</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
