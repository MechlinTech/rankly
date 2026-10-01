import { passwordStrengthError } from "./password";

export const SIGNUP_NAME_REQUIRED = "Name is required. Please enter your name.";
export const SIGNUP_COMPANY_REQUIRED = "Company name is required. Please enter your company name.";
export const SIGNUP_EMAIL_REQUIRED = "Email is required. Please enter a valid email address.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function signupValidationMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return SIGNUP_NAME_REQUIRED;
  }

  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const companyName = typeof record.companyName === "string" ? record.companyName.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";

  if (!name) return SIGNUP_NAME_REQUIRED;
  if (name.length > 120) return "Name must be 120 characters or fewer.";
  if (!companyName) return SIGNUP_COMPANY_REQUIRED;
  if (companyName.length > 120) return "Company name must be 120 characters or fewer.";
  if (!email || !EMAIL_PATTERN.test(email)) return SIGNUP_EMAIL_REQUIRED;
  if (email.length > 255) return SIGNUP_EMAIL_REQUIRED;

  const passwordError = passwordStrengthError(password);
  if (passwordError) return passwordError;
  if (password.trim().length > 200) return "Password must be 200 characters or fewer.";

  return null;
}

/** Turns Zod flatten() payloads and string API errors into one sentence. */
export function messageFromApiError(error: unknown, fallback: string): string {
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
