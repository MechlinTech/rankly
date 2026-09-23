import { describe, it, expect } from "vitest";
import { PLANS, getPlan } from "./plans";

describe("PLANS", () => {
  it("has a definition for every plan tier the schema supports", () => {
    expect(Object.keys(PLANS).sort()).toEqual(["ENTERPRISE", "FREE", "GROWTH", "SCALE", "STARTER"].sort());
  });

  it("each paid plan's limits strictly increase with price (no plan is worse value than a cheaper one)", () => {
    const ordered = [PLANS.FREE, PLANS.STARTER, PLANS.GROWTH, PLANS.SCALE];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(ordered[i + 1].maxTeamMembers).toBeGreaterThan(ordered[i].maxTeamMembers);
      expect(ordered[i + 1].maxProjects).toBeGreaterThan(ordered[i].maxProjects);
      expect(ordered[i + 1].maxAuditsPerMonth).toBeGreaterThan(ordered[i].maxAuditsPerMonth);
      expect(ordered[i + 1].maxKeywordsTracked).toBeGreaterThan(ordered[i].maxKeywordsTracked);
    }
  });

  it("Enterprise has no numeric limits (unlimited)", () => {
    expect(PLANS.ENTERPRISE.maxTeamMembers).toBe(Number.MAX_SAFE_INTEGER);
    expect(PLANS.ENTERPRISE.monthlyPriceUsd).toBeNull();
  });

  it("Free plan has no Stripe price IDs (it's not purchasable)", () => {
    expect(PLANS.FREE.stripeMonthlyPriceId).toBeUndefined();
    expect(PLANS.FREE.stripeAnnualPriceId).toBeUndefined();
  });

  it("getPlan returns the matching definition", () => {
    expect(getPlan("GROWTH")).toBe(PLANS.GROWTH);
  });
});
