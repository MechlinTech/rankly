import type { Plan } from "@/generated/prisma/client";

export interface PlanDefinition {
  id: Plan;
  name: string;
  monthlyPriceUsd: number | null;
  annualPriceUsd: number | null;
  maxTeamMembers: number;
  maxProjects: number;
  maxAuditsPerMonth: number;
  maxKeywordsTracked: number;
  stripeMonthlyPriceId?: string;
  stripeAnnualPriceId?: string;
}

// Pricing is a proposal, not something charged to real customers yet — see
// KNOWN_LIMITATIONS.md. Adjust before connecting a real Stripe account.
export const PLANS: Record<Plan, PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Free",
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    maxTeamMembers: 1,
    maxProjects: 1,
    maxAuditsPerMonth: 5,
    maxKeywordsTracked: 25,
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    monthlyPriceUsd: 49,
    annualPriceUsd: 470,
    maxTeamMembers: 3,
    maxProjects: 5,
    maxAuditsPerMonth: 30,
    maxKeywordsTracked: 250,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    monthlyPriceUsd: 129,
    annualPriceUsd: 1238,
    maxTeamMembers: 10,
    maxProjects: 20,
    maxAuditsPerMonth: 150,
    maxKeywordsTracked: 2000,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
  },
  SCALE: {
    id: "SCALE",
    name: "Scale",
    monthlyPriceUsd: 349,
    annualPriceUsd: 3350,
    maxTeamMembers: 30,
    maxProjects: 75,
    maxAuditsPerMonth: 600,
    maxKeywordsTracked: 10000,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_SCALE_ANNUAL,
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    monthlyPriceUsd: null, // custom / contact sales
    annualPriceUsd: null,
    maxTeamMembers: Number.MAX_SAFE_INTEGER,
    maxProjects: Number.MAX_SAFE_INTEGER,
    maxAuditsPerMonth: Number.MAX_SAFE_INTEGER,
    maxKeywordsTracked: Number.MAX_SAFE_INTEGER,
  },
};

export function getPlan(plan: Plan): PlanDefinition {
  return PLANS[plan];
}
