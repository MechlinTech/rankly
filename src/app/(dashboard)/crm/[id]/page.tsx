"use client";

import { use, useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Input, Spinner } from "@/components/ui";
import {
  validateContactName,
  validateContactEmail,
  validateContactPhone,
  validateContactTitle,
  validateTaskTitle,
  validateActivityBody,
  validateCompanyName,
  validateCompanyDomain,
  validateCompanyNotes,
  cleanDomain,
  formatCrmError,
  contactFieldErrorsFromApi,
  CONTACT_PHONE_MAX_LENGTH,
  type ContactFieldErrors,
} from "@/lib/crm/validation";

type Stage = "LEAD" | "PROSPECT" | "CLIENT" | "CHURNED";
type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE";
type ActivityType = "NOTE" | "CALL" | "EMAIL" | "MEETING";

interface ContactItem {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  title: string | null;
}

interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
}

interface ActivityItem {
  id: string;
  type: string;
  body: string;
  createdAt: string;
}

interface CompanyDetail {
  id: string;
  name: string;
  domain: string | null;
  stage: Stage;
  tags: string[];
  notes: string | null;
  contacts: ContactItem[];
  tasks: TaskItem[];
  activities: ActivityItem[];
  createdAt?: string;
  updatedAt?: string;
}

const STAGES: Stage[] = ["LEAD", "PROSPECT", "CLIENT", "CHURNED"];

const STAGE_CONFIG: Record<
  Stage,
  { label: string; tone: "neutral" | "info" | "success" | "warning"; dotColor: string }
> = {
  LEAD: { label: "Lead", tone: "neutral", dotColor: "bg-slate-400" },
  PROSPECT: { label: "Prospect", tone: "info", dotColor: "bg-blue-500" },
  CLIENT: { label: "Client", tone: "success", dotColor: "bg-emerald-500" },
  CHURNED: { label: "Churned", tone: "warning", dotColor: "bg-amber-500" },
};

const AVATAR_GRADIENTS = [
  "from-indigo-600 to-violet-600",
  "from-sky-600 to-blue-600",
  "from-emerald-600 to-teal-600",
  "from-amber-600 to-orange-600",
  "from-rose-600 to-pink-600",
  "from-purple-600 to-indigo-600",
];

function getAvatarGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Activity Composer State
  const [activityType, setActivityType] = useState<ActivityType>("NOTE");
  const [noteText, setNoteText] = useState("");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [addingActivity, setAddingActivity] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string>("ALL");

  // Contact Form State
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactFormExpanded, setContactFormExpanded] = useState(false);
  const [contactFieldErrors, setContactFieldErrors] = useState<ContactFieldErrors>({});
  const [addingContact, setAddingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  // Task Form State
  const [taskTitle, setTaskTitle] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"ALL" | "OPEN" | "DONE">("ALL");
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Edit Company Modal State
  const [editingCompany, setEditingCompany] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editErrors, setEditErrors] = useState<{ name?: string; domain?: string; notes?: string; general?: string }>({});
  const [savingCompany, setSavingCompany] = useState(false);

  // Form field IDs
  const contactNameId = useId();
  const contactEmailId = useId();
  const contactPhoneId = useId();
  const contactTitleId = useId();
  const noteInputId = useId();
  const taskInputId = useId();
  const contactFormId = useId();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/companies/${id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCompany(data.company);
        setNotFound(false);
      }
    } catch {
      // Network failure
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, [load]);

  async function updateStage(newStage: Stage) {
    if (!company || company.stage === newStage) return;
    try {
      const res = await fetch(`/api/crm/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) {
        await load();
      }
    } catch {
      // handle gracefully
    }
  }

  async function handleAddActivity(e: React.FormEvent) {
    e.preventDefault();
    const error = validateActivityBody(noteText);
    if (error) {
      setActivityError(error);
      return;
    }

    setAddingActivity(true);
    setActivityError(null);
    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: id,
          type: activityType,
          body: noteText.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActivityError(formatCrmError(data?.error, "Couldn't record activity. Please try again."));
        return;
      }
      setNoteText("");
      await load();
    } catch {
      setActivityError("Network error. Please try again.");
    } finally {
      setAddingActivity(false);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();

    const nameErr = validateContactName(contactName);
    const emailErr = validateContactEmail(contactEmail);
    const phoneErr = validateContactPhone(contactPhone);
    const titleErr = validateContactTitle(contactTitle);

    if (nameErr || emailErr || phoneErr || titleErr) {
      setContactFieldErrors({
        name: nameErr ?? undefined,
        email: emailErr ?? undefined,
        phone: phoneErr ?? undefined,
        title: titleErr ?? undefined,
      });
      return;
    }

    setAddingContact(true);
    setContactFieldErrors({});
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim() || undefined,
          phone: contactPhone.trim() || undefined,
          title: contactTitle.trim() || undefined,
          companyId: id,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setContactFieldErrors(
          contactFieldErrorsFromApi(data?.error, "Couldn't add contact. Please review fields.")
        );
        return;
      }
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactTitle("");
      setContactFormExpanded(false);
      await load();
    } catch {
      setContactFieldErrors({ general: "Network error. Please try again." });
    } finally {
      setAddingContact(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    if (!confirm("Are you sure you want to remove this contact?")) return;
    setDeletingContactId(contactId);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, { method: "DELETE" });
      if (res.ok) {
        await load();
      }
    } catch {
      // ignore
    } finally {
      setDeletingContactId(null);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const error = validateTaskTitle(taskTitle);
    if (error) {
      setTaskError(error);
      return;
    }

    setAddingTask(true);
    setTaskError(null);
    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle.trim(), companyId: id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTaskError(formatCrmError(data?.error, "Couldn't create task."));
        return;
      }
      setTaskTitle("");
      await load();
    } catch {
      setTaskError("Network error. Please try again.");
    } finally {
      setAddingTask(false);
    }
  }

  async function handleToggleTask(taskId: string, current: TaskStatus) {
    const next = current === "DONE" ? "OPEN" : "DONE";
    setTogglingTaskId(taskId);
    try {
      await fetch(`/api/crm/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await load();
    } finally {
      setTogglingTaskId(null);
    }
  }

  async function handleDeleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    try {
      const res = await fetch(`/api/crm/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        await load();
      }
    } finally {
      setDeletingTaskId(null);
    }
  }

  function openEditModal() {
    if (!company) return;
    setEditName(company.name);
    setEditDomain(company.domain ?? "");
    setEditNotes(company.notes ?? "");
    setEditErrors({});
    setEditingCompany(true);
  }

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = validateCompanyName(editName);
    const domainErr = validateCompanyDomain(editDomain);
    const notesErr = validateCompanyNotes(editNotes);

    if (nameErr || domainErr || notesErr) {
      setEditErrors({
        name: nameErr ?? undefined,
        domain: domainErr ?? undefined,
        notes: notesErr ?? undefined,
      });
      return;
    }

    setSavingCompany(true);
    setEditErrors({});
    try {
      const res = await fetch(`/api/crm/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          domain: editDomain.trim() || undefined,
          notes: editNotes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditErrors({ general: formatCrmError(data?.error, "Couldn't update company details.") });
        return;
      }
      setEditingCompany(false);
      await load();
    } catch {
      setEditErrors({ general: "Network error. Please try again." });
    } finally {
      setSavingCompany(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-xs text-slate-400">Loading company details…</p>
      </div>
    );
  }

  if (notFound || !company) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Company not found</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This account may have been removed or you do not have permission to view it.
          </p>
        </div>
        <Link
          href="/crm"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to CRM
        </Link>
      </div>
    );
  }

  const openTasksCount = company.tasks.filter((t) => t.status !== "DONE").length;
  const filteredActivities = company.activities.filter((a) => {
    if (activityFilter === "ALL") return true;
    return a.type === activityFilter;
  });
  const filteredTasks = company.tasks.filter((t) => {
    if (taskFilter === "ALL") return true;
    if (taskFilter === "OPEN") return t.status !== "DONE";
    return t.status === "DONE";
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Link
          href="/crm"
          className="inline-flex items-center gap-1.5 font-medium transition hover:text-slate-900 dark:hover:text-white"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Companies
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px] sm:max-w-md">
          {company.name}
        </span>
      </nav>

      {/* Company Header Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 backdrop-blur-xs">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${getAvatarGradient(
                company.name
              )} text-lg font-bold text-white shadow-sm ring-2 ring-white/10`}
            >
              {getInitials(company.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  title={company.name}
                  className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl break-words [overflow-wrap:anywhere]"
                >
                  {company.name}
                </h1>
                <Badge tone={STAGE_CONFIG[company.stage].tone}>{STAGE_CONFIG[company.stage].label}</Badge>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {company.domain && (
                  <a
                    href={`https://${cleanDomain(company.domain)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={company.domain}
                    className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400 break-all [overflow-wrap:anywhere]"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                    {cleanDomain(company.domain)}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  {company.contacts.length} {company.contacts.length === 1 ? "contact" : "contacts"}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  {openTasksCount} open {openTasksCount === 1 ? "task" : "tasks"}
                </span>
              </div>
            </div>
          </div>

          {/* Header Controls: Stage Selector & Edit Button */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
              <select
                value={company.stage}
                onChange={(e) => updateStage(e.target.value as Stage)}
                aria-label="Company stage"
                className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-3.5 pr-8 text-xs font-semibold text-slate-800 shadow-2xs transition hover:border-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={openEditModal} className="h-9">
              <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              Edit details
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column (Activity + Tasks) and Right Column (Contacts + Notes) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: 2 columns wide on desktop */}
        <div className="flex flex-col gap-6 lg:col-span-2 min-w-0">
          {/* Activity Section */}
          <Card className="min-w-0">
            <CardHeader
              title="Activity & History"
              description="Notes, communications, and system timeline for this account."
              badge={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {company.activities.length}
                </span>
              }
            />

            <div className="p-5">
              {/* Activity Composer */}
              <form onSubmit={handleAddActivity} className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                {/* Type Selection Tabs */}
                <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                  {(["NOTE", "CALL", "EMAIL", "MEETING"] as ActivityType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setActivityType(t)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                        activityType === t
                          ? "bg-slate-900 text-white shadow-2xs dark:bg-white dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      {t === "NOTE" && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      )}
                      {t === "CALL" && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                          />
                        </svg>
                      )}
                      {t === "EMAIL" && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                      {t === "MEETING" && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                      {t === "NOTE" ? "Note" : t === "CALL" ? "Phone Call" : t === "EMAIL" ? "Email" : "Meeting"}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1 min-w-0">
                    <Input
                      id={noteInputId}
                      value={noteText}
                      onChange={(e) => {
                        setNoteText(e.target.value);
                        if (activityError) setActivityError(null);
                      }}
                      placeholder={
                        activityType === "NOTE"
                          ? "Add a note…"
                          : activityType === "CALL"
                          ? "Log details from phone conversation…"
                          : activityType === "EMAIL"
                          ? "Log email update or thread details…"
                          : "Log meeting notes and key takeaways…"
                      }
                      aria-label="Activity content"
                      aria-invalid={Boolean(activityError)}
                      aria-describedby={activityError ? `${noteInputId}-error` : undefined}
                      className="min-w-0"
                    />
                    {activityError && (
                      <p
                        id={`${noteInputId}-error`}
                        role="alert"
                        className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        {activityError}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={addingActivity || !noteText.trim()}
                    className="shrink-0 whitespace-nowrap self-stretch sm:self-auto"
                  >
                    {addingActivity ? "Adding…" : "Add"}
                  </Button>
                </div>
              </form>

              {/* Activity Filter Tabs */}
              {company.activities.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Filter timeline:</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { key: "ALL", label: "All" },
                      { key: "NOTE", label: "Notes" },
                      { key: "STAGE_CHANGE", label: "Stage changes" },
                      { key: "CALL", label: "Calls" },
                      { key: "EMAIL", label: "Emails" },
                      { key: "MEETING", label: "Meetings" },
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setActivityFilter(f.key)}
                        className={`rounded-md px-2 py-0.5 text-xs font-medium transition cursor-pointer ${
                          activityFilter === f.key
                            ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Timeline List */}
              <div className="mt-5">
                {filteredActivities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                      {company.activities.length === 0 ? "No activity yet." : "No matching activities for this filter."}
                    </p>
                    <p className="text-xs text-slate-400">Log notes, calls, or stage changes above.</p>
                  </div>
                ) : (
                  <ul className="relative space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                    {filteredActivities.map((a) => {
                      const isStageChange = a.type === "STAGE_CHANGE";
                      return (
                        <li key={a.id} className="relative flex items-start gap-3 pl-0.5 min-w-0">
                          {/* Timeline node icon */}
                          <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900 ${
                              isStageChange
                                ? "bg-blue-600 text-white"
                                : a.type === "CALL"
                                ? "bg-emerald-600 text-white"
                                : a.type === "EMAIL"
                                ? "bg-sky-600 text-white"
                                : a.type === "MEETING"
                                ? "bg-amber-600 text-white"
                                : "bg-slate-700 text-white dark:bg-slate-600"
                            }`}
                          >
                            {isStageChange ? (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                                />
                              </svg>
                            ) : (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                                />
                              </svg>
                            )}
                          </div>

                          {/* Activity content */}
                          <div className="flex-1 min-w-0 rounded-xl border border-slate-100 bg-white p-3.5 shadow-2xs dark:border-slate-800/80 dark:bg-slate-950/60">
                            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Badge tone={isStageChange ? "info" : "neutral"}>{a.type}</Badge>
                              </div>
                              <span
                                className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0"
                                title={new Date(a.createdAt).toISOString()}
                              >
                                {new Date(a.createdAt).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap leading-relaxed">
                              {a.body}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Tasks Section */}
          <Card className="min-w-0">
            <CardHeader
              title="Tasks & To-Dos"
              description="Keep track of action items and follow-ups for this account."
              badge={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {openTasksCount} open
                </span>
              }
            />

            <div className="p-5">
              {/* Task Composer Form */}
              <form onSubmit={handleAddTask} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex-1 min-w-0">
                  <Input
                    id={taskInputId}
                    value={taskTitle}
                    onChange={(e) => {
                      setTaskTitle(e.target.value);
                      if (taskError) setTaskError(null);
                    }}
                    placeholder="New task…"
                    aria-label="New task title"
                    aria-invalid={Boolean(taskError)}
                    aria-describedby={taskError ? `${taskInputId}-error` : undefined}
                    className="min-w-0"
                  />
                  {taskError && (
                    <p
                      id={`${taskInputId}-error`}
                      role="alert"
                      className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                    >
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      {taskError}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={addingTask || !taskTitle.trim()}
                  className="shrink-0 whitespace-nowrap self-stretch sm:self-auto"
                >
                  {addingTask ? "Adding…" : "Add"}
                </Button>
              </form>

              {/* Task Filter Tabs */}
              {company.tasks.length > 0 && (
                <div className="mt-5 flex items-center gap-1 border-b border-slate-100 pb-2.5 text-xs dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTaskFilter("ALL")}
                    className={`rounded-md px-2 py-0.5 font-medium transition cursor-pointer ${
                      taskFilter === "ALL"
                        ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    All ({company.tasks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskFilter("OPEN")}
                    className={`rounded-md px-2 py-0.5 font-medium transition cursor-pointer ${
                      taskFilter === "OPEN"
                        ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    Open ({openTasksCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskFilter("DONE")}
                    className={`rounded-md px-2 py-0.5 font-medium transition cursor-pointer ${
                      taskFilter === "DONE"
                        ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    Done ({company.tasks.length - openTasksCount})
                  </button>
                </div>
              )}

              {/* Tasks List */}
              <div className="mt-4">
                {filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      {company.tasks.length === 0 ? "No tasks yet." : "No tasks in this view."}
                    </p>
                    <p className="text-xs text-slate-400">Add follow-up tasks to keep deals moving.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {filteredTasks.map((t) => (
                      <li
                        key={t.id}
                        className="group flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 transition hover:border-slate-200 hover:bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-950/40 dark:hover:border-slate-700 min-w-0"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={t.status === "DONE"}
                            disabled={togglingTaskId === t.id}
                            onChange={() => handleToggleTask(t.id, t.status)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 cursor-pointer"
                            aria-label={`Mark task ${t.title} as ${t.status === "DONE" ? "open" : "done"}`}
                          />
                          <span
                            title={t.title}
                            className={`flex-1 min-w-0 text-sm leading-normal break-words [overflow-wrap:anywhere] [word-break:break-word] ${
                              t.status === "DONE"
                                ? "text-slate-400 line-through dark:text-slate-500"
                                : "text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {t.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t.id)}
                            disabled={deletingTaskId === t.id}
                            title="Delete task"
                            aria-label={`Delete task ${t.title}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 transition hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.8}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Contacts + Notes Card */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Contacts Section */}
          <Card className="h-fit min-w-0">
            <CardHeader
              title="Contacts"
              description="Key stakeholders and contacts for this account."
              badge={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {company.contacts.length}
                </span>
              }
              action={
                <button
                  type="button"
                  onClick={() => setContactFormExpanded(!contactFormExpanded)}
                  aria-expanded={contactFormExpanded}
                  aria-controls={contactFormId}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={contactFormExpanded ? "M19 9l-7 7-7-7" : "M12 4v16m8-8H4"}
                    />
                  </svg>
                  {contactFormExpanded ? "Hide form" : "Add contact"}
                </button>
              }
            />

            <div className="p-5">
              {/* Add Contact Form (with whole-page validation) */}
              {contactFormExpanded && (
                <form id={contactFormId} onSubmit={handleAddContact} className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      New Contact
                    </span>
                    {contactFieldErrors.general && (
                      <span role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        {contactFieldErrors.general}
                      </span>
                    )}
                  </div>

                  <div>
                    <label htmlFor={contactNameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      id={contactNameId}
                      value={contactName}
                      onChange={(e) => {
                        setContactName(e.target.value);
                        if (contactFieldErrors.name || contactFieldErrors.general) {
                          setContactFieldErrors((prev) => ({ ...prev, name: undefined, general: undefined }));
                        }
                      }}
                      placeholder="Jane Doe"
                      aria-label="Contact name"
                      aria-invalid={Boolean(contactFieldErrors.name)}
                      aria-describedby={contactFieldErrors.name ? `${contactNameId}-error` : undefined}
                    />
                    {contactFieldErrors.name && (
                      <p
                        id={`${contactNameId}-error`}
                        role="alert"
                        className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                      >
                        {contactFieldErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={contactEmailId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Email address (optional)
                    </label>
                    <Input
                      id={contactEmailId}
                      value={contactEmail}
                      type="email"
                      onChange={(e) => {
                        setContactEmail(e.target.value);
                        if (contactFieldErrors.email || contactFieldErrors.general) {
                          setContactFieldErrors((prev) => ({ ...prev, email: undefined, general: undefined }));
                        }
                      }}
                      placeholder="jane@company.com"
                      aria-label="Contact email"
                      aria-invalid={Boolean(contactFieldErrors.email)}
                      aria-describedby={contactFieldErrors.email ? `${contactEmailId}-error` : undefined}
                    />
                    {contactFieldErrors.email && (
                      <p
                        id={`${contactEmailId}-error`}
                        role="alert"
                        className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                      >
                        {contactFieldErrors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={contactTitleId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Job Title / Role (optional)
                    </label>
                    <Input
                      id={contactTitleId}
                      value={contactTitle}
                      onChange={(e) => {
                        setContactTitle(e.target.value);
                        if (contactFieldErrors.title || contactFieldErrors.general) {
                          setContactFieldErrors((prev) => ({ ...prev, title: undefined, general: undefined }));
                        }
                      }}
                      placeholder="e.g. VP Marketing, Founder"
                      aria-label="Contact title"
                      aria-invalid={Boolean(contactFieldErrors.title)}
                      aria-describedby={contactFieldErrors.title ? `${contactTitleId}-error` : undefined}
                    />
                    {contactFieldErrors.title && (
                      <p
                        id={`${contactTitleId}-error`}
                        role="alert"
                        className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                      >
                        {contactFieldErrors.title}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={contactPhoneId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Phone (optional)
                    </label>
                    <Input
                      id={contactPhoneId}
                      value={contactPhone}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={CONTACT_PHONE_MAX_LENGTH}
                      onChange={(e) => {
                        setContactPhone(e.target.value);
                        if (contactFieldErrors.phone || contactFieldErrors.general) {
                          setContactFieldErrors((prev) => ({ ...prev, phone: undefined, general: undefined }));
                        }
                      }}
                      placeholder="+1 (555) 019-2834"
                      aria-label="Contact phone"
                      aria-invalid={Boolean(contactFieldErrors.phone)}
                      aria-describedby={contactFieldErrors.phone ? `${contactPhoneId}-error` : undefined}
                    />
                    {contactFieldErrors.phone && (
                      <p
                        id={`${contactPhoneId}-error`}
                        role="alert"
                        className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400"
                      >
                        {contactFieldErrors.phone}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={addingContact || !contactName.trim()}
                    className="mt-1 w-full"
                  >
                    {addingContact ? "Adding…" : "Add contact"}
                  </Button>
                </form>
              )}

              {/* Contacts List with proper card framing and text wrapping */}
              <div className="mt-5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Contact List ({company.contacts.length})
                  </span>
                </div>

                {company.contacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">No contacts yet.</p>
                    <p className="text-xs text-slate-400">Use the form above to add stakeholders.</p>
                  </div>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {company.contacts.map((c) => (
                      <li
                        key={c.id}
                        className="group relative flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700 min-w-0"
                      >
                        {/* Avatar */}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(
                            c.name
                          )} text-xs font-bold text-white shadow-xs`}
                        >
                          {getInitials(c.name)}
                        </div>

                        {/* Contact info with guaranteed break-words and no overflow */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p
                              title={c.name}
                              className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words [overflow-wrap:anywhere] [word-break:break-word]"
                            >
                              {c.name}
                            </p>
                            {c.title && (
                              <span
                                title={c.title}
                                className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 break-words [overflow-wrap:anywhere]"
                              >
                                {c.title}
                              </span>
                            )}
                          </div>

                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              title={c.email}
                              className="mt-1 flex items-center gap-1 text-xs text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 break-all [overflow-wrap:anywhere]"
                            >
                              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                              <span className="truncate">{c.email}</span>
                            </a>
                          )}

                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              title={c.phone}
                              className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 break-all [overflow-wrap:anywhere]"
                            >
                              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                />
                              </svg>
                              <span>{c.phone}</span>
                            </a>
                          )}
                        </div>

                        {/* Delete action button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(c.id)}
                          disabled={deletingContactId === c.id}
                          title="Delete contact"
                          aria-label={`Delete contact ${c.name}`}
                          className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.8}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Account Notes & Overview Card */}
          <Card className="min-w-0">
            <CardHeader
              title="Account Notes"
              action={
                <button
                  type="button"
                  onClick={openEditModal}
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
                >
                  Edit notes
                </button>
              }
            />
            <div className="p-5">
              {company.notes ? (
                <p className="text-sm text-slate-700 dark:text-slate-300 break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap leading-relaxed">
                  {company.notes}
                </p>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-xs text-slate-400">No account notes added yet.</p>
                  <button
                    type="button"
                    onClick={openEditModal}
                    className="mt-2 text-xs font-medium text-slate-900 underline dark:text-white cursor-pointer"
                  >
                    Add notes for this account
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Company Modal */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-company-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 id="edit-company-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Edit Company Details
              </h2>
              <button
                type="button"
                onClick={() => setEditingCompany(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="mt-4 flex flex-col gap-4">
              {editErrors.general && (
                <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                  {editErrors.general}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (editErrors.name) setEditErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="Acme Corp"
                  aria-invalid={Boolean(editErrors.name)}
                />
                {editErrors.name && (
                  <p role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                    {editErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Domain (optional)
                </label>
                <Input
                  value={editDomain}
                  onChange={(e) => {
                    setEditDomain(e.target.value);
                    if (editErrors.domain) setEditErrors((prev) => ({ ...prev, domain: undefined }));
                  }}
                  placeholder="acme.com"
                  aria-invalid={Boolean(editErrors.domain)}
                />
                {editErrors.domain && (
                  <p role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                    {editErrors.domain}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Internal Notes (optional)
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => {
                    setEditNotes(e.target.value);
                    if (editErrors.notes) setEditErrors((prev) => ({ ...prev, notes: undefined }));
                  }}
                  rows={4}
                  placeholder="Notes about contract, renewal, point of contact, etc."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {editErrors.notes && (
                  <p role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                    {editErrors.notes}
                  </p>
                )}
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditingCompany(false)} type="button">
                  Cancel
                </Button>
                <Button type="submit" disabled={savingCompany || !editName.trim()}>
                  {savingCompany ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
