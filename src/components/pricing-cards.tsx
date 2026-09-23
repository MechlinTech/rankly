import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";

const DISPLAY_ORDER: Array<keyof typeof PLANS> = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

export function PricingCards() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {DISPLAY_ORDER.map((id) => {
        const plan = PLANS[id];
        const isFeatured = id === "GROWTH";
        return (
          <div
            key={id}
            className={`flex flex-col gap-4 rounded-2xl border p-6 ${
              isFeatured
                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            }`}
          >
            <div>
              <p className={`text-sm font-semibold ${isFeatured ? "" : "text-slate-900 dark:text-white"}`}>
                {plan.name}
              </p>
              <p className="mt-2 text-3xl font-semibold">
                {plan.monthlyPriceUsd === null ? (
                  "Custom"
                ) : (
                  <>
                    ${plan.monthlyPriceUsd}
                    <span className="text-sm font-normal opacity-60">/mo</span>
                  </>
                )}
              </p>
            </div>
            <ul
              className={`flex-1 space-y-2 text-sm ${
                isFeatured ? "opacity-90" : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <li>{plan.maxTeamMembers === Number.MAX_SAFE_INTEGER ? "Unlimited" : plan.maxTeamMembers} team members</li>
              <li>{plan.maxProjects === Number.MAX_SAFE_INTEGER ? "Unlimited" : plan.maxProjects} projects</li>
              <li>{plan.maxAuditsPerMonth === Number.MAX_SAFE_INTEGER ? "Unlimited" : plan.maxAuditsPerMonth} audits / month</li>
              <li>
                {plan.maxKeywordsTracked === Number.MAX_SAFE_INTEGER
                  ? "Unlimited"
                  : plan.maxKeywordsTracked.toLocaleString()}{" "}
                keywords tracked
              </li>
            </ul>
            <Link
              href="/signup"
              className={`rounded-lg px-4 py-2 text-center text-sm font-medium ${
                isFeatured
                  ? "bg-white text-slate-900 hover:bg-slate-100 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                  : "bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              }`}
            >
              {id === "ENTERPRISE" ? "Contact sales" : "Start free"}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
