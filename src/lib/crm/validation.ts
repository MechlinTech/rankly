export const COMPANY_NAME_MAX_LENGTH = 150;
export const COMPANY_NAME_REQUIRED_MESSAGE = "Company name is required.";
export const COMPANY_NAME_MAX_MESSAGE = `Company name must be ${COMPANY_NAME_MAX_LENGTH} characters or fewer.`;

export const COMPANY_DOMAIN_MAX_LENGTH = 255;
export const COMPANY_DOMAIN_INVALID_MESSAGE = "Please enter a valid domain (e.g. acme.com or https://acme.com).";
export const COMPANY_DOMAIN_MAX_MESSAGE = `Domain must be ${COMPANY_DOMAIN_MAX_LENGTH} characters or fewer.`;

export const COMPANY_NOTES_MAX_LENGTH = 5000;
export const COMPANY_NOTES_MAX_MESSAGE = `Notes must be ${COMPANY_NOTES_MAX_LENGTH} characters or fewer.`;

export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_NAME_REQUIRED_MESSAGE = "Contact name is required.";
export const CONTACT_NAME_MAX_MESSAGE = `Contact name must be ${CONTACT_NAME_MAX_LENGTH} characters or fewer.`;

export const CONTACT_EMAIL_MAX_LENGTH = 255;
export const CONTACT_EMAIL_INVALID_MESSAGE = "Please enter a valid email address.";
export const CONTACT_EMAIL_MAX_MESSAGE = `Email must be ${CONTACT_EMAIL_MAX_LENGTH} characters or fewer.`;

export const CONTACT_PHONE_MAX_LENGTH = 50;
export const CONTACT_PHONE_INVALID_MESSAGE = "Please enter a valid phone number.";
export const CONTACT_PHONE_MAX_MESSAGE = `Phone number must be ${CONTACT_PHONE_MAX_LENGTH} characters or fewer.`;

export const CONTACT_TITLE_MAX_LENGTH = 120;
export const CONTACT_TITLE_MAX_MESSAGE = `Job title must be ${CONTACT_TITLE_MAX_LENGTH} characters or fewer.`;

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_TITLE_REQUIRED_MESSAGE = "Task title is required.";
export const TASK_TITLE_MAX_MESSAGE = `Task title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`;

export const ACTIVITY_BODY_MAX_LENGTH = 5000;
export const ACTIVITY_BODY_REQUIRED_MESSAGE = "Activity content is required.";
export const ACTIVITY_BODY_MAX_MESSAGE = `Activity content must be ${ACTIVITY_BODY_MAX_LENGTH} characters or fewer.`;

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

const DOMAIN_PATTERN = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d{1,5})?(\/.*)?$/;

export function cleanDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export function validateCompanyDomain(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed) return null; // Domain is optional
  if (trimmed.length > COMPANY_DOMAIN_MAX_LENGTH) {
    return COMPANY_DOMAIN_MAX_MESSAGE;
  }
  const normalized = cleanDomain(trimmed);
  if (!DOMAIN_PATTERN.test(normalized) && !DOMAIN_PATTERN.test(trimmed)) {
    return COMPANY_DOMAIN_INVALID_MESSAGE;
  }
  return null;
}

export function validateCompanyNotes(notes: string): string | null {
  const trimmed = notes.trim();
  if (!trimmed) return null; // Notes are optional
  if (trimmed.length > COMPANY_NOTES_MAX_LENGTH) {
    return COMPANY_NOTES_MAX_MESSAGE;
  }
  return null;
}

export function validateContactName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return CONTACT_NAME_REQUIRED_MESSAGE;
  }
  if (trimmed.length > CONTACT_NAME_MAX_LENGTH) {
    return CONTACT_NAME_MAX_MESSAGE;
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null; // Email is optional
  if (!EMAIL_PATTERN.test(trimmed) || trimmed.length > CONTACT_EMAIL_MAX_LENGTH) {
    return CONTACT_EMAIL_INVALID_MESSAGE;
  }
  return null;
}

const PHONE_CHARS_PATTERN = /^[+]?[\d\s\-()./]{3,50}$/;

export function validateContactPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null; // Phone is optional
  if (trimmed.length > CONTACT_PHONE_MAX_LENGTH) {
    return CONTACT_PHONE_MAX_MESSAGE;
  }
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length < 3 || digitsOnly.length > 20 || !PHONE_CHARS_PATTERN.test(trimmed)) {
    return CONTACT_PHONE_INVALID_MESSAGE;
  }
  return null;
}

export function validateContactTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null; // Title is optional
  if (trimmed.length > CONTACT_TITLE_MAX_LENGTH) {
    return CONTACT_TITLE_MAX_MESSAGE;
  }
  return null;
}

export function validateTaskTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return TASK_TITLE_REQUIRED_MESSAGE;
  }
  if (trimmed.length > TASK_TITLE_MAX_LENGTH) {
    return TASK_TITLE_MAX_MESSAGE;
  }
  return null;
}

export function validateActivityBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return ACTIVITY_BODY_REQUIRED_MESSAGE;
  }
  if (trimmed.length > ACTIVITY_BODY_MAX_LENGTH) {
    return ACTIVITY_BODY_MAX_MESSAGE;
  }
  return null;
}

/**
 * Extracts a human-readable error message from API error responses
 * (Zod flattened error objects, string messages, or fallbacks).
 */
export function formatCrmError(error: unknown, fallback = "Couldn't complete request."): string {
  if (typeof error === "string" && error.trim()) return error;
  if (!error || typeof error !== "object") return fallback;

  const record = error as { formErrors?: unknown; fieldErrors?: unknown; error?: unknown };
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }

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
