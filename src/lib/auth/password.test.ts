import { describe, expect, it } from "vitest";
import {
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_WHITESPACE_MESSAGE,
  hashPassword,
  isPasswordStrongEnough,
  passwordStrengthError,
  verifyPassword,
} from "./password";
import { messageFromApiError, signupValidationMessage, SIGNUP_DUPLICATE_EMAIL } from "./signup-validation";

describe("password strength", () => {
  it("rejects leading, trailing, and internal whitespace with the exact message", () => {
    const invalidPasswords = [
      " password12",
      "password12 ",
      "pass word1",
      "pass\tword1",
      "pass\nword1",
      "pass\u00a0word1",
      "          ",
    ];

    for (const password of invalidPasswords) {
      expect(passwordStrengthError(password)).toBe(PASSWORD_WHITESPACE_MESSAGE);
      expect(isPasswordStrongEnough(password)).toBe(false);
    }
  });

  it("checks whitespace before the length requirement", () => {
    expect(passwordStrengthError(" short     ")).toBe(PASSWORD_WHITESPACE_MESSAGE);
  });

  it("accepts passwords without whitespace", () => {
    expect(passwordStrengthError("password12")).toBeNull();
    expect(passwordStrengthError("correct-horse-battery")).toBeNull();
    expect(isPasswordStrongEnough("password12")).toBe(true);
  });

  it("preserves the minimum and maximum length requirements", () => {
    expect(passwordStrengthError("short")).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    expect(passwordStrengthError("a".repeat(201))).toBe(PASSWORD_TOO_LONG_MESSAGE);
    expect(passwordStrengthError("a".repeat(200))).toBeNull();
  });

  it("hashes and verifies the exact password without trimming it", async () => {
    const hash = await hashPassword("password12");

    expect(await verifyPassword("password12", hash)).toBe(true);
    expect(await verifyPassword(" password12", hash)).toBe(false);
    expect(await verifyPassword("password12 ", hash)).toBe(false);
    expect(await verifyPassword("pass word1", hash)).toBe(false);
  });

  it("refuses to hash a password containing whitespace", async () => {
    await expect(hashPassword(" pass word1 ")).rejects.toThrow(PASSWORD_WHITESPACE_MESSAGE);
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

  it("rejects any whitespace in a signup password", () => {
    for (const password of [" password12", "password12 ", "pass word1", "pass\tword1"]) {
      expect(signupValidationMessage({ ...valid, password })).toBe(PASSWORD_WHITESPACE_MESSAGE);
    }
  });

  it("accepts a valid signup password", () => {
    expect(signupValidationMessage(valid)).toBeNull();
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
