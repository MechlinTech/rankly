"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { AdminAiProvidersView } from "./admin-ai-providers-view";
import type { IntegrationConfig } from "@/app/api/admin/settings/route";
import type { TestResult } from "@/lib/admin/settings-tester";

interface IntegrationState {
  keyInput: string;
  extraInput: string;
  isTesting: boolean;
  isSaving: boolean;
  testResult: TestResult | null;
  saveMessage: string | null;
}

const SETTINGS_CATEGORIES = [
  { key: "Search & SEO", label: "Search & SEO", slug: "search" },
  { key: "Email & Notifications", label: "Email", slug: "email" },
  { key: "Artificial Intelligence", label: "Artificial Intelligence", slug: "ai" },
  { key: "Payments & Billing", label: "Billing", slug: "billing" },
  { key: "Authentication", label: "Auth (SSO)", slug: "auth" },
] as const;

const TAB_SLUG_MAP: Record<string, string> = {
  search: "Search & SEO",
  email: "Email & Notifications",
  ai: "Artificial Intelligence",
  billing: "Payments & Billing",
  auth: "Authentication",
};

const CATEGORY_TO_SLUG: Record<string, string> = {
  "Search & SEO": "search",
  "Email & Notifications": "email",
  "Artificial Intelligence": "ai",
  "Payments & Billing": "billing",
  "Authentication": "auth",
};

