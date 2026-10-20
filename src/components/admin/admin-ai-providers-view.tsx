"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import {
  type AiProviderType,
  type AiHealthStatus,
  type SafeAiProviderConfig,
  KNOWN_MODELS,
  DEFAULT_MODELS,
} from "@/lib/ai/types";

interface OverallHealthData {
  status: AiHealthStatus;
  activeProviderCount: number;
  defaultProvider: {
    id: string;
    displayName: string;
    providerType: AiProviderType;
    model: string;
    healthStatus: AiHealthStatus;
    lastLatencyMs: number | null;
    lastSuccessfulCheck: string | null;
    lastHealthCheck: string | null;
  } | null;
  fallbackProvider: {
    id: string;
    displayName: string;
    providerType: AiProviderType;
    model: string;
    healthStatus: AiHealthStatus;
  } | null;
  message: string;
}

interface TestFeedback {
  success: boolean;
  message: string;
  latencyMs?: number;
  availableModels?: string[];
  status?: AiHealthStatus;
  connectionTest?: {
    success: boolean;
    message: string;
    latencyMs?: number;
  };
  operationalCheck?: {
    success: boolean;
    status: "OPERATIONAL" | "QUOTA_EXHAUSTED" | "MODEL_NOT_FOUND" | "RATE_LIMITED" | "FAILED";
    message: string;
    latencyMs?: number;
  };
}

interface DiagnosticResult {
  ok: boolean;
  text?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  isFallback?: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

const PROVIDER_INFO: Record<
  AiProviderType,
  { label: string; badgeTone: "info" | "success" | "mock" | "warning" | "neutral"; placeholder: string; desc: string }
> = {
  GEMINI: { label: "Google Gemini", badgeTone: "neutral", placeholder: "AIzaSy...", desc: "Gemini 3.8 Flash & Gemini 4 Argon" },
  OPENAI: { label: "OpenAI", badgeTone: "neutral", placeholder: "sk-proj-...", desc: "GPT-6 Astra, Sol, Luna & 5.6 Cyber" },
  ANTHROPIC: { label: "Anthropic Claude", badgeTone: "neutral", placeholder: "sk-ant-api03-...", desc: "Claude Sonnet, Haiku & Opus 5.5" },
  XAI: { label: "xAI Grok", badgeTone: "neutral", placeholder: "xai-...", desc: "Grok 4.7 & Grok 2" },
  OPENAI_COMPATIBLE: { label: "OpenAI-Compatible", badgeTone: "neutral", placeholder: "Bearer token or key...", desc: "DeepSeek V3/R1, GPT-OSS 120B, Llama" },
};

export function AdminAiProvidersView({ onProviderChange }: { onProviderChange?: () => void }) {
  const [providers, setProviders] = useState<SafeAiProviderConfig[]>([]);
  const [healthData, setHealthData] = useState<OverallHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthChecking, setHealthChecking] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<SafeAiProviderConfig | null>(null);

