import { PLANS } from "./plans";
import type { Plan } from "@/generated/prisma/client";

export function findPlanByStripePriceId(priceId: string): { plan: Plan; interval: "MONTHLY" | "ANNUAL" } | null {
  for (const def of Object.values(PLANS)) {
    if (def.stripeMonthlyPriceId === priceId) return { plan: def.id, interval: "MONTHLY" };
    if (def.stripeAnnualPriceId === priceId) return { plan: def.id, interval: "ANNUAL" };
  }
  return null;
}