function resolveCategoryFromUrlOrStorage(): string {
  if (typeof window === "undefined") return "Search & SEO";
  try {
    const params = new URLSearchParams(window.location.search);
    // 1. Check 'category' or 'cat' query params first
    const catParam = params.get("category") || params.get("cat");
    if (catParam) {
      const lower = catParam.toLowerCase().trim();
      if (TAB_SLUG_MAP[lower]) return TAB_SLUG_MAP[lower];
      const match = SETTINGS_CATEGORIES.find(
        (c) => c.key.toLowerCase() === lower || c.label.toLowerCase() === lower
      );
      if (match) return match.key;
    }

    // 2. Check 'tab' query param (only if it matches one of our category slugs, NOT 'settings' or 'tenants')
    const tabParam = params.get("tab");
    if (tabParam && tabParam !== "settings" && tabParam !== "tenants") {
      const lower = tabParam.toLowerCase().trim();
      if (TAB_SLUG_MAP[lower]) return TAB_SLUG_MAP[lower];
    }

    // 3. Fallback to localStorage
    const saved = localStorage.getItem("admin_settings_category") || localStorage.getItem("admin_settings_tab");
    if (saved && SETTINGS_CATEGORIES.some((c) => c.key === saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return "Search & SEO";
}

export function AdminSettingsView() {
  const [integrations, setIntegrations] = useState<IntegrationConfig[] | null>(null);
  const [aiStats, setAiStats] = useState<{ total: number; active: number }>({ total: 0, active: 0 });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => resolveCategoryFromUrlOrStorage());
  const [loading, setLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<Record<string, IntegrationState>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [globalBanner, setGlobalBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Synchronize category in URL / localStorage and listen for history navigation
  useEffect(() => {
    try {
      const slug = CATEGORY_TO_SLUG[categoryFilter] || "search";
      const url = new URL(window.location.href);
      // Clean up any stale tab param that was incorrectly set to a category slug
      if (url.searchParams.get("tab") === slug) {
        url.searchParams.set("tab", "settings");
      }
      if (url.searchParams.get("category") !== slug) {
        url.searchParams.set("category", slug);
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // ignore
    }

    function handlePopState() {
      const current = resolveCategoryFromUrlOrStorage();
      setCategoryFilter(current);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [categoryFilter]);

  function handleTabChange(newCategory: string) {
    setCategoryFilter(newCategory);
    if (typeof window !== "undefined") {
      try {
        const slug = CATEGORY_TO_SLUG[newCategory] || "search";
        const url = new URL(window.location.href);
        url.searchParams.set("category", slug);
        // Ensure on /admin that tab=settings is retained
        if (window.location.pathname === "/admin") {
          url.searchParams.set("tab", "settings");
        }
        window.history.replaceState(null, "", url.toString());
        localStorage.setItem("admin_settings_category", newCategory);
      } catch {
        // ignore
      }
    }
  }

  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    async function fetchSettings() {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : `Settings could not be loaded (${res.status}).`);
        }
        if (!Array.isArray(data.integrations)) {
          throw new Error("The settings service returned an invalid integrations list.");
        }
        if (active) {
          setSettingsLoadError(null);
          setIntegrations(data.integrations);
          if (data.aiStats) setAiStats(data.aiStats);

          // Initialize state for each card
          const initialStates: Record<string, IntegrationState> = {};
          for (const item of data.integrations as IntegrationConfig[]) {
            initialStates[item.id] = {
              keyInput: "",
              extraInput: "",
              isTesting: false,
              isSaving: false,
              testResult: null,
              saveMessage: null,
            };
          }
          setCardStates(initialStates);
        }
      } catch (error) {
        if (active) {
          setSettingsLoadError(error instanceof Error ? error.message : "Unable to load API integration settings.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchSettings();
    return () => {
      active = false;
    };
  }, [reloadTrigger]);

  function reloadSettings() {
    setReloadTrigger((prev) => prev + 1);
  }

  function updateCardField(id: string, field: "keyInput" | "extraInput", value: string) {
    setCardStates((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { isTesting: false, isSaving: false, testResult: null, saveMessage: null }),
        [field]: value,
        saveMessage: null, // clear save message on edit
      },
    }));
  }

  async function handleTest(integration: IntegrationConfig): Promise<TestResult> {
    const state = cardStates[integration.id];
    setCardStates((prev) => ({
      ...prev,
      [integration.id]: { ...prev[integration.id], isTesting: true, testResult: null },
    }));

    try {
      const res = await fetch("/api/admin/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: integration.id,
          key: state?.keyInput?.trim() || undefined,
          extra: state?.extraInput?.trim() || undefined,
        }),
      });

      const data = (await res.json()) as TestResult;
      setCardStates((prev) => ({
        ...prev,
        [integration.id]: {
          ...prev[integration.id],
          isTesting: false,
          testResult: data,
        },
      }));
      return data;
    } catch (err) {
      const errResult: TestResult = {
        success: false,
        message: err instanceof Error ? err.message : "Network error during test.",
        latencyMs: 0,
      };
      setCardStates((prev) => ({
        ...prev,
        [integration.id]: {
          ...prev[integration.id],
          isTesting: false,
          testResult: errResult,
        },
      }));
      return errResult;
    }
  }

  async function handleSave(integration: IntegrationConfig) {
    const state = cardStates[integration.id];
    const keyVal = state?.keyInput?.trim();
    const extraVal = state?.extraInput?.trim();

    if (!keyVal && !extraVal) {
      setCardStates((prev) => ({
        ...prev,
        [integration.id]: {
          ...prev[integration.id],
          saveMessage: "Enter a new key or value before saving.",
        },
      }));
      return;
    }

    if (integration.id === "dataforseo" && !integration.isConfigured && (!keyVal || !extraVal)) {
      setCardStates((prev) => ({
        ...prev,
        [integration.id]: {
          ...prev[integration.id],
          saveMessage: "Please provide both DataForSEO API Login and API Password before saving.",
        },
      }));
      return;
    }

    setCardStates((prev) => ({
      ...prev,
      [integration.id]: { ...prev[integration.id], isSaving: true, saveMessage: null },
    }));

    const updates: Record<string, string> = {};
    if (keyVal) {
      updates[integration.envKey] = keyVal;
      if (integration.aliasKey) {
        updates[integration.aliasKey] = keyVal;
      }
    }
    if (extraVal && integration.extraKey) {
      updates[integration.extraKey] = extraVal;
    }

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (res.ok) {
        setCardStates((prev) => ({
          ...prev,
          [integration.id]: {
            ...prev[integration.id],
            isSaving: false,
            keyInput: "",
            extraInput: "",
            saveMessage: "Saved and applied to runtime successfully!",
          },
        }));
        reloadSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        setCardStates((prev) => ({
          ...prev,
          [integration.id]: {
            ...prev[integration.id],
            isSaving: false,
            saveMessage: err.error || "Failed to save settings.",
          },
        }));
      }
    } catch {
      setCardStates((prev) => ({
        ...prev,
        [integration.id]: {
          ...prev[integration.id],
          isSaving: false,
          saveMessage: "Network error saving settings.",
        },
      }));
    }
  }

  async function handleTestAll() {
    if (!integrations) return;
    setTestingAll(true);
    setGlobalBanner(null);

    const activeList = filteredIntegrations.filter((i) => i.isConfigured);
    if (activeList.length === 0) {
      setGlobalBanner({ type: "error", text: `No active credentials configured in ${categoryFilter} to test.` });
      setTestingAll(false);
      return;
    }

    let successCount = 0;
    for (const item of activeList) {
      const res = await handleTest(item);
      if (res.success) successCount++;
    }

    setGlobalBanner({
      type: successCount === activeList.length ? "success" : "error",
      text: `Health check complete: ${successCount} of ${activeList.length} services in ${categoryFilter} verified operational.`,
    });
    setTestingAll(false);
  }

  const isAiCategory = categoryFilter === "Artificial Intelligence";

  const categories = SETTINGS_CATEGORIES;

  const filteredIntegrations = (integrations ?? []).filter((item) => {
    return item.category === categoryFilter;
  });

  const categoryConfiguredCount = isAiCategory
    ? aiStats.active
    : filteredIntegrations.filter((i) => i.isConfigured).length;
  const categoryTotalCount = isAiCategory
    ? aiStats.total
    : filteredIntegrations.length;
  const totalEnvConfigured = integrations?.filter((i) => i.isConfigured).length ?? 0;
  const totalEnvCount = integrations?.length ?? 0;
  const totalConfiguredCount = totalEnvConfigured + aiStats.active;
  const totalIntegrationsCount = totalEnvCount + aiStats.total;

  if (loading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-xs text-slate-400">Loading system integration settings…</p>
      </div>
    );
  }

  if (settingsLoadError) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">API integration settings could not be loaded</p>
        <p role="alert" className="max-w-xl text-xs text-rose-700 dark:text-rose-400">{settingsLoadError}</p>
        <Button variant="secondary" size="sm" onClick={reloadSettings}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              API Keys & Integrations
            </h2>
            <Badge tone={categoryConfiguredCount > 0 ? "success" : "neutral"}>
              {categoryConfiguredCount} of {categoryTotalCount} {isAiCategory ? "Active" : "Connected"}
            </Badge>
            {totalIntegrationsCount > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                ({totalConfiguredCount} of {totalIntegrationsCount} total across all categories)
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAiCategory
              ? "Configure multi-provider AI engines (Gemini, OpenAI, Anthropic, xAI, Custom) with automated fallback."
              : "Configure external service credentials and run instant live diagnostic tests."}
          </p>
        </div>

        {!isAiCategory && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestAll}
              disabled={testingAll || categoryConfiguredCount === 0}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              {testingAll ? (
                <>
                  <Spinner />
                  <span>Running Checks…</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Test Configured ({categoryConfiguredCount})</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {globalBanner && (
        <div
          role="alert"
          className={`rounded-xl p-3 text-xs font-medium ${
            globalBanner.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
          }`}
        >
          {globalBanner.text}
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3 dark:border-slate-800">
        {categories.map((cat) => {
          const isAiTab = cat.key === "Artificial Intelligence";
          const catConfigured = isAiTab
            ? aiStats.active
            : (integrations ?? []).filter((i) => i.category === cat.key && i.isConfigured).length;
          const catTotal = isAiTab
            ? aiStats.total
            : (integrations ?? []).filter((i) => i.category === cat.key).length;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => handleTabChange(cat.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                categoryFilter === cat.key
                  ? "bg-slate-900 text-white shadow-2xs dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  categoryFilter === cat.key
                    ? "bg-slate-800 text-slate-200 dark:bg-slate-100 dark:text-slate-900 font-semibold"
                    : catConfigured > 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 font-medium"
                    : "bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {catConfigured}/{catTotal}
              </span>
            </button>
          );
        })}
      </div>

      {/* View Switcher: Multi-Provider AI View vs Standard Integrations Cards */}
      {isAiCategory ? (
        <AdminAiProvidersView onProviderChange={reloadSettings} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
        {filteredIntegrations.map((item) => {
          const state = cardStates[item.id] ?? {
            keyInput: "",
            extraInput: "",
            isTesting: false,
            isSaving: false,
            testResult: null,
            saveMessage: null,
          };

          return (
            <Card key={item.id} className="flex flex-col justify-between p-5 min-w-0">
              <div>
                {/* Top Title & Badges */}
                <div className="flex items-start justify-between gap-2 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.name}</h3>
                      <Badge tone={item.isConfigured ? "success" : "neutral"}>
                        {item.isConfigured ? "Active" : "Not Configured"}
                      </Badge>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                      ENV: {item.envKey}
                    </span>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                    {item.category}
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>

                {/* Form Fields */}
                <div className="mt-4 flex flex-col gap-3">
                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>{item.keyLabel || "Primary API Key"}</span>
                      {item.isConfigured && item.maskedValue && (
                        <span className="font-mono text-[10px] text-slate-400" title="Active configured key">
                          Active: {item.maskedValue}
                        </span>
                      )}
                    </label>
                    <Input
                      type={item.id === "dataforseo" ? "text" : "password"}
                      value={state.keyInput}
                      onChange={(e) => updateCardField(item.id, "keyInput", e.target.value)}
                      placeholder={item.isConfigured ? (item.keyLabel ? `Enter new ${item.keyLabel.toLowerCase()} to update...` : "Enter new key to update...") : item.placeholder}
                      className="font-mono text-xs"
                    />
                  </div>

                  {item.extraKey && (
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                        <span>{item.extraLabel || item.extraKey}</span>
                        {item.maskedExtraValue && (
                          <span className="font-mono text-[10px] text-slate-400">
                            Active: {item.maskedExtraValue}
                          </span>
                        )}
                      </label>
                      <Input
                        type={item.extraKey.includes("SECRET") || item.extraKey.includes("PASSWORD") ? "password" : "text"}
                        value={state.extraInput}
                        onChange={(e) => updateCardField(item.id, "extraInput", e.target.value)}
                        placeholder={`Enter ${item.extraLabel || item.extraKey}...`}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Diagnostic Test Result Banner */}
                {state.testResult && (
                  <div
                    role="alert"
                    className={`mt-4 rounded-xl p-3 text-xs flex items-start gap-2.5 ${
                      state.testResult.success
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                        : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60"
                    }`}
                  >
                    <div className="shrink-0 pt-0.5">
                      {state.testResult.success ? (
                        <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold break-words [overflow-wrap:anywhere]">
                        {state.testResult.message}
                      </p>
                      {state.testResult.latencyMs > 0 && (
                        <p className="mt-0.5 text-[10px] opacity-75">
                          Response time: {state.testResult.latencyMs}ms
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {state.saveMessage && (
                  <p
                    role="alert"
                    className={`mt-2 text-xs font-medium ${
                      state.saveMessage.includes("success")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {state.saveMessage}
                  </p>
                )}
              </div>

              {/* Action Buttons: Test Connection & Save */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTest(item)}
                  disabled={state.isTesting || (!item.isConfigured && !state.keyInput.trim())}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  {state.isTesting ? (
                    <>
                      <Spinner />
                      <span>Checking API…</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Check / Test</span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleSave(item)}
                  disabled={state.isSaving || (!state.keyInput.trim() && !state.extraInput.trim())}
                  className="cursor-pointer"
                >
                  {state.isSaving ? "Saving…" : item.extraKey ? "Save Credentials" : "Save Key"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
