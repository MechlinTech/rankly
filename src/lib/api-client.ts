export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

export function extractErrorMessage(data: unknown, fallback = "Request failed"): string {
  if (!data || typeof data !== "object") return fallback;

  const { error, message } = data as { error?: unknown; message?: unknown };
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof message === "string" && message.trim()) return message.trim();

  if (error && typeof error === "object") {
    const record = error as { formErrors?: unknown[]; fieldErrors?: Record<string, unknown[]> };
    if (Array.isArray(record.formErrors) && record.formErrors.length > 0) {
      const first = record.formErrors.find((e) => typeof e === "string" && e.trim());
      if (typeof first === "string") return first;
    }
    if (record.fieldErrors && typeof record.fieldErrors === "object") {
      for (const errs of Object.values(record.fieldErrors)) {
        if (!Array.isArray(errs)) continue;
        const first = errs.find((e) => typeof e === "string" && e.trim());
        if (typeof first === "string") return first;
      }
    }
  }

  return fallback;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = extractErrorMessage(data, "Request failed");
    throw new Error(message);
  }
  return res.json();
}
