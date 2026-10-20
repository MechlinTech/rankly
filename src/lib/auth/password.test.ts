import { describe, expect, it } from "vitest";
import {
  PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_WHITESPACE_MESSAGE,
  hashPassword,
  isPasswordStrongEnough,
  passwordStrengthError,
  verifyPassword,
} from "./password";
import { messageFromApiError, signupValidationMessage, SIGNUP_DUPLICATE_EMAIL } from "./signup-validation";

describe("password strength", () => {
  it("rejects a password made only of spaces, even when it is 10 characters or longer", () => {
    expect(passwordStrengthError("          ")).toBe(PASSWORD_WHITESPACE_MESSAGE);
    expect(isPasswordStrongEnough("          ")).toBe(false);
  });

  it("does not count surrounding spaces toward the 10 character minimum", () => {
    expect(passwordStrengthError("short     ")).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    expect(isPasswordStrongEnough("password1 ")).toBe(false);
  });

  it("accepts a 10 character password and keeps internal spaces", () => {
    expect(passwordStrengthError("password12")).toBeNull();
    expect(isPasswordStrongEnough("pass word1")).toBe(true);
  });

  it("treats tabs and newlines as blank spaces, not as password characters", () => {
    expect(passwordStrengthError("\t \n \r\n     ")).toBe(PASSWORD_WHITESPACE_MESSAGE);
  });

  it("ignores surrounding whitespace but hashes embedded spaces exactly", async () => {
    const hash = await hashPassword("  pass word1  ");

    expect(await verifyPassword("pass word1", hash)).toBe(true);
    expect(await verifyPassword("  pass word1  ", hash)).toBe(true);
    expect(await verifyPassword("password1", hash)).toBe(false);
  });
});

describe("signup validation messages", () => {
  const valid = {
    name: "Ada Lovelace",
    companyName: "Analytical Engines",
    email: "ada@example.com",
    password: "password12",
  };

  it("names the name field when it is blank or only spaces", () => {
    expect(signupValidationMessage({ ...valid, name: "   " })).toBe(
      "Name is required. Please enter your name."
    );
    expect(signupValidationMessage({ ...valid, name: "" })).toBe(
      "Name is required. Please enter your name."
    );
  });

  it("names company and email when those fields are blank", () => {
    expect(signupValidationMessage({ ...valid, companyName: " " })).toBe(
      "Company name is required. Please enter your company name."
    );
    expect(signupValidationMessage({ ...valid, email: "   " })).toBe(
      "Email is required. Please enter a valid email address."
    );
  });

  it("rejects a spaces-only password during signup", () => {
    expect(signupValidationMessage({ ...valid, password: "          " })).toBe(
      PASSWORD_WHITESPACE_MESSAGE
    );
  });

  it("accepts an embedded space and ignores surrounding whitespace during signup", () => {
    expect(signupValidationMessage({ ...valid, password: "pass word1" })).toBeNull();
    expect(signupValidationMessage({ ...valid, password: "  pass word1  " })).toBeNull();
  });

  it("reads the first field error instead of a generic fallback", () => {
    expect(
      messageFromApiError(
        { formErrors: [], fieldErrors: { name: ["Name is required. Please enter your name."] } },
        "Please check your details and try again."
      )
    ).toBe("Name is required. Please enter your name.");
  });

  it("reads the duplicate-email error from formErrors or fieldErrors", () => {
    expect(
      messageFromApiError(
        { formErrors: [SIGNUP_DUPLICATE_EMAIL] },
        "Please check your details and try again."
      )
    ).toBe(SIGNUP_DUPLICATE_EMAIL);

    expect(
      messageFromApiError(
        { formErrors: [], fieldErrors: { email: [SIGNUP_DUPLICATE_EMAIL] } },
        "Please check your details and try again."
      )
    ).toBe(SIGNUP_DUPLICATE_EMAIL);
  });
});
