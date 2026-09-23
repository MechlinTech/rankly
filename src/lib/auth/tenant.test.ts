import { describe, it, expect } from "vitest";
import { roleAtLeast, slugify } from "./tenant";
import type { Role } from "@/generated/prisma/client";

describe("roleAtLeast", () => {
  const ORDER: Role[] = ["VIEWER", "MEMBER", "MANAGER", "ADMIN", "OWNER"];

  it("is true when role equals the minimum", () => {
    for (const role of ORDER) {
      expect(roleAtLeast(role, role)).toBe(true);
    }
  });

  it("is true for any role above the minimum", () => {
    expect(roleAtLeast("OWNER", "VIEWER")).toBe(true);
    expect(roleAtLeast("ADMIN", "MEMBER")).toBe(true);
    expect(roleAtLeast("MANAGER", "MANAGER")).toBe(true);
  });

  it("is false for any role below the minimum", () => {
    expect(roleAtLeast("VIEWER", "OWNER")).toBe(false);
    expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
    expect(roleAtLeast("MANAGER", "OWNER")).toBe(false);
  });

  it("has no gaps in the ordering (every adjacent pair is strictly ordered)", () => {
    for (let i = 0; i < ORDER.length - 1; i++) {
      expect(roleAtLeast(ORDER[i], ORDER[i + 1])).toBe(false);
      expect(roleAtLeast(ORDER[i + 1], ORDER[i])).toBe(true);
    }
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme SEO Co")).toBe("acme-seo-co");
  });

  it("strips leading/trailing hyphens produced by punctuation", () => {
    expect(slugify("  --Weird Name!!--  ")).toBe("weird-name");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("A///B   C")).toBe("a-b-c");
  });

  it("truncates to 50 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(50);
  });

  it("returns an empty string for input that is entirely punctuation", () => {
    expect(slugify("!!!")).toBe("");
  });
});
