import { describe, it, expect } from "vitest";
import {
  validateCompanyName,
  validateCompanyDomain,
  validateCompanyNotes,
  validateContactName,
  validateContactEmail,
  validateContactPhone,
  validateContactTitle,
  validateTaskTitle,
  validateActivityBody,
  formatCrmError,
  contactFieldErrorsFromApi,
  cleanDomain,
  COMPANY_NAME_REQUIRED_MESSAGE,
  COMPANY_NAME_MAX_MESSAGE,
  COMPANY_DOMAIN_INVALID_MESSAGE,
  CONTACT_NAME_REQUIRED_MESSAGE,
  CONTACT_NAME_MAX_MESSAGE,
  CONTACT_EMAIL_INVALID_MESSAGE,
  CONTACT_PHONE_INVALID_MESSAGE,
  TASK_TITLE_REQUIRED_MESSAGE,
  TASK_TITLE_MAX_MESSAGE,
  ACTIVITY_BODY_REQUIRED_MESSAGE,
  ACTIVITY_BODY_MAX_MESSAGE,
} from "./validation";

describe("CRM Validation", () => {
  describe("validateCompanyName", () => {
    it("rejects empty or whitespace-only name", () => {
      expect(validateCompanyName("")).toBe(COMPANY_NAME_REQUIRED_MESSAGE);
      expect(validateCompanyName("   ")).toBe(COMPANY_NAME_REQUIRED_MESSAGE);
    });

    it("rejects name longer than 150 characters", () => {
      expect(validateCompanyName("a".repeat(151))).toBe(COMPANY_NAME_MAX_MESSAGE);
    });

    it("accepts valid names", () => {
      expect(validateCompanyName("Acme Corp")).toBeNull();
      expect(validateCompanyName("a".repeat(150))).toBeNull();
    });
  });

  describe("validateCompanyDomain and cleanDomain", () => {
    it("accepts empty or whitespace domain as optional", () => {
      expect(validateCompanyDomain("")).toBeNull();
      expect(validateCompanyDomain("   ")).toBeNull();
    });

    it("accepts valid domain names with or without protocol", () => {
      expect(validateCompanyDomain("acme.com")).toBeNull();
      expect(validateCompanyDomain("https://app.rankly.dev")).toBeNull();
      expect(validateCompanyDomain("sub.domain.co.uk")).toBeNull();
    });

    it("rejects invalid domains", () => {
      expect(validateCompanyDomain("not a domain")).toBe(COMPANY_DOMAIN_INVALID_MESSAGE);
      expect(validateCompanyDomain("invalid..com")).toBe(COMPANY_DOMAIN_INVALID_MESSAGE);
    });

    it("cleanDomain strips protocol and trailing slashes", () => {
      expect(cleanDomain("https://acme.com/")).toBe("acme.com");
      expect(cleanDomain("http://sub.domain.io")).toBe("sub.domain.io");
    });
  });

  describe("validateCompanyNotes", () => {
    it("accepts empty notes", () => {
      expect(validateCompanyNotes("")).toBeNull();
    });

    it("rejects notes exceeding 5000 characters", () => {
      expect(validateCompanyNotes("x".repeat(5001))).toContain("5000");
    });
  });

  describe("validateContactName", () => {
    it("rejects empty name", () => {
      expect(validateContactName("")).toBe(CONTACT_NAME_REQUIRED_MESSAGE);
      expect(validateContactName("   ")).toBe(CONTACT_NAME_REQUIRED_MESSAGE);
    });

    it("rejects name exceeding 200 characters", () => {
      expect(validateContactName("n".repeat(201))).toBe(CONTACT_NAME_MAX_MESSAGE);
    });

    it("accepts valid contact name", () => {
      expect(validateContactName("Jane Doe")).toBeNull();
    });
  });

  describe("validateContactEmail", () => {
    it("accepts empty email as optional", () => {
      expect(validateContactEmail("")).toBeNull();
      expect(validateContactEmail("  ")).toBeNull();
    });

    it("accepts valid email", () => {
      expect(validateContactEmail("test@example.com")).toBeNull();
    });

    it("rejects invalid email formats", () => {
      expect(validateContactEmail("not-an-email")).toBe(CONTACT_EMAIL_INVALID_MESSAGE);
      expect(validateContactEmail("user@domain")).toBe(CONTACT_EMAIL_INVALID_MESSAGE);
    });
  });

  describe("validateContactPhone", () => {
    it("accepts empty phone as optional", () => {
      expect(validateContactPhone("")).toBeNull();
    });

    it("accepts valid phone numbers in common written formats", () => {
      expect(validateContactPhone("+1 (555) 019-2834")).toBeNull();
      expect(validateContactPhone("555-1234")).toBeNull();
      expect(validateContactPhone("+44 20 7946 0912")).toBeNull();
      expect(validateContactPhone("123.456.7890")).toBeNull();
      expect(validateContactPhone("(555) 019-2834")).toBeNull();
      expect(validateContactPhone("123456789012345")).toBeNull(); // E.164 maximum
    });

    it("rejects numbers outside the 7-15 digit range", () => {
      expect(validateContactPhone("123456")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("1234567890123456")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
    });

    it("rejects invalid characters and malformed formatting", () => {
      expect(validateContactPhone("abc")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("123/456/7890")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("123456\n7")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("123456\t7")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("+1 (555) 019-2834 ext 12")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("+() 1234567")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("(555 019-2834")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("555) 019-2834")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("1234567--")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("--1234567")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("12..34567")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
      expect(validateContactPhone("1234567+")).toBe(CONTACT_PHONE_INVALID_MESSAGE);
    });
  });

  describe("validateContactTitle", () => {
    it("accepts empty title as optional", () => {
      expect(validateContactTitle("")).toBeNull();
    });

    it("rejects title exceeding 120 chars", () => {
      expect(validateContactTitle("t".repeat(121))).toContain("120");
    });
  });

  describe("validateTaskTitle", () => {
    it("rejects empty title", () => {
      expect(validateTaskTitle("")).toBe(TASK_TITLE_REQUIRED_MESSAGE);
      expect(validateTaskTitle("   ")).toBe(TASK_TITLE_REQUIRED_MESSAGE);
    });

    it("rejects title exceeding 200 characters", () => {
      expect(validateTaskTitle("t".repeat(201))).toBe(TASK_TITLE_MAX_MESSAGE);
    });

    it("accepts valid task title", () => {
      expect(validateTaskTitle("Schedule demo call")).toBeNull();
    });
  });

  describe("validateActivityBody", () => {
    it("rejects empty activity body", () => {
      expect(validateActivityBody("")).toBe(ACTIVITY_BODY_REQUIRED_MESSAGE);
      expect(validateActivityBody("   ")).toBe(ACTIVITY_BODY_REQUIRED_MESSAGE);
    });

    it("rejects body exceeding 5000 characters", () => {
      expect(validateActivityBody("b".repeat(5001))).toBe(ACTIVITY_BODY_MAX_MESSAGE);
    });

    it("accepts valid activity note", () => {
      expect(validateActivityBody("Discussed Q4 roadmap.")).toBeNull();
    });
  });

  describe("contactFieldErrorsFromApi", () => {
    it("maps server field errors to their matching contact fields", () => {
      expect(
        contactFieldErrorsFromApi({
          formErrors: [],
          fieldErrors: {
            name: ["Name is required."],
            email: ["Invalid email."],
            phone: ["Invalid phone."],
            title: ["Title is too long."],
          },
        })
      ).toEqual({
        name: "Name is required.",
        email: "Invalid email.",
        phone: "Invalid phone.",
        title: "Title is too long.",
      });
    });

    it("keeps form-level errors in general", () => {
      expect(
        contactFieldErrorsFromApi({ formErrors: ["Company not found."], fieldErrors: {} }, "Fallback")
      ).toEqual({ general: "Company not found." });
      expect(contactFieldErrorsFromApi("Network error", "Fallback")).toEqual({
        general: "Network error",
      });
    });

    it("falls back to general for unmapped field errors", () => {
      expect(
        contactFieldErrorsFromApi(
          { formErrors: [], fieldErrors: { companyId: ["Company not found."] } },
          "Fallback"
        )
      ).toEqual({ general: "Company not found." });
    });
  });

  describe("formatCrmError", () => {
    it("formats string errors", () => {
      expect(formatCrmError("Network failure")).toBe("Network failure");
    });

    it("extracts from formErrors", () => {
      expect(formatCrmError({ formErrors: ["First error"] })).toBe("First error");
    });

    it("extracts from fieldErrors", () => {
      expect(formatCrmError({ fieldErrors: { email: ["Invalid email"] } })).toBe("Invalid email");
    });

    it("falls back to default message", () => {
      expect(formatCrmError(null, "Fallback message")).toBe("Fallback message");
    });
  });
});
