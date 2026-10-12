export const COMPANY_NAME_MAX_LENGTH = 150;
export const COMPANY_NAME_REQUIRED_MESSAGE = "Company name is required.";
export const COMPANY_NAME_MAX_MESSAGE = `Company name must be ${COMPANY_NAME_MAX_LENGTH} characters or fewer.`;

export function validateCompanyName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return COMPANY_NAME_REQUIRED_MESSAGE;
  }
  if (trimmed.length > COMPANY_NAME_MAX_LENGTH) {
    return COMPANY_NAME_MAX_MESSAGE;
  }
  return null;
}

/**
 * Extracts a human-readable error message from API error responses
 * (Zod flattened error objects, string messages, or fallbacks).
 */
export function formatCrmError(error: unknown, fallback = "Couldn't create company."): string {
  if (typeof error === "string" && error.trim()) return error;
  if (!error || typeof error !== "object") return fallback;

  const record = error as { formErrors?: unknown; fieldErrors?: unknown };
  if (Array.isArray(record.formErrors)) {
    const first = record.formErrors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }

  if (record.fieldErrors && typeof record.fieldErrors === "object") {
    for (const messages of Object.values(record.fieldErrors)) {
      if (!Array.isArray(messages)) continue;
      const first = messages.find((item) => typeof item === "string" && item.trim());
      if (typeof first === "string") return first;
    }
  }

  return fallback;
}
