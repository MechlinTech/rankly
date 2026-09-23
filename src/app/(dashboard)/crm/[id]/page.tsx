"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";

type Stage = "LEAD" | "PROSPECT" | "CLIENT" | "CHURNED";
type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE";

interface CompanyDetail {
  id: string;
  name: string;
  domain: string | null;
  stage: Stage;
  tags: string[];
  notes: string | null;
  contacts: Array<{ id: string; name: string; email: string | null; title: string | null }>;
  tasks: Array<{ id: string; title: string; status: TaskStatus; dueAt: string | null }>;
  activities: Array<{ id: string; type: string; body: string; createdAt: string }>;
}

const STAGES: Stage[] = ["LEAD", "PROSPECT", "CLIENT", "CHURNED"];

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [noteText, setNoteText] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [taskTitle, setTaskTitle] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/companies/${id}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.ok) setCompany((await res.json()).company);
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  async function updateStage(stage: Stage) {
    await fetch(`/api/crm/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    await load();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await fetch("/api/crm/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: id, type: "NOTE", body: noteText.trim() }),
    });
    setNoteText("");
    await load();
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) return;
    await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: contactName.trim(), email: contactEmail.trim() || undefined, companyId: id }),
    });
    setContactName("");
    setContactEmail("");
    await load();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle.trim(), companyId: id }),
    });
    setTaskTitle("");
    await load();
  }

  async function toggleTask(taskId: string, current: TaskStatus) {
    const next = current === "DONE" ? "OPEN" : "DONE";
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  if (!company) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{company.name}</h1>
          {company.domain && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{company.domain}</p>}
        </div>
        <select
          value={company.stage}
          onChange={(e) => updateStage(e.target.value as Stage)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Activity" description="Notes and history for this account." />
            <div className="p-5">
              <form onSubmit={addNote} className="flex gap-2">
                <Input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                />
                <Button type="submit" disabled={!noteText.trim()}>
                  Add
                </Button>
              </form>
              <ul className="mt-5 space-y-4">
                {company.activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Badge tone={a.type === "STAGE_CHANGE" ? "info" : "neutral"}>{a.type}</Badge>
                      <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{a.body}</p>
                  </li>
                ))}
                {company.activities.length === 0 && (
                  <p className="text-sm text-slate-500">No activity yet.</p>
                )}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Tasks" />
            <div className="p-5">
              <form onSubmit={addTask} className="flex gap-2">
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task…" />
                <Button type="submit" disabled={!taskTitle.trim()}>
                  Add
                </Button>
              </form>
              <ul className="mt-5 space-y-2">
                {company.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={t.status === "DONE"}
                      onChange={() => toggleTask(t.id, t.status)}
                      className="h-4 w-4"
                    />
                    <span
                      className={`text-sm ${
                        t.status === "DONE" ? "text-slate-500 line-through" : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {t.title}
                    </span>
                  </li>
                ))}
                {company.tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
              </ul>
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Contacts" />
          <div className="p-5">
            <form onSubmit={addContact} className="flex flex-col gap-2">
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" />
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email (optional)"
              />
              <Button type="submit" disabled={!contactName.trim()}>
                Add contact
              </Button>
            </form>
            <ul className="mt-5 space-y-3">
              {company.contacts.map((c) => (
                <li key={c.id}>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</p>
                  {c.email && <p className="text-xs text-slate-500 dark:text-slate-400">{c.email}</p>}
                </li>
              ))}
              {company.contacts.length === 0 && <p className="text-sm text-slate-500">No contacts yet.</p>}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
