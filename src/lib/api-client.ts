export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
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
    const message = typeof data?.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }
  return res.json();
}
