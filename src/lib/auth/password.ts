import bcrypt from "bcryptjs";
import { passwordStrengthError } from "./password-policy";

export {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_WHITESPACE_MESSAGE,
  isPasswordStrongEnough,
  passwordStrengthError,
} from "./password-policy";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  const error = passwordStrengthError(password);
  if (error) throw new Error(error);
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
