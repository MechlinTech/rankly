"use client";

import { useEffect, useId, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { postJson, UnauthorizedError } from "@/lib/api-client";

type Role = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";

interface Member {
  id: string;
  role: Role;
  isActive: boolean;
  user: { id: string; name: string | null; email: string };
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  status: string;
}

interface TeamData {
  currentRole: Role;
  members: Member[];
  invitations: Invitation[];
}

const ROLE_OPTIONS: Role[] = ["ADMIN", "MANAGER", "MEMBER", "VIEWER"];

export default function TeamPage() {
  const router = useRouter();
  const emailId = useId();
  const roleId = useId();
  const [data, setData] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  const canManage = data?.currentRole === "OWNER" || data?.currentRole === "ADMIN";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    setBusy(true);
    try {
      const result = await postJson<{ inviteUrl?: string; emailSent: boolean }>("/api/team/invite", {
        email,
        role,
      });
      setInviteUrl(result.inviteUrl ?? null);
      setInviteEmailSent(result.emailSent);
      setEmail("");
      await load();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't send that invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    await fetch(`/api/team/invitations/${id}`, { method: "DELETE" });
    await load();
  }

  async function updateMemberRole(id: string, newRole: Role) {
    await fetch(`/api/team/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/team/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    await load();
  }

  async function removeMember(id: string) {
    await fetch(`/api/team/members/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Team</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage who has access to this workspace and what they can do.
        </p>
      </div>

      {canManage && (
        <Card className="p-5">
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor={emailId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
              <Input
                id={emailId}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </div>
            <div>
              <label htmlFor={roleId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Role</label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {inviteEmailSent && (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Invitation email sent.</p>
          )}
          {inviteUrl && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              No email provider is connected yet — share this link with them directly:
              <div className="mt-1 break-all font-mono text-slate-900 dark:text-white">{inviteUrl}</div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Members" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {canManage && <th className="px-5 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.members.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{m.user.name ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{m.user.email}</td>
                  <td className="px-5 py-3">
                    {canManage && m.role !== "OWNER" ? (
                      <select
                        value={m.role}
                        onChange={(e) => updateMemberRole(m.id, e.target.value as Role)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone={m.role === "OWNER" ? "info" : "neutral"}>{m.role}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? "Active" : "Deactivated"}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-5 py-3">
                      {m.role !== "OWNER" && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => toggleActive(m.id, m.isActive)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          >
                            {m.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                          <button
                            onClick={() => removeMember(m.id)}
                            className="text-xs font-medium text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage && (data?.invitations.length ?? 0) > 0 && (
        <Card>
          <CardHeader title="Pending invitations" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{inv.email}</td>
                    <td className="px-5 py-3">
                      <Badge tone="neutral">{inv.role}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => revokeInvitation(inv.id)}
                        className="text-xs font-medium text-red-500 hover:text-red-700"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
