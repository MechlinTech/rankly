import { PricingCards } from "@/components/pricing-cards";

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Pricing</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Straightforward plans that grow with your team. This pricing is a proposal for a pre-launch product —
          not connected to a live payment account yet.
        </p>
      </div>
      <div className="mt-12">
        <PricingCards />
      </div>
    </div>
  );
}
