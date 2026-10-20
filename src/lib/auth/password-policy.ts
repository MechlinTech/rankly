export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export const PASSWORD_WHITESPACE_MESSAGE = "Password must not contain spaces.";
export const PASSWORD_TOO_SHORT_MESSAGE = "Password must be at least 10 characters.";
export const PASSWORD_TOO_LONG_MESSAGE = "Password must be 200 characters or fewer.";

/**
 * Password policy shared by client and server. Whitespace is rejected rather
 * than trimmed so the password that is validated is exactly what is hashed.
 */
export function passwordStrengthError(password: string): string | null {
  if (/\s/.test(password)) return PASSWORD_WHITESPACE_MESSAGE;
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  if (password.length > MAX_PASSWORD_LENGTH) return PASSWORD_TOO_LONG_MESSAGE;
  return null;
}

export function isPasswordStrongEnough(password: string): boolean {
  return passwordStrengthError(password) === null;
}
