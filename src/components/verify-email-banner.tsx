"use client";

import { useState } from "react";

export function VerifyEmailBanner() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend() {
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      const data = await res.json().catch(() => null);
      setStatus(res.ok && data?.emailSent !== false ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="safe-x flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
      <span>Please verify your email address.</span>
      {status === "sent" ? (
        <span className="font-medium">Check your inbox.</span>
      ) : (
        <span className="flex items-center gap-3">
          {status === "error" && <span>Couldn&apos;t send the verification email.</span>}
          <button onClick={resend} disabled={status === "sending"} className="font-medium underline">
            {status === "sending" ? "Sending…" : "Resend verification email"}
          </button>
        </span>
      )}
    </div>
  );
}
