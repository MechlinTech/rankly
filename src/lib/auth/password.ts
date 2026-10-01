import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_WHITESPACE_MESSAGE =
  "Password cannot be only blank spaces. Please enter a password with at least 10 characters.";
export const PASSWORD_TOO_SHORT_MESSAGE = "Password must be at least 10 characters.";

/** Leading and trailing spaces are not part of the password. */
export function normalizePassword(password: string): string {
  return password.trim();
}

export function passwordStrengthError(password: string): string | null {
  const normalized = normalizePassword(password);
  if (!normalized) return PASSWORD_WHITESPACE_MESSAGE;
  if (normalized.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  return null;
}

export function isPasswordStrongEnough(password: string): boolean {
  return passwordStrengthError(password) === null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(normalizePassword(password), SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(normalizePassword(password), hash);
}
