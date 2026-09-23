"use client";

import { use, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input, Spinner } from "@/components/ui";

interface InviteInfo {
  email: string;
  role: string;
  tenantName: string;
  requiresLogin: boolean;
}

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const nameId = useId();
  const passwordId = useId();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loggedInAsInvitee, setLoggedInAsInvitee] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/invite/${token}`).then((r) => r.json().then((data) => ({ ok: r.ok, data }))),
      fetch("/api/auth/me").then((r) => r.json()),
    ]).then(([inviteRes, me]) => {
      if (!inviteRes.ok) {
        setLoadError(inviteRes.data.error ?? "Invalid invitation.");
        return;
      }
      setInfo(inviteRes.data);
      setLoggedInAsInvitee(me?.user?.email === inviteRes.data.email);
    }).catch(() => setLoadError("Couldn't load this invitation."));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info?.requiresLogin ? {} : { name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/keywords");
      router.refresh();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-sm p-6">
        {!info && !loadError && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
        {info && (
          <>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Join {info.tenantName} on Rankly
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Invited as <strong>{info.email}</strong> with the {info.role.toLowerCase()} role.
            </p>

            {info.requiresLogin && loggedInAsInvitee ? (
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Joining…" : "Accept invitation"}
                </Button>
              </form>
            ) : info.requiresLogin ? (
              <div className="mt-6">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  An account with this email already exists. Log in, then reopen this invite link to join.
                </p>
                <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="mt-4 inline-block">
                  <Button>Log in</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <div>
                  <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Your name
                  </label>
                  <Input id={nameId} required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label htmlFor={passwordId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Set a password
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
                </div>
                {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Joining…" : "Accept invitation"}
                </Button>
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