  // Form State
  const [formType, setFormType] = useState<AiProviderType>("GEMINI");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModel, setFormModel] = useState("");
  const [customModelInput, setCustomModelInput] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formIsFallback, setFormIsFallback] = useState(false);
  const [formFallbackPriority, setFormFallbackPriority] = useState(10);
  const [showApiKeyText, setShowApiKeyText] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formSaving, setFormSaving] = useState(false);
  const [formTesting, setFormTesting] = useState(false);
  const [formTestResult, setFormTestResult] = useState<TestFeedback | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Card-specific testing states
  const [cardTestingId, setCardTestingId] = useState<string | null>(null);
  const [cardTestResults, setCardTestResults] = useState<Record<string, TestFeedback>>({});

  // Super Admin Diagnostic test state
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagnosticResult | null>(null);

  // Banner message
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [provRes, healthRes] = await Promise.all([
        fetch("/api/admin/ai/providers"),
        fetch("/api/admin/ai/health"),
      ]);

      if (provRes.ok) {
        const provData = await provRes.json();
        setProviders(provData.providers ?? []);
      }
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealthData(hData);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleRefreshHealth() {
    setHealthChecking(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/ai/health");
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
      }
    } finally {
      setHealthChecking(false);
    }
  }

  function openCreateModal() {
    setEditingProvider(null);
    setFormType("GEMINI");
    setFormDisplayName(PROVIDER_INFO.GEMINI.label);
    setFormApiKey("");
    setFormBaseUrl("");
    setFormModel(DEFAULT_MODELS.GEMINI);
    setCustomModelInput(false);
    setFormIsActive(true);
    setFormIsDefault(providers.length === 0);
    setFormIsFallback(false);
    setFormFallbackPriority(10);
    setFormTestResult(null);
    setFormError(null);
    setShowApiKeyText(false);
    setShowAdvanced(false);
    setModalOpen(true);
  }

  function openEditModal(provider: SafeAiProviderConfig) {
    setEditingProvider(provider);
    setFormType(provider.providerType);
    setFormDisplayName(provider.displayName);
    setFormApiKey(""); // Never prefill with secret
    setFormBaseUrl(provider.baseUrl || "");
    setFormModel(provider.defaultModel);
    const isPreset = (KNOWN_MODELS[provider.providerType] || []).some((m) => m.id === provider.defaultModel);
    setCustomModelInput(!isPreset);
    setFormIsActive(provider.isActive);
    setFormIsDefault(provider.isDefault);
    setFormIsFallback(provider.isDefault ? false : provider.isFallback);
    setFormFallbackPriority(provider.fallbackPriority);
    setFormTestResult(null);
    setFormError(null);
    setShowApiKeyText(false);
    setShowAdvanced(Boolean(provider.baseUrl && provider.providerType !== "OPENAI_COMPATIBLE"));
    setModalOpen(true);
  }

  function handleProviderTypeChange(newType: AiProviderType) {
    setFormType(newType);
    if (!editingProvider) {
      setFormDisplayName(PROVIDER_INFO[newType].label);
    }
    setFormModel(DEFAULT_MODELS[newType]);
    setCustomModelInput(false);
    setFormTestResult(null);
  }

  async function handleModalTest() {
    setFormTesting(true);
    setFormTestResult(null);
    setFormError(null);

    const keyToTest = formApiKey.trim();
    if (!keyToTest && !editingProvider) {
      setFormError("Enter an API key before testing connection.");
      setFormTesting(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        providerType: formType,
        model: formModel.trim() || undefined,
        baseUrl: formBaseUrl.trim() || undefined,
      };

      if (keyToTest) {
        payload.apiKey = keyToTest;
      } else if (editingProvider) {
        payload.providerId = editingProvider.id;
      }

      const res = await fetch("/api/admin/ai/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setFormTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? "Connection successful!" : "Connection failed."),
        latencyMs: data.latencyMs,
        availableModels: data.availableModels,
      });
    } catch (err: unknown) {
      setFormTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error testing connection.",
      });
    } finally {
      setFormTesting(false);
    }
  }

  async function handleSaveProvider(e: React.FormEvent) {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);

    if (!formDisplayName.trim()) {
      setFormError("Display name is required.");
      setFormSaving(false);
      return;
    }

    if (!editingProvider && !formApiKey.trim()) {
      setFormError("API key is required for new provider.");
      setFormSaving(false);
      return;
    }

    if (formType === "OPENAI_COMPATIBLE" && !formBaseUrl.trim()) {
      setFormError("Custom base URL is required for OpenAI-Compatible providers.");
      setFormSaving(false);
      return;
    }

    const modelToSave = formModel.trim() || DEFAULT_MODELS[formType];

    try {
      if (editingProvider) {
        // PATCH
        const updatePayload: Record<string, unknown> = {
          displayName: formDisplayName.trim(),
          defaultModel: modelToSave,
          baseUrl: formBaseUrl.trim() || null,
          isActive: formIsActive,
          isDefault: formIsDefault,
          isFallback: formIsDefault ? false : formIsFallback,
          fallbackPriority: formFallbackPriority,
        };

        if (formApiKey.trim()) {
          updatePayload.apiKey = formApiKey.trim();
        }

        const res = await fetch(`/api/admin/ai/providers/${editingProvider.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update provider.");
        }

        setBanner({ type: "success", text: `Updated ${formDisplayName} successfully.` });
      } else {
        // POST create
        const createPayload = {
          providerType: formType,
          displayName: formDisplayName.trim(),
          apiKey: formApiKey.trim(),
          defaultModel: modelToSave,
          baseUrl: formBaseUrl.trim() || null,
          isActive: formIsActive,
          isDefault: formIsDefault,
          isFallback: formIsDefault ? false : formIsFallback,
          fallbackPriority: formFallbackPriority,
        };

        const res = await fetch("/api/admin/ai/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPayload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to save provider.");
        }

        setBanner({ type: "success", text: `Added ${formDisplayName} successfully.` });
      }

      setModalOpen(false);
      await fetchData();
      onProviderChange?.();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleQuickTest(provider: SafeAiProviderConfig) {
    setCardTestingId(provider.id);
    try {
      const res = await fetch("/api/admin/ai/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id }),
      });

      const data = await res.json();
      setCardTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          success: Boolean(data.success),
          message: data.message || (data.success ? "Connection operational." : "Connection failed."),
          latencyMs: data.latencyMs,
          availableModels: data.availableModels,
          status: data.status,
          connectionTest: data.connectionTest,
          operationalCheck: data.operationalCheck,
        },
      }));
      await fetchData();
    } catch (err: unknown) {
      setCardTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          success: false,
          message: err instanceof Error ? err.message : "Network error during test.",
        },
      }));
    } finally {
      setCardTestingId(null);
    }
  }

  async function handleSetDefault(provider: SafeAiProviderConfig) {
    try {
      const res = await fetch(`/api/admin/ai/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });

      if (res.ok) {
        setBanner({ type: "success", text: `${provider.displayName} is now the default AI provider.` });
        await fetchData();
        onProviderChange?.();
      }
    } catch {
      setBanner({ type: "error", text: "Failed to set default provider." });
    }
  }

  async function handleDeleteProvider(provider: SafeAiProviderConfig) {
    if (!confirm(`Are you sure you want to delete "${provider.displayName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/ai/providers/${provider.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setBanner({ type: "success", text: `Deleted ${provider.displayName}.` });
        await fetchData();
        onProviderChange?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setBanner({ type: "error", text: err.error || "Failed to delete provider." });
      }
    } catch {
      setBanner({ type: "error", text: "Network error deleting provider." });
    }
  }

  async function handleRunDiagnostic() {
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const res = await fetch("/api/admin/ai/diagnostics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Verify operational status." }),
      });

      const data = await res.json();
      setDiagResult(data);
      await fetchData();
    } catch (err: unknown) {
      setDiagResult({
        ok: false,
        error: err instanceof Error ? err.message : "Diagnostic execution failed.",
      });
    } finally {
      setDiagRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-xs text-slate-400">Loading AI provider configurations…</p>
      </div>
    );
  }

  const statusToneMap: Record<AiHealthStatus, "success" | "warning" | "critical" | "neutral"> = {
    CONNECTED: "success",
    DEGRADED: "warning",
    DISCONNECTED: "critical",
    NOT_CONFIGURED: "neutral",
    UNKNOWN: "warning",
  };

  const statusLabelMap: Record<AiHealthStatus, string> = {
    CONNECTED: "Operational (Connected)",
    DEGRADED: "Degraded Performance",
    DISCONNECTED: "Disconnected",
    NOT_CONFIGURED: "Not Configured",
    UNKNOWN: "Status Unverified",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Global Status Banner */}
      {banner && (
        <div
          role="alert"
          className={`rounded-xl p-3 text-xs font-medium flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60"
              : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Live AI Health & Status Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="relative pt-1">
              <span
                className={`relative flex h-3.5 w-3.5 rounded-full ${
                  healthData?.status === "CONNECTED"
                    ? "bg-emerald-500"
                    : healthData?.status === "DEGRADED"
                    ? "bg-amber-500"
                    : healthData?.status === "DISCONNECTED"
                    ? "bg-rose-500"
                    : "bg-slate-400"
                }`}
              >
                {healthData?.status === "CONNECTED" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Multi-Provider AI Engine
                </h3>
                <Badge tone={statusToneMap[healthData?.status ?? "UNKNOWN"]}>
                  {statusLabelMap[healthData?.status ?? "UNKNOWN"]}
                </Badge>
                {healthData?.defaultProvider?.lastLatencyMs !== null && healthData?.defaultProvider?.lastLatencyMs !== undefined && (
                  <span className="text-xs font-mono text-slate-400">
                    {healthData.defaultProvider.lastLatencyMs}ms
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                {healthData?.message || "Autonomous runtime provider selection, authenticated AES-256-GCM encrypted credentials, and automated fallback routing."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span>
                  Default Provider:{" "}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {healthData?.defaultProvider?.displayName || "None"}
                  </strong>{" "}
                  ({healthData?.defaultProvider?.model || "N/A"})
                </span>
                {healthData?.fallbackProvider && (
                  <span>
                    Fallback:{" "}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {healthData.fallbackProvider.displayName}
                    </strong>{" "}
                    ({healthData.fallbackProvider.model})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshHealth}
              disabled={healthChecking}
              className="flex items-center gap-1.5"
            >
              {healthChecking ? (
                <Spinner />
              ) : (
                <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span>Check Health</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleRunDiagnostic}
              disabled={diagRunning || providers.length === 0}
              className="flex items-center gap-1.5"
            >
              {diagRunning ? (
                <>
                  <Spinner />
                  <span>Testing Runtime…</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Run Diagnostic</span>
                </>
              )}
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              className="flex items-center gap-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Provider</span>
            </Button>
          </div>
        </div>

        {/* Runtime Diagnostic Result Card */}
        {diagResult && (
          <div
            role="region"
            aria-label="Diagnostic Result"
            className={`mt-4 rounded-xl p-3.5 text-xs border ${
              diagResult.ok
                ? "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1.5">
                {diagResult.ok ? (
                  <>
                    <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>End-to-End Diagnostic Passed</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Diagnostic Failed</span>
                  </>
                )}
                {diagResult.isFallback && (
                  <Badge tone="warning">Fallback Invoked</Badge>
                )}
              </span>
              <button
                type="button"
                onClick={() => setDiagResult(null)}
                className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {diagResult.ok ? (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                <div>Provider: <span className="text-slate-900 dark:text-white font-bold">{diagResult.provider}</span></div>
                <div>Model: <span className="text-slate-900 dark:text-white font-bold">{diagResult.model}</span></div>
                <div>Latency: <span className="text-slate-900 dark:text-white">{diagResult.durationMs}ms</span></div>
                <div>Tokens: <span className="text-slate-900 dark:text-white">{diagResult.usage?.totalTokens ?? 0}</span></div>
                <div className="col-span-2 sm:col-span-4 mt-1 font-sans text-xs bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  Response: &ldquo;{diagResult.text}&rdquo;
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs">{diagResult.error}</p>
            )}
          </div>
        )}

        {/* Informative Disclosure on Provider Connectivity vs Feature Availability */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Provider connectivity confirms authenticated API reachability. Configured AI providers power keyword suggestions and site-audit recommendations; OpenSERP supplies live rankings and related search ideas when configured.
          </span>
        </div>
      </div>

      {/* Configured Providers Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Configured AI Providers ({providers.length})
          </h3>
          <span className="text-xs text-slate-400">
            Keys are encrypted at rest with AES-256-GCM
          </span>
        </div>

        {providers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No AI providers configured yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Add Google Gemini, OpenAI, Anthropic Claude, xAI Grok, or a custom OpenAI-compatible endpoint to enable platform-wide AI routing.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              className="mt-4"
            >
              Configure First Provider
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {providers.map((p) => {
              const testRes = cardTestResults[p.id];
              const isTesting = cardTestingId === p.id;

              return (
                <Card key={p.id} className="flex flex-col justify-between p-5">
                  <div>
                    {/* Top line: Name & Badges */}
                    <div className="flex items-start justify-between gap-2 pb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {p.displayName}
                          </h4>
                          {p.isDefault && (
                            <Badge tone="success">Default</Badge>
                          )}
                          {p.isFallback && (
                            <Badge tone="warning">Fallback #{p.fallbackPriority}</Badge>
                          )}
                          {!p.isActive && (
                            <Badge tone="neutral">Disabled</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                          Model: {p.defaultModel}
                        </p>
                      </div>
                      <Badge tone={PROVIDER_INFO[p.providerType]?.badgeTone || "neutral"}>
                        {PROVIDER_INFO[p.providerType]?.label || p.providerType}
                      </Badge>
                    </div>

                    {/* Metadata specs */}
                    <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-slate-400">API Key:</span>
                        <span className="text-slate-700 dark:text-slate-300">{p.maskedApiKey}</span>
                      </div>
                      {p.baseUrl && (
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-slate-400">Base URL:</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={p.baseUrl}>
                            {p.baseUrl}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Health:</span>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={statusToneMap[p.healthStatus]}>
                            {p.healthStatus}
                          </Badge>
                          {p.lastLatencyMs !== null && (
                            <span className="font-mono text-slate-400">{p.lastLatencyMs}ms</span>
                          )}
                        </div>
                      </div>
                      {p.lastErrorMessage && (
                        <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 break-words">
                          {p.lastErrorMessage}
                        </div>
                      )}
                    </div>

                    {/* Quick Test Result Feedback */}
                    {testRes && (
                      <div
                        role="alert"
                        className={`mt-3 rounded-xl p-3 text-xs border ${
                          testRes.operationalCheck?.status === "QUOTA_EXHAUSTED"
                            ? "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200 border-amber-300/80 dark:border-amber-800"
                            : testRes.status === "CONNECTED" || testRes.success
                            ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-800"
                            : "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-300 border-rose-300/80 dark:border-rose-800"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold pb-1.5 border-b border-black/5 dark:border-white/10">
                          <span className="flex items-center gap-1.5">
                            {testRes.operationalCheck?.status === "QUOTA_EXHAUSTED" ? (
                              <>
                                <svg className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Connection Active · Quota Exhausted</span>
                              </>
                            ) : testRes.success ? (
                              <>
                                <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Test & Check Passed</span>
                              </>
                            ) : (
                              <>
                                <svg className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>Test & Check Failed</span>
                              </>
                            )}
                          </span>
                          {testRes.latencyMs !== undefined && testRes.latencyMs > 0 && (
                            <span className="font-mono text-[10px] opacity-75">{testRes.latencyMs}ms</span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex items-start gap-1.5">
                            <span className="font-semibold text-slate-500 dark:text-slate-400 shrink-0 text-[11px]">
                              Connection Test:
                            </span>
                            <span className="text-[11px] font-medium leading-relaxed">
                              {testRes.connectionTest?.message || testRes.message}
                            </span>
                          </div>

                          {testRes.operationalCheck && (
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-slate-500 dark:text-slate-400 shrink-0 text-[11px]">
                                Current Status:
                              </span>
                              <span
                                className={`text-[11px] font-medium leading-relaxed ${
                                  testRes.operationalCheck.status === "QUOTA_EXHAUSTED"
                                    ? "text-amber-900 dark:text-amber-300 font-semibold"
                                    : testRes.operationalCheck.success
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-rose-700 dark:text-rose-300"
                                }`}
                              >
                                {testRes.operationalCheck.message}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickTest(p)}
                        disabled={isTesting}
                        className="flex items-center gap-1.5 cursor-pointer font-medium"
                      >
                        {isTesting ? (
                          <>
                            <Spinner />
                            <span>Testing & Checking…</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Test & Check</span>
                          </>
                        )}
                      </Button>
                      {!p.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefault(p)}
                        >
                          Make Default
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditModal(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProvider(p)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Dialog: Add / Edit Provider */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingProvider ? `Edit ${editingProvider.displayName}` : "Configure AI Provider"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure provider credentials, model selection, and routing role.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="mt-4 flex flex-col gap-4">
              {formError && (
                <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60">
                  {formError}
                </div>
              )}

              {/* 1. Provider Type & Display Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Provider
                  </label>
                  <select
                    disabled={Boolean(editingProvider)}
                    value={formType}
                    onChange={(e) => handleProviderTypeChange(e.target.value as AiProviderType)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {(Object.keys(PROVIDER_INFO) as AiProviderType[]).map((type) => (
                      <option key={type} value={type}>
                        {PROVIDER_INFO[type].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Display Name
                  </label>
                  <Input
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder={PROVIDER_INFO[formType].label}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* 2. API Key */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    API Key
                  </label>
                  {editingProvider && (
                    <span className="font-mono text-[10px] text-slate-400">
                      Active: {editingProvider.maskedApiKey}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showApiKeyText ? "text" : "password"}
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder={
                      editingProvider
                        ? "•••••••••••• (Leave empty to keep current key)"
                        : `Enter ${PROVIDER_INFO[formType].label} API key (${PROVIDER_INFO[formType].placeholder})`
                    }
                    className="font-mono text-xs pr-14"
                  />
                  {formApiKey && (
                    <button
                      type="button"
                      onClick={() => setShowApiKeyText(!showApiKeyText)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showApiKeyText ? "Hide" : "Show"}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1.5">
                  <svg className="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Encrypted server-side via AES-256-GCM. Plaintext is never exposed.</span>
                </p>
              </div>

              {/* Custom Base URL (prominently shown when custom endpoint is selected) */}
              {formType === "OPENAI_COMPATIBLE" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Endpoint URL <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="url"
                    required
                    value={formBaseUrl}
                    onChange={(e) => setFormBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com/v1 or https://api.together.xyz/v1"
                    className="font-mono text-xs"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Enter the OpenAI-compatible base URL including the /v1 path.
                  </p>
                </div>
              )}

              {/* 3. Model Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Default Model
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomModelInput(!customModelInput)}
                    className="text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    {customModelInput ? "Choose from recommended presets" : "Enter custom model ID"}
                  </button>
                </div>

                {!customModelInput ? (
                  <select
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {(KNOWN_MODELS[formType] || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.id}){m.recommended ? " — Recommended" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder="e.g. gpt-6-astra, claude-sonnet-5-5, gemini-3.8-flash, deepseek-chat"
                    className="font-mono text-xs"
                  />
                )}
              </div>

              {/* Status & Fallback Configuration */}
              <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/40 text-xs border border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded text-slate-900 focus:ring-slate-900"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Active (Ready to receive requests)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormIsDefault(checked);
                      if (checked) {
                        setFormIsFallback(false);
                      }
                    }}
                    className="rounded text-slate-900 focus:ring-slate-900"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Primary Default Provider (Selected first for all AI requests)
                  </span>
                </label>

                <label className={`flex items-center gap-2 ${formIsDefault ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={formIsFallback}
                    disabled={formIsDefault}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormIsFallback(checked);
                      if (checked) {
                        setFormIsDefault(false);
                      }
                    }}
                    className="rounded text-slate-900 focus:ring-slate-900 disabled:cursor-not-allowed"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Enable as Secondary Fallback Provider
                  </span>
                  {formIsDefault && (
                    <span className="text-[10px] text-slate-400 italic">
                      (Disabled: Primary provider cannot be its own fallback)
                    </span>
                  )}
                </label>

                {formIsFallback && !formIsDefault && (
                  <div className="ml-5 mt-1 flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Fallback Priority (0–100):</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formFallbackPriority}
                      onChange={(e) => setFormFallbackPriority(Number(e.target.value) || 0)}
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* Optional Gateway / Proxy URL for OpenAI & xAI */}
              {(formType === "OPENAI" || formType === "XAI") && (
                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer py-1"
                  >
                    <svg className={`h-3 w-3 text-slate-400 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span>Custom Gateway / Proxy URL (Optional)</span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-2.5 flex flex-col gap-2 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Custom Gateway / Proxy URL
                        </label>
                        <Input
                          type="url"
                          value={formBaseUrl}
                          onChange={(e) => setFormBaseUrl(e.target.value)}
                          placeholder="e.g. https://gateway.ai.cloudflare.com/..."
                          className="font-mono text-xs"
                        />
                        <span className="mt-1 block text-[10px] text-slate-400">
                          Optionally route requests through a custom proxy or enterprise gateway.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* In-Modal Test Result */}
              {formTestResult && (
                <div
                  role="alert"
                  className={`rounded-xl p-3 text-xs border ${
                    formTestResult.success
                      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300/80"
                      : "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-300 border-rose-300/80"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {formTestResult.success ? (
                      <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span>{formTestResult.message}</span>
                  </div>
                  {formTestResult.latencyMs !== undefined && formTestResult.latencyMs > 0 && (
                    <p className="mt-0.5 text-[10px] opacity-75">Response time: {formTestResult.latencyMs}ms</p>
                  )}
                  {formTestResult.availableModels && formTestResult.availableModels.length > 0 && (
                    <p className="mt-1 text-[10px] opacity-75">
                      Sample discoverable models: {formTestResult.availableModels.slice(0, 4).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Modal Buttons */}
              <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleModalTest}
                  disabled={formTesting || formSaving}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  {formTesting ? (
                    <>
                      <Spinner />
                      <span>Testing Key…</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                    disabled={formSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={formSaving}
                    className="flex items-center gap-1.5"
                  >
                    {formSaving ? (
                      <>
                        <Spinner />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <span>{editingProvider ? "Save Changes" : "Save Provider"}</span>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
